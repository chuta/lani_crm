/**
 * Commercial Case — validate catalog IDs, generate drafts, apply accepted sections.
 * No CPO / $GIFT / claims. No stage advance. No invented naira.
 */

import { randomUUID } from 'node:crypto';
import db from '../db.js';
import {
  CASE_APPLY_ACCOUNT_FIELDS,
  CASE_DRAFT_KEYS,
  CASE_FORBIDDEN_ACCOUNT_FIELDS,
  CASE_SECTIONS,
  LANI_CAPABILITIES,
  LANI_FEE_BANDS,
  canGenerateCommercialCase,
  conversionStageLabel,
  defaultAskForStage,
  isCaseAskId,
  isCaseSectionId,
  isCommercialModelId,
  isFeeBandId,
  type CaseAskId,
  type CaseSectionId,
  type FeeBandCatalogEntry,
} from '../catalog.js';
import { getLatestAppliedBrief } from './account-brief.js';
import { buildCaseSystemPrompt, buildCaseUserPrompt } from './commercial-case-prompt.js';
import { listFeeBands } from './fee-bands.js';
import { AiNotConfiguredError, AiRequestError, completeJson } from './llm.js';
import { fetchSourceExcerpt } from './source-fetch.js';
import { shapeAccount, updateAccount } from './account-book.js';

export const CASE_STATUSES = ['draft', 'applied', 'discarded'] as const;
export type CaseStatus = (typeof CASE_STATUSES)[number];

export interface CaseDraft {
  headline: string | null;
  situation: string | null;
  why_now: string | null;
  why_lani: string | null;
  scope_workstreams: string[];
  commercial_model: string | null;
  fee_band_id: string | null;
  fee_rationale: string | null;
  consortium_required: boolean;
  consortium_roles: string[];
  risks: string[];
  ask_id: string | null;
  ask_text: string | null;
  caveats: string[];
  sources: string[];
  dropped: string[];
}

export interface CommercialCaseRecord {
  id: string;
  account_id: string;
  status: CaseStatus;
  payload: CaseDraft;
  accepted_sections: CaseSectionId[];
  model: string | null;
  provider: string | null;
  source_url: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  applied_at: string | null;
}

const MONEY_KEYS = new Set([
  'estimated_value',
  'fee',
  'fees',
  'price',
  'amount',
  'naira',
  'ngn',
  'usd',
  'dollar',
  'budget',
  'value',
  'revenue',
  'revenue_originated',
  'revenue_influenced',
  'current_stage',
]);

const CURRENCY_RE =
  /(?:₦|\$|€|£)\s*[\d,.]+(?:\s*(?:million|billion|bn|m))?|\b\d+(?:[.,]\d+)?\s*(?:million|billion|bn|m)?\s*(?:ngn|naira|usd|dollars?)\b/gi;

function text(value: unknown, max = 2000): string | null {
  if (value === undefined || value === null) return null;
  const s = String(value).trim();
  if (!s) return null;
  return s.length > max ? s.slice(0, max) : s;
}

function stringList(value: unknown, maxItems = 12, maxLen = 400): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => text(item, maxLen))
    .filter((item): item is string => Boolean(item))
    .slice(0, maxItems);
}

function activeFeeBands(): FeeBandCatalogEntry[] {
  const live = listFeeBands().filter((b) => !b.archived);
  if (live.length) {
    return live.map((b) => ({
      id: b.id,
      name: b.name,
      horizon: b.horizon,
      typical_work: b.typical_work,
      currency: 'NGN',
      min_m: b.min_m,
      max_m: b.max_m,
      when: b.when,
    }));
  }
  return LANI_FEE_BANDS.slice();
}

function isActiveFeeBand(id: string): boolean {
  return isFeeBandId(id) && activeFeeBands().some((b) => b.id === id);
}

function stripCurrency(
  value: string | null,
  allowedRanges?: { min_m: number; max_m: number }[] | null,
): { text: string | null; stripped: boolean } {
  if (!value) return { text: null, stripped: false };
  const keep: string[] = [];
  let next = value;
  for (const allowed of allowedRanges || []) {
    const min = String(Math.round(Number(allowed.min_m)));
    const max = String(Math.round(Number(allowed.max_m)));
    const range = new RegExp(
      `${min}\\D{1,3}${max}\\s*m(?:illion)?(?:\\s*(?:ngn|naira))?`,
      'gi',
    );
    next = next.replace(range, (match) => {
      keep.push(match);
      return `__KEEP${keep.length - 1}__`;
    });
  }
  const cleaned = next.replace(CURRENCY_RE, ' ').replace(/\s{2,}/g, ' ').trim();
  const restored = cleaned.replace(/__KEEP(\d+)__/g, (_, i) => keep[Number(i)] || '');
  const stripped = restored !== value.trim();
  return { text: restored || null, stripped };
}

