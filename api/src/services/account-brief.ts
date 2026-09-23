/**
 * Account Intelligence Brief — validate catalog IDs, persist drafts, apply accepted fields.
 */

import { randomUUID } from 'node:crypto';
import db from '../db.js';
import {
  COMMERCIAL_TRIGGERS,
  LANI_CAPABILITIES,
  isArchetypeId,
  isCommercialModelId,
  isGeographyId,
  isLaneId,
  isPartnershipRoleId,
  isScore,
  isSectorId,
  isTriggerId,
} from '../catalog.js';
import { buildBriefSystemPrompt, buildBriefUserPrompt } from './account-brief-prompt.js';
import { AiNotConfiguredError, AiRequestError, completeJson } from './llm.js';
import { fetchSourceExcerpt } from './source-fetch.js';
import { conversionGaps, insertAccount, updateAccount, validateAccountPayload } from './account-book.js';

export const BRIEF_STATUSES = ['draft', 'applied', 'discarded'] as const;
export type BriefStatus = (typeof BRIEF_STATUSES)[number];

export const APPLYABLE_FIELDS = [
  'archetype',
  'sector',
  'partnership_role',
  'geography',
  'lane',
  'commercial_model',
  'trigger_event',
  'strategic_problem',
  'lani_capability',
  'decision_maker',
  'consortium_required',
  'next_action',
  'score_strategic_fit',
  'score_access',
  'score_commercial',
  'score_urgency',
  'score_conversion',
] as const;

export type ApplyableField = (typeof APPLYABLE_FIELDS)[number];

export interface BriefScores {
  strategic_fit: number | null;
  access: number | null;
  commercial: number | null;
  urgency: number | null;
  conversion: number | null;
}

export interface BriefDraft {
  summary: string | null;
  archetype: string | null;
  archetype_confidence: 'high' | 'medium' | 'low' | null;
  archetype_test_used: string | null;
  sector: string | null;
  partnership_role: string | null;
  geography: string | null;
  lane: string | null;
  commercial_model: string | null;
  trigger_event: string | null;
  trigger_id: string | null;
  strategic_problem: string | null;
  lani_capability: string | null;
  decision_maker: string | null;
  consortium_required: boolean;
  scores: BriefScores;
  score_reasons: Record<keyof BriefScores, string | null>;
  next_action: string | null;
  caveats: string[];
  sources: string[];
  dropped: string[];
}

export interface AccountBriefRecord {
  id: string;
  account_id: string | null;
  organisation: string | null;
  status: BriefStatus;
  payload: BriefDraft;
  model: string | null;
  provider: string | null;
  source_url: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  applied_at: string | null;
}

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

function triggerById(id: string) {
  return COMMERCIAL_TRIGGERS.find((t) => t.id === id);
}

function triggerByLabel(label: string) {
  const lower = label.trim().toLowerCase();
  return COMMERCIAL_TRIGGERS.find((t) => t.trigger.toLowerCase() === lower);
}

