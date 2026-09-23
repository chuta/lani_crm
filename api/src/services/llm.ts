/**
 * Model config + JSON completion for Account Intelligence Brief.
 * Keys stay on the API. Never import this from the Vue client.
 * Logs never include the API key or request/response bodies.
 */

export type AiProvider = 'openai';

export interface AiConfig {
  provider: AiProvider;
  apiKey: string;
  baseUrl?: string;
  model: string;
  timeoutMs: number;
}

export interface JsonCompletion {
  json: unknown;
  raw: string;
  model: string;
  provider: AiProvider;
}

const SUPPORTED: AiProvider[] = ['openai'];
const DEFAULT_TIMEOUT_MS = 45_000;
const DEFAULT_BASE = 'https://api.openai.com/v1';

export class AiNotConfiguredError extends Error {
  readonly status = 503;
  constructor(message: string) {
    super(message);
    this.name = 'AiNotConfiguredError';
  }
}

export class AiRequestError extends Error {
  readonly status: number;
  constructor(message: string, status = 502) {
    super(message);
    this.name = 'AiRequestError';
    this.status = status;
  }
}

function parseTimeoutMs(): number {
  const raw = Number(process.env.OPENAI_TIMEOUT_MS);
  if (Number.isFinite(raw) && raw >= 5_000 && raw <= 120_000) return Math.round(raw);
  return DEFAULT_TIMEOUT_MS;
}

export function getAiConfig(): { ok: true; config: AiConfig } | { ok: false; error: string } {
  const raw = String(process.env.AI_PROVIDER || 'openai').trim().toLowerCase();
  if (!SUPPORTED.includes(raw as AiProvider)) {
    return {
      ok: false,
      error: `Unsupported AI_PROVIDER "${raw}". Use openai.`,
    };
  }

  const apiKey = String(process.env.OPENAI_API_KEY || '').trim();
  if (!apiKey) {
    return {
      ok: false,
      error: 'OPENAI_API_KEY is not set on the API. Research cannot run.',
    };
  }

  const baseUrl = String(process.env.OPENAI_BASE_URL || '').trim() || undefined;
  const model = String(process.env.OPENAI_MODEL || '').trim() || 'gpt-4o-mini';

  return {
    ok: true,
    config: {
      provider: 'openai',
      apiKey,
      baseUrl,
      model,
      timeoutMs: parseTimeoutMs(),
    },
  };
}

export function aiPublicStatus(): { configured: boolean; provider: string; model?: string } {
  const resolved = getAiConfig();
  if (!resolved.ok) {
    return { configured: false, provider: String(process.env.AI_PROVIDER || 'openai').trim() || 'openai' };
  }
  return {
    configured: true,
    provider: resolved.config.provider,
    model: resolved.config.model,
  };
}

/** Returns false after writing 503. Callers must return immediately. */
export function requireAiConfigured(res: { status: (code: number) => { json: (body: unknown) => void } }): boolean {
  const resolved = getAiConfig();
  if (resolved.ok) return true;
  res.status(503).json({
    error: 'ai_not_configured',
    message: resolved.error,
  });
  return false;
}

function completionsUrl(baseUrl?: string): string {
  const root = (baseUrl || DEFAULT_BASE).replace(/\/$/, '');
  return root.endsWith('/chat/completions') ? root : `${root}/chat/completions`;
}

/** Strip anything that looks like a provider secret from a log line. */
function safeLog(message: string): string {
  return message.replace(/(sk-[A-Za-z0-9_-]{8,})|(Bearer\s+\S+)/gi, '[redacted]');
}

/**
 * One JSON object from the model. Throws AiNotConfiguredError or AiRequestError.
 */
export async function completeJson(
  system: string,
  user: string,
  options?: { timeoutMs?: number }
): Promise<JsonCompletion> {
  const resolved = getAiConfig();
  if (!resolved.ok) throw new AiNotConfiguredError(resolved.error);

  const { config } = resolved;
  const timeoutMs = options?.timeoutMs ?? config.timeoutMs;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = Date.now();
  const url = completionsUrl(config.baseUrl);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: config.model,
        temperature: 0.2,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      }),
      signal: controller.signal,
    });

    const ms = Date.now() - started;
    if (!res.ok) {
      console.error(safeLog(`[ai] completeJson failed status=${res.status} model=${config.model} ${ms}ms`));
      throw new AiRequestError(`Model request failed (${res.status})`, res.status >= 400 && res.status < 600 ? res.status : 502);
    }

    const data = await res.json() as {
      model?: string;
      choices?: { message?: { content?: string | null } }[];
    };
    const raw = data.choices?.[0]?.message?.content;
    if (typeof raw !== 'string' || !raw.trim()) {
      console.error(`[ai] completeJson empty body model=${config.model} ${ms}ms`);
      throw new AiRequestError('Model returned an empty response', 502);
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      console.error(`[ai] completeJson invalid JSON model=${config.model} ${ms}ms`);
      throw new AiRequestError('Model did not return valid JSON', 502);
    }

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new AiRequestError('Model JSON must be an object', 502);
    }

    console.log(`[ai] completeJson ok model=${config.model} ${ms}ms`);
    return {
      json: parsed,
      raw,
      model: data.model || config.model,
      provider: config.provider,
    };
  } catch (e: any) {
    if (e instanceof AiNotConfiguredError || e instanceof AiRequestError) throw e;
    if (e?.name === 'AbortError') {
      console.error(`[ai] completeJson timeout model=${config.model} after ${timeoutMs}ms`);
      throw new AiRequestError(`Model request timed out after ${timeoutMs}ms`, 504);
    }
    console.error(safeLog(`[ai] completeJson error model=${config.model} name=${e?.name || 'Error'}`));
    throw new AiRequestError('Model request failed', 502);
  } finally {
    clearTimeout(timer);
  }
}