export function validateCaseDraft(raw: unknown, stage?: number): CaseDraft {
  const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, any> : {};
  const dropped: string[] = Array.isArray(src.dropped)
    ? src.dropped.map((item: unknown) => String(item)).filter(Boolean).slice(0, 20)
    : [];
  const drop = (field: string, reason: string) => {
    dropped.push(`${field}: ${reason}`);
  };

  for (const key of Object.keys(src)) {
    if (key === 'dropped') continue;
    if (MONEY_KEYS.has(key) || (CASE_FORBIDDEN_ACCOUNT_FIELDS as readonly string[]).includes(key)) {
      drop(key, 'money or stage field is not allowed');
      continue;
    }
    if (!(CASE_DRAFT_KEYS as readonly string[]).includes(key)) {
      drop(key, 'not a Case draft field');
    }
  }

  if (src.lani_capability) {
    const cap = text(src.lani_capability, 200);
    if (cap && !LANI_CAPABILITIES.includes(cap)) {
      drop('lani_capability', 'not an exact catalog capability');
    }
  }

  let commercial_model = text(src.commercial_model, 32);
  if (commercial_model && !isCommercialModelId(commercial_model)) {
    drop('commercial_model', `not in catalog (${commercial_model})`);
    commercial_model = null;
  }

  let fee_band_id = text(src.fee_band_id, 32);
  if (fee_band_id && !isActiveFeeBand(fee_band_id)) {
    drop('fee_band_id', `not in catalog (${fee_band_id})`);
    fee_band_id = null;
  }
  const liveBand = fee_band_id ? listFeeBands().find((b) => b.id === fee_band_id) : undefined;
  const allowedRanges = liveBand
    ? [
        { min_m: liveBand.min_m, max_m: liveBand.max_m },
        { min_m: liveBand.catalog_default.min_m, max_m: liveBand.catalog_default.max_m },
      ]
    : [];

  let ask_id = text(src.ask_id, 40);
  if (ask_id && !isCaseAskId(ask_id)) {
    drop('ask_id', `not in catalog (${ask_id})`);
    ask_id = null;
  }
  if (!ask_id && typeof stage === 'number') {
    ask_id = defaultAskForStage(stage);
  }

  const cleanText = (field: string, value: unknown, max: number) => {
    const rawText = text(value, max);
    const result = stripCurrency(rawText, field === 'fee_rationale' ? allowedRanges : null);
    if (result.stripped) drop(field, 'raw currency removed');
    return result.text;
  };

  return {
    headline: cleanText('headline', src.headline, 240),
    situation: cleanText('situation', src.situation, 2000),
    why_now: cleanText('why_now', src.why_now, 1200),
    why_lani: cleanText('why_lani', src.why_lani, 2000),
    scope_workstreams: stringList(src.scope_workstreams).map((item) => {
      const result = stripCurrency(item);
      if (result.stripped) drop('scope_workstreams', 'raw currency removed');
      return result.text || item;
    }).filter(Boolean),
    commercial_model,
    fee_band_id,
    fee_rationale: cleanText('fee_rationale', src.fee_rationale, 800),
    consortium_required: Boolean(src.consortium_required),
    consortium_roles: stringList(src.consortium_roles, 8, 200),
    risks: stringList(src.risks).map((item) => {
      const result = stripCurrency(item);
      if (result.stripped) drop('risks', 'raw currency removed');
      return result.text || item;
    }).filter(Boolean),
    ask_id,
    ask_text: cleanText('ask_text', src.ask_text, 400),
    caveats: stringList(src.caveats),
    sources: stringList(src.sources),
    dropped,
  };
}

function parseAccepted(value: unknown): CaseSectionId[] {
  if (typeof value === 'string') {
    try {
      return parseAccepted(JSON.parse(value));
    } catch {
      return [];
    }
  }
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => String(item))
    .filter((id): id is CaseSectionId => isCaseSectionId(id));
}