export function validateBriefDraft(raw: unknown): BriefDraft {
  const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, any> : {};
  const dropped: string[] = [];
  const drop = (field: string, reason: string) => {
    dropped.push(`${field}: ${reason}`);
  };

  let archetype: string | null = text(src.archetype, 8);
  if (archetype && !isArchetypeId(archetype)) {
    drop('archetype', `not in catalog (${archetype})`);
    archetype = null;
  }

  const confRaw = text(src.archetype_confidence, 16)?.toLowerCase();
  const archetype_confidence = confRaw === 'high' || confRaw === 'medium' || confRaw === 'low'
    ? confRaw
    : null;
  if (src.archetype_confidence && !archetype_confidence) {
    drop('archetype_confidence', 'must be high, medium, or low');
  }

  let sector = text(src.sector, 64);
  if (sector && !isSectorId(sector)) {
    drop('sector', `not in catalog (${sector})`);
    sector = null;
  }

  let partnership_role = text(src.partnership_role, 32);
  if (partnership_role && !isPartnershipRoleId(partnership_role)) {
    drop('partnership_role', `not in catalog (${partnership_role})`);
    partnership_role = null;
  }

  let geography = text(src.geography, 16);
  if (geography && !isGeographyId(geography)) {
    drop('geography', `not in catalog (${geography})`);
    geography = null;
  }

  let lane = text(src.lane, 32);
  if (lane && !isLaneId(lane)) {
    drop('lane', `not in catalog (${lane})`);
    lane = null;
  }

  let commercial_model = text(src.commercial_model, 32);
  if (commercial_model && !isCommercialModelId(commercial_model)) {
    drop('commercial_model', `not in catalog (${commercial_model})`);
    commercial_model = null;
  }

  let trigger_id = text(src.trigger_id, 64);
  let trigger_event = text(src.trigger_event, 200);
  if (trigger_id && !isTriggerId(trigger_id)) {
    drop('trigger_id', `not in catalog (${trigger_id})`);
    trigger_id = null;
  }
  if (trigger_id) {
    trigger_event = triggerById(trigger_id)?.trigger || trigger_event;
  } else if (trigger_event && trigger_event.toLowerCase() !== 'unspecified') {
    const match = triggerByLabel(trigger_event);
    if (match) {
      trigger_id = match.id;
      trigger_event = match.trigger;
    } else {
      drop('trigger_event', `not in catalog (${trigger_event})`);
      trigger_event = null;
    }
  } else {
    trigger_event = null;
  }

  let lani_capability = text(src.lani_capability, 200);
  if (lani_capability && !LANI_CAPABILITIES.includes(lani_capability)) {
    drop('lani_capability', 'not an exact catalog capability');
    lani_capability = null;
  }

  const scoreSrc = src.scores && typeof src.scores === 'object' ? src.scores : {};
  const scoreKey = (name: keyof BriefScores): number | null => {
    const n = Number(scoreSrc[name]);
    if (scoreSrc[name] === undefined || scoreSrc[name] === null || scoreSrc[name] === '') return null;
    if (!isScore(n)) {
      drop(`scores.${name}`, 'must be an integer 1–5');
      return null;
    }
    return n;
  };

  const reasonSrc = src.score_reasons && typeof src.score_reasons === 'object' ? src.score_reasons : {};
  const reason = (name: keyof BriefScores) => text(reasonSrc[name], 240);

  return {
    summary: text(src.summary, 1200),
    archetype,
    archetype_confidence,
    archetype_test_used: text(src.archetype_test_used, 300),
    sector,
    partnership_role,
    geography,
    lane,
    commercial_model,
    trigger_event,
    trigger_id,
    strategic_problem: text(src.strategic_problem, 2000),
    lani_capability,
    decision_maker: text(src.decision_maker, 200),
    consortium_required: Boolean(src.consortium_required),
    scores: {
      strategic_fit: scoreKey('strategic_fit'),
      access: scoreKey('access'),
      commercial: scoreKey('commercial'),
      urgency: scoreKey('urgency'),
      conversion: scoreKey('conversion'),
    },
    score_reasons: {
      strategic_fit: reason('strategic_fit'),
      access: reason('access'),
      commercial: reason('commercial'),
      urgency: reason('urgency'),
      conversion: reason('conversion'),
    },
    next_action: text(src.next_action, 400),
    caveats: stringList(src.caveats),
    sources: stringList(src.sources),
    dropped,
  };
}

export function shapeBrief(row: any): AccountBriefRecord | null {
  if (!row) return null;
  let payload: BriefDraft;
  try {
    const parsed = typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload;
    payload = validateBriefDraft(parsed);
    if (Array.isArray(parsed?.dropped)) payload.dropped = parsed.dropped;
  } catch {
    payload = validateBriefDraft({});
  }
  return {
    id: row.id,
    account_id: row.account_id || null,
    organisation: row.organisation || null,
    status: row.status,
    payload,
    model: row.model || null,
    provider: row.provider || null,
    source_url: row.source_url || null,
    created_by: row.created_by || null,
    created_at: row.created_at,
    updated_at: row.updated_at,
    applied_at: row.applied_at || null,
  };
}

function insertBrief(row: {
  account_id?: string | null;
  organisation: string;
  payload: BriefDraft;
  model?: string | null;
  provider?: string | null;
  source_url?: string | null;
  created_by?: string | null;
}): AccountBriefRecord {
  const id = `brief_${randomUUID().slice(0, 8)}`;
  db.prepare(`
    INSERT INTO account_briefs (
      id, account_id, organisation, status, payload, model, provider, source_url, created_by
    ) VALUES (?, ?, ?, 'draft', ?, ?, ?, ?, ?)
  `).run(
    id,
    row.account_id || null,
    row.organisation,
    JSON.stringify(row.payload),
    row.model || null,
    row.provider || null,
    row.source_url || null,
    row.created_by || null,
  );
  return shapeBrief(db.prepare('SELECT * FROM account_briefs WHERE id = ?').get(id))!;
}

