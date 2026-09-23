/**
 * Optional public-page fetch for Account Intelligence Brief.
 * http(s) only, 15s timeout, 100KB text after HTML strip. No login walls.
 */

export const SOURCE_TIMEOUT_MS = 15_000;
export const SOURCE_TEXT_CAP = 100_000;
const MAX_REDIRECTS = 3;
const DOWNLOAD_CAP = 250_000;

export interface SourceFetchOk {
  ok: true;
  url: string;
  excerpt: string;
  content_type: string | null;
  truncated: boolean;
}

export interface SourceFetchFail {
  ok: false;
  url: string;
  error: string;
}

export type SourceFetchResult = SourceFetchOk | SourceFetchFail;

const BLOCKED_HOSTS = new Set([
  'localhost',
  'localhost.localdomain',
  '127.0.0.1',
  '0.0.0.0',
  '::1',
  'metadata.google.internal',
]);

function fail(url: string, error: string): SourceFetchFail {
  return { ok: false, url, error };
}

function isBlockedIpv4(host: string): boolean {
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  if (a === 10 || a === 127 || a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  return false;
}

export function assertPublicHttpUrl(raw: string): { ok: true; url: URL } | { ok: false; error: string } {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return { ok: false, error: 'source_url is empty' };
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { ok: false, error: 'source_url is not a valid URL' };
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { ok: false, error: 'source_url must be http or https' };
  }
  const host = parsed.hostname.toLowerCase();
  if (BLOCKED_HOSTS.has(host) || host.endsWith('.localhost') || host.endsWith('.local')) {
    return { ok: false, error: 'source_url must be a public page' };
  }
  if (isBlockedIpv4(host) || host.includes(':')) {
    return { ok: false, error: 'source_url must be a public page' };
  }
  return { ok: true, url: parsed };
}

function looksLikeLoginWall(status: number, location: string | null, body: string, contentType: string | null): boolean {
  if (status === 401 || status === 403) return true;
  const loc = (location || '').toLowerCase();
  if (/(^|[/?#])(login|signin|sign-in|auth|sso|oauth)([/?#]|$)/i.test(loc)) return true;
  const type = (contentType || '').toLowerCase();
  if (type.includes('html') || type.includes('text')) {
    const sample = body.slice(0, 20_000).toLowerCase();
    if (sample.includes('type="password"') || sample.includes("type='password'")) return true;
    if (sample.includes('name="password"') || sample.includes("name='password'")) return true;
  }
  return false;
}

function stripHtml(html: string): string {
  let text = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
  text = text.replace(/\s+/g, ' ').trim();
  return text;
}

async function readCapped(res: Response): Promise<string> {
  if (!res.body) {
    const text = await res.text();
    return text.slice(0, DOWNLOAD_CAP);
  }
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    chunks.push(value);
    total += value.byteLength;
    if (total >= DOWNLOAD_CAP) {
      try { await reader.cancel(); } catch { /* ignore */ }
      break;
    }
  }
  const merged = new Uint8Array(Math.min(total, DOWNLOAD_CAP));
  let offset = 0;
  for (const chunk of chunks) {
    const take = Math.min(chunk.byteLength, merged.byteLength - offset);
    merged.set(chunk.subarray(0, take), offset);
    offset += take;
    if (offset >= merged.byteLength) break;
  }
  return new TextDecoder('utf-8', { fatal: false }).decode(merged);
}

export async function fetchSourceExcerpt(rawUrl: string): Promise<SourceFetchResult> {
  const checked = assertPublicHttpUrl(rawUrl);
  if (!checked.ok) return fail(String(rawUrl || '').trim(), checked.error);

  let current = checked.url;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SOURCE_TIMEOUT_MS);

  try {
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      const res = await fetch(current.href, {
        method: 'GET',
        redirect: 'manual',
        signal: controller.signal,
        headers: {
          Accept: 'text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.1',
          'User-Agent': 'LANI-AccountBrief/1.0',
        },
      });

      const location = res.headers.get('location');
      if (res.status >= 300 && res.status < 400 && location) {
        if (hop === MAX_REDIRECTS) return fail(current.href, 'Too many redirects');
        let next: URL;
        try {
          next = new URL(location, current);
        } catch {
          return fail(current.href, 'Invalid redirect');
        }
        const nextCheck = assertPublicHttpUrl(next.href);
        if (!nextCheck.ok) return fail(current.href, 'Redirect is not a public http(s) page');
        if (looksLikeLoginWall(res.status, location, '', null)) {
          return fail(current.href, 'Skipped a login wall');
        }
        current = nextCheck.url;
        continue;
      }

      const contentType = res.headers.get('content-type');
      const raw = await readCapped(res);

      if (looksLikeLoginWall(res.status, location, raw, contentType)) {
        return fail(current.href, 'Skipped a login wall');
      }
      if (!res.ok) {
        return fail(current.href, `Page returned ${res.status}`);
      }

      const type = (contentType || '').toLowerCase();
      if (type && !type.includes('html') && !type.includes('text') && !type.includes('xml') && !type.includes('json')) {
        return fail(current.href, 'Page is not readable text');
      }

      const excerpt = stripHtml(raw);
      if (!excerpt) return fail(current.href, 'Page had no readable text');

      const truncated = excerpt.length > SOURCE_TEXT_CAP;
      return {
        ok: true,
        url: current.href,
        excerpt: truncated ? excerpt.slice(0, SOURCE_TEXT_CAP) : excerpt,
        content_type: contentType,
        truncated,
      };
    }
    return fail(current.href, 'Too many redirects');
  } catch (e: any) {
    if (e?.name === 'AbortError') {
      return fail(current.href, `Fetch timed out after ${SOURCE_TIMEOUT_MS / 1000}s`);
    }
    return fail(current.href, 'Could not fetch the page');
  } finally {
    clearTimeout(timer);
  }
}