export function shapeCase(row: any): CommercialCaseRecord | null {
  if (!row) return null;
  let payload: CaseDraft;
  try {
    const parsed = typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload;
    payload = validateCaseDraft(parsed);
    if (Array.isArray(parsed?.dropped)) payload.dropped = parsed.dropped;
  } catch {
    payload = validateCaseDraft({});
  }
  return {
    id: row.id,
    account_id: row.account_id,
    status: row.status,
    payload,
    accepted_sections: parseAccepted(row.accepted_sections),
    model: row.model || null,
    provider: row.provider || null,
    source_url: row.source_url || null,
    created_by: row.created_by || null,
    created_at: row.created_at,
    updated_at: row.updated_at,
    applied_at: row.applied_at || null,
  };
}

function insertCase(row: {
  account_id: string;
  payload: CaseDraft;
  model?: string | null;
  provider?: string | null;
  source_url?: string | null;
  created_by?: string | null;
}): CommercialCaseRecord {
  const id = `case_${randomUUID().slice(0, 8)}`;
  db.prepare(`
    INSERT INTO commercial_cases (
      id, account_id, status, payload, model, provider, source_url, created_by, accepted_sections
    ) VALUES (?, ?, 'draft', ?, ?, ?, ?, ?, '[]')
  `).run(
    id,
    row.account_id,
    JSON.stringify(row.payload),
    row.model || null,
    row.provider || null,
    row.source_url || null,
    row.created_by || null,
  );
  return shapeCase(db.prepare('SELECT * FROM commercial_cases WHERE id = ?').get(id))!;
}

export function getCase(id: string): CommercialCaseRecord | null {
  return shapeCase(db.prepare('SELECT * FROM commercial_cases WHERE id = ?').get(id));
}

export function getLatestCase(accountId: string): CommercialCaseRecord | null {
  return shapeCase(
    db.prepare(
      `SELECT * FROM commercial_cases WHERE account_id = ? ORDER BY created_at DESC LIMIT 1`
    ).get(accountId)
  );
}

export function getLatestAppliedCase(accountId: string): CommercialCaseRecord | null {
  return shapeCase(
    db.prepare(
      `SELECT * FROM commercial_cases
       WHERE account_id = ? AND status = 'applied'
       ORDER BY applied_at DESC, created_at DESC
       LIMIT 1`
    ).get(accountId)
  );
}

export class CaseBlockedError extends AiRequestError {
  readonly code = 'intelligence_blocked';
  constructor() {
    super('Commercial Case is blocked at Intelligence. Qualify the account first.', 400);
    this.name = 'CaseBlockedError';
  }
}

export async function generateCase(input: {
  accountId: string;
  notes?: string | null;
  source_url?: string | null;
  created_by?: string | null;
}): Promise<CommercialCaseRecord> {
  const row = db.prepare('SELECT * FROM accounts WHERE id = ?').get(input.accountId) as any;
  if (!row) {
    throw new AiRequestError('account_not_found', 404);
  }
  if (!canGenerateCommercialCase(row.current_stage)) {
    throw new CaseBlockedError();
  }

  const account = shapeAccount(row);
  const applied = getLatestAppliedBrief(input.accountId);
  let sourceExcerpt: string | null = null;
  const caveats: string[] = [];
  const sourceUrl = text(input.source_url, 500);
  if (sourceUrl) {
    const fetched = await fetchSourceExcerpt(sourceUrl);
    if (fetched.ok) {
      sourceExcerpt = fetched.excerpt;
    } else {
      caveats.push(`Source URL could not be used: ${fetched.error}`);
    }
  }

  const completion = await completeJson(
    buildCaseSystemPrompt(activeFeeBands()),
    buildCaseUserPrompt({
      account: {
        id: account.id,
        organisation: account.organisation,
        current_stage: account.current_stage,
        archetype: account.archetype,
        sector: account.sector,
        partnership_role: account.partnership_role,
        geography: account.geography,
        lane: account.lane,
        commercial_model: account.commercial_model,
        consortium_required: account.consortium_required,
        decision_maker: account.decision_maker,
        strategic_problem: account.strategic_problem,
        trigger_event: account.trigger_event,
        lani_capability: account.lani_capability,
        potential_partners: account.potential_partners,
        next_action: account.next_action,
        notes: account.notes,
        scores: account.scores,
      },
      applied_brief: applied
        ? { id: applied.id, applied_at: applied.applied_at, payload: applied.payload as unknown as Record<string, unknown> }
        : null,
      source_url: sourceUrl,
      source_excerpt: sourceExcerpt,
      notes: input.notes,
    })
  );

  const draft = validateCaseDraft(completion.json, Number(account.current_stage));
  if (caveats.length) draft.caveats = [...caveats, ...draft.caveats];
  if (sourceUrl && !draft.sources.includes(sourceUrl)) draft.sources = [sourceUrl, ...draft.sources];
  if (!draft.ask_id) draft.ask_id = defaultAskForStage(Number(account.current_stage)) as CaseAskId;

  return insertCase({
    account_id: input.accountId,
    payload: draft,
    model: completion.model,
    provider: completion.provider,
    source_url: sourceUrl,
    created_by: input.created_by || null,
  });
}