export function getBrief(id: string): AccountBriefRecord | null {
  return shapeBrief(db.prepare('SELECT * FROM account_briefs WHERE id = ?').get(id));
}

export function getLatestBrief(accountId: string): AccountBriefRecord | null {
  return shapeBrief(
    db.prepare(
      `SELECT * FROM account_briefs WHERE account_id = ? ORDER BY created_at DESC LIMIT 1`
    ).get(accountId)
  );
}

export function getLatestAppliedBrief(accountId: string): AccountBriefRecord | null {
  return shapeBrief(
    db.prepare(
      `SELECT * FROM account_briefs
       WHERE account_id = ? AND status = 'applied'
       ORDER BY applied_at DESC, created_at DESC
       LIMIT 1`
    ).get(accountId)
  );
}

export async function generateBrief(input: {
  organisation: string;
  account_id?: string | null;
  geography?: string | null;
  partnership_role?: string | null;
  sector?: string | null;
  notes?: string | null;
  source_url?: string | null;
  existing?: Record<string, unknown> | null;
  created_by?: string | null;
}): Promise<AccountBriefRecord> {
  const organisation = String(input.organisation || '').trim();
  if (!organisation) {
    throw new AiRequestError('organisation is required', 400);
  }

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
    buildBriefSystemPrompt(),
    buildBriefUserPrompt({
      organisation,
      geography: input.geography,
      partnership_role: input.partnership_role,
      sector: input.sector,
      notes: input.notes,
      source_url: sourceUrl,
      source_excerpt: sourceExcerpt,
      existing: input.existing || null,
    })
  );

  const draft = validateBriefDraft(completion.json);
  if (caveats.length) draft.caveats = [...caveats, ...draft.caveats];
  if (sourceUrl && !draft.sources.includes(sourceUrl)) draft.sources = [sourceUrl, ...draft.sources];

  return insertBrief({
    account_id: input.account_id || null,
    organisation,
    payload: draft,
    model: completion.model,
    provider: completion.provider,
    source_url: sourceUrl,
    created_by: input.created_by || null,
  });
}

export function fieldsFromDraft(draft: BriefDraft): Record<string, unknown> {
  return {
    archetype: draft.archetype,
    sector: draft.sector,
    partnership_role: draft.partnership_role,
    geography: draft.geography,
    lane: draft.lane,
    commercial_model: draft.commercial_model,
    trigger_event: draft.trigger_event,
    strategic_problem: draft.strategic_problem,
    lani_capability: draft.lani_capability,
    decision_maker: draft.decision_maker,
    consortium_required: draft.consortium_required,
    next_action: draft.next_action,
    score_strategic_fit: draft.scores.strategic_fit,
    score_access: draft.scores.access,
    score_commercial: draft.scores.commercial,
    score_urgency: draft.scores.urgency,
    score_conversion: draft.scores.conversion,
  };
}

function acceptedPatch(draft: BriefDraft, accepted_fields: string[]): { patch: Record<string, unknown>; applied: string[] } {
  const accepted = accepted_fields
    .map((f) => String(f).trim())
    .filter((f): f is ApplyableField => (APPLYABLE_FIELDS as readonly string[]).includes(f));
  if (!accepted.length) {
    throw new AiRequestError('accepted_fields must include at least one applyable field', 400);
  }

  const fromDraft = fieldsFromDraft(draft);
  const patch: Record<string, unknown> = {};
  const applied: string[] = [];
  for (const field of accepted) {
    const value = fromDraft[field];
    if (value === undefined || value === null || value === '') continue;
    patch[field] = value;
    applied.push(field);
  }
  if (!applied.length) {
    throw new AiRequestError('None of the accepted fields have a catalog-valid value', 400);
  }
  delete patch.current_stage;
  return { patch, applied };
}