function fieldsForSection(section: CaseSectionId, draft: CaseDraft): Record<string, unknown> {
  const spec = CASE_SECTIONS.find((s) => s.id === section)!;
  const out: Record<string, unknown> = {};
  for (const field of spec.fields) {
    out[field] = (draft as Record<string, unknown>)[field];
  }
  return out;
}

export function applyCase(input: {
  caseId: string;
  accountId: string;
  accepted_sections: string[];
  account_fields?: string[];
}): { case: CommercialCaseRecord; accepted_sections: CaseSectionId[]; applied_account_fields: string[]; account: any } {
  const record = getCase(input.caseId);
  if (!record) {
    throw new AiRequestError('case_not_found', 404);
  }
  if (record.status === 'discarded') {
    throw new AiRequestError('Case was discarded', 400);
  }
  if (record.account_id !== input.accountId) {
    throw new AiRequestError('Case does not belong to this account', 409);
  }

  const existing = db.prepare('SELECT * FROM accounts WHERE id = ?').get(input.accountId) as any;
  if (!existing) {
    throw new AiRequestError('account_not_found', 404);
  }
  if (!canGenerateCommercialCase(existing.current_stage)) {
    throw new CaseBlockedError();
  }

  const accepted = input.accepted_sections
    .map((id) => String(id).trim())
    .filter((id): id is CaseSectionId => isCaseSectionId(id));
  if (!accepted.length) {
    throw new AiRequestError('accepted_sections must include at least one memo section', 400);
  }

  const requestedWriteback = (input.account_fields || [])
    .map((f) => String(f).trim())
    .filter((f) => (CASE_APPLY_ACCOUNT_FIELDS as readonly string[]).includes(f));
  const forbidden = (input.account_fields || []).filter((f) =>
    MONEY_KEYS.has(String(f)) || (CASE_FORBIDDEN_ACCOUNT_FIELDS as readonly string[]).includes(String(f))
  );
  for (const field of forbidden) {
    record.payload.dropped = [...record.payload.dropped, `${field}: cannot write stage or money from a Case`];
  }

  const patch: Record<string, unknown> = {};
  const applied_account_fields: string[] = [];
  const draft = record.payload;

  if (requestedWriteback.includes('commercial_model') && accepted.includes('commercial') && draft.commercial_model) {
    patch.commercial_model = draft.commercial_model;
    applied_account_fields.push('commercial_model');
  }
  if (requestedWriteback.includes('consortium_required') && accepted.includes('consortium')) {
    patch.consortium_required = draft.consortium_required;
    applied_account_fields.push('consortium_required');
  }
  if (requestedWriteback.includes('next_action') && accepted.includes('ask') && draft.ask_text) {
    patch.next_action = draft.ask_text;
    applied_account_fields.push('next_action');
  }

  delete patch.current_stage;
  delete patch.estimated_value;

  let updated = existing;
  if (applied_account_fields.length) {
    const next = updateAccount(input.accountId, patch);
    if (!next) {
      throw new AiRequestError('account_not_found', 404);
    }
    updated = next;
  }

  db.prepare(`
    UPDATE commercial_cases
    SET status = 'applied',
        accepted_sections = ?,
        payload = ?,
        applied_at = datetime('now'),
        updated_at = datetime('now')
    WHERE id = ?
  `).run(JSON.stringify(accepted), JSON.stringify(draft), input.caseId);

  return {
    case: getCase(input.caseId)!,
    accepted_sections: accepted,
    applied_account_fields,
    account: shapeAccount(updated),
  };
}

export function mapCaseError(e: unknown): { status: number; error: string; message: string } {
  if (e instanceof AiNotConfiguredError) {
    return { status: e.status, error: 'ai_not_configured', message: e.message };
  }
  if (e instanceof CaseBlockedError) {
    return { status: 400, error: e.code, message: e.message };
  }
  if (e instanceof AiRequestError) {
    const known = ['case_not_found', 'account_not_found'];
    return {
      status: e.status,
      error: known.includes(e.message) ? e.message : 'case_error',
      message: e.message,
    };
  }
  return { status: 500, error: 'internal_error', message: 'Commercial Case failed' };
}

export { fieldsForSection, conversionStageLabel };