export function applyBrief(input: {
  briefId: string;
  accountId: string;
  accepted_fields: string[];
}): { brief: AccountBriefRecord; applied: string[]; account: any } {
  const brief = getBrief(input.briefId);
  if (!brief) {
    throw new AiRequestError('brief_not_found', 404);
  }
  if (brief.status === 'discarded') {
    throw new AiRequestError('Brief was discarded', 400);
  }
  if (brief.account_id && brief.account_id !== input.accountId) {
    throw new AiRequestError('Brief does not belong to this account', 409);
  }

  const { patch, applied } = acceptedPatch(brief.payload, input.accepted_fields);

  const validation = validateAccountPayload(patch, { requireOrg: false });
  if (validation.length) {
    throw new AiRequestError(validation.join('; '), 400);
  }

  const existing = db.prepare('SELECT * FROM accounts WHERE id = ?').get(input.accountId) as any;
  if (!existing) {
    throw new AiRequestError('account_not_found', 404);
  }
  const gaps = conversionGaps({
    current_stage: existing.current_stage,
    next_action: applied.includes('next_action') ? patch.next_action : existing.next_action,
    expected_decision_date: existing.expected_decision_date,
    consortium_required: applied.includes('consortium_required')
      ? patch.consortium_required
      : existing.consortium_required,
    delivery_partner_account_id: existing.delivery_partner_account_id,
  });
  if (gaps.length) {
    throw new AiRequestError(
      `Conversion discipline: ${gaps.join(', ')}`,
      400,
    );
  }

  const updated = updateAccount(input.accountId, patch);
  if (!updated) {
    throw new AiRequestError('account_not_found', 404);
  }

  db.prepare(`
    UPDATE account_briefs
    SET account_id = ?, status = 'applied', applied_at = datetime('now'), updated_at = datetime('now')
    WHERE id = ?
  `).run(input.accountId, input.briefId);

  return { brief: getBrief(input.briefId)!, applied, account: updated };
}

export function createAccountFromBrief(input: {
  briefId: string;
  accepted_fields: string[];
  organisation?: string | null;
  relationship_owner?: string | null;
}): { brief: AccountBriefRecord; applied: string[]; account: any } {
  const brief = getBrief(input.briefId);
  if (!brief) {
    throw new AiRequestError('brief_not_found', 404);
  }
  if (brief.status === 'discarded') {
    throw new AiRequestError('Brief was discarded', 400);
  }
  if (brief.account_id) {
    throw new AiRequestError('Brief is already linked to an account', 409);
  }

  const organisation = String(input.organisation || brief.organisation || '').trim();
  if (!organisation) {
    throw new AiRequestError('organisation is required', 400);
  }

  const { patch, applied } = acceptedPatch(brief.payload, input.accepted_fields);
  if (!applied.includes('archetype') || !patch.archetype) {
    throw new AiRequestError('Accept a client archetype to create the account', 400);
  }

  const duplicate = db.prepare(
    `SELECT id FROM accounts WHERE is_archived = 0 AND lower(organisation) = lower(?) LIMIT 1`
  ).get(organisation) as { id: string } | undefined;
  if (duplicate) {
    throw new AiRequestError('duplicate_organisation', 409);
  }

  const body = {
    ...patch,
    organisation,
    current_stage: 1,
    relationship_owner: input.relationship_owner || null,
  };
  const validation = validateAccountPayload(body, { requireOrg: true });
  if (validation.length) {
    throw new AiRequestError(validation.join('; '), 400);
  }
  const gaps = conversionGaps({
    current_stage: 1,
    next_action: applied.includes('next_action') ? patch.next_action : null,
    expected_decision_date: null,
    consortium_required: applied.includes('consortium_required') ? patch.consortium_required : false,
    delivery_partner_account_id: null,
  });
  if (gaps.length) {
    throw new AiRequestError(`Conversion discipline: ${gaps.join(', ')}`, 400);
  }

  const created = insertAccount(body);
  db.prepare(`
    UPDATE account_briefs
    SET account_id = ?, status = 'applied', applied_at = datetime('now'), updated_at = datetime('now')
    WHERE id = ?
  `).run(created.id, input.briefId);

  return { brief: getBrief(input.briefId)!, applied, account: created };
}

export function mapBriefError(e: unknown): { status: number; error: string; message: string } {
  if (e instanceof AiNotConfiguredError) {
    return { status: e.status, error: 'ai_not_configured', message: e.message };
  }
  if (e instanceof AiRequestError) {
    const known = ['brief_not_found', 'account_not_found', 'duplicate_organisation'];
    const friendly = e.message === 'duplicate_organisation'
      ? 'An active account with this organisation already exists'
      : e.message;
    return {
      status: e.status,
      error: known.includes(e.message) ? e.message : 'brief_error',
      message: friendly,
    };
  }
  return { status: 500, error: 'internal_error', message: 'Research failed' };
}
