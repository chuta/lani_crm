/**
 * Conversion Coach — deterministic stall + ask + why.
 * No model call. No CPO / $GIFT. No stage advance. No invented naira.
 */

import { randomUUID } from 'node:crypto';
import db from '../db.js';
import {
  CASE_ASKS,
  COACH_APPLY_ACCOUNT_FIELDS,
  COACH_DRAFT_KEYS,
  COACH_FORBIDDEN_ACCOUNT_FIELDS,
  LANI_COACH_STALLS,
  allowedCoachApplyFields,
  canApplyCoachDecisionDate,
  canGenerateCoach,
  coachRequiresAi,
  conversionStageLabel,
  defaultAskForStage,
  isCaseAskId,
  isCoachApplyAccountField,
  isCoachFieldId,
  isCoachStallId,
  isWorkingStage,
  stallAppliesToStage,
  type CaseAskCatalogEntry,
  type CaseAskId,
  type CoachApplyAccountField,
  type CoachFieldId,
  type CoachStallId,
} from '../catalog.js';
import { conversionGaps, shapeAccount, updateAccount } from './account-book.js';
import { getLatestAppliedBrief } from './account-brief.js';
import { getLatestAppliedCase } from './commercial-case.js';
import { getCoachStall, isActiveCoachStall } from './coach-stalls.js';
import { buildCoachPolishSystemPrompt, buildCoachPolishUserPrompt } from './conversion-coach-prompt.js';
import { AiNotConfiguredError, AiRequestError, completeJson } from './llm.js';

export const ADVICE_STATUSES = ['draft', 'applied', 'discarded'] as const;
export type AdviceStatus = (typeof ADVICE_STATUSES)[number];

export interface CoachDraft {
  stall_reason_id: CoachStallId | null;
  supporting_reason_ids: CoachStallId[];
  next_action: string | null;
  ask_id: CaseAskId | null;
  name_partner: boolean;
  suggested_decision_date: string | null;
  why: string | null;
  evidence: string[];
  caveats: string[];
  sources: string[];
  dropped: string[];
  polished: boolean;
}

export interface ConversionAdviceRecord {
  id: string;
  account_id: string;
  status: AdviceStatus;
  payload: CoachDraft;
  accepted_fields: string[];
  model: string | null;
  provider: string | null;
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

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const BLOCK_ORDER: CoachStallId[] = [
  'no_brief',
  'no_trigger',
  'no_buyer',
  'no_next_action',
  'consortium_unnamed',
  'no_decision_date',
];

const ADVICE_ORDER: CoachStallId[] = ['stale_ask', 'no_case'];

function text(value: unknown, max = 800): string | null {
  if (value === undefined || value === null) return null;
  const s = String(value).trim();
  if (!s) return null;
  return s.length > max ? s.slice(0, max) : s;
}

function stringList(value: unknown, maxItems = 12, maxLen = 240): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => text(item, maxLen))
    .filter((item): item is string => Boolean(item))
    .slice(0, maxItems);
}

function stripCurrency(value: string | null): { text: string | null; stripped: boolean } {
  if (!value) return { text: null, stripped: false };
  const restored = value.replace(CURRENCY_RE, ' ').replace(/\s{2,}/g, ' ').trim();
  return { text: restored || null, stripped: restored !== value.trim() };
}

function parseJson(value: unknown, fallback: unknown) {
  if (value && typeof value === 'object') return value;
  if (typeof value !== 'string' || !value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function askForStage(stage: number): CaseAskCatalogEntry | null {
  if (stage < 2 || stage > 5) return null;
  return CASE_ASKS.find((a) => a.for_stages.includes(stage))
    || CASE_ASKS.find((a) => a.id === defaultAskForStage(stage))
    || null;
}

function looksLikeAsk(next: string, ask: CaseAskCatalogEntry): boolean {
  const hay = next.toLowerCase();
  const needles = [
    ask.id.replace(/_/g, ' '),
    ask.name,
    ask.ask.split('.')[0] || ask.ask,
  ];
  return needles.some((n) => {
    const token = n.toLowerCase().trim();
    return token.length >= 12 && hay.includes(token.slice(0, 18));
  });
}

function isStaleAsk(next: string, stage: number, appliedAskId: string | null): boolean {
  const expected = askForStage(stage);
  if (!expected || !next) return false;
  if (appliedAskId && isCaseAskId(appliedAskId) && appliedAskId !== expected.id) return true;
  const matchesExpected = looksLikeAsk(next, expected);
  const matchesOther = CASE_ASKS.some((ask) => ask.id !== expected.id && looksLikeAsk(next, ask));
  return matchesOther && !matchesExpected;
}

export class CoachBlockedError extends AiRequestError {
  readonly code = 'closed_or_hold';
  constructor() {
    super('Conversion Coach is off for Won, Lost, or On hold accounts.', 400);
    this.name = 'CoachBlockedError';
  }
}

export function validateCoachDraft(raw: unknown, stage?: number): CoachDraft {
  const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, any> : {};
  const dropped: string[] = Array.isArray(src.dropped)
    ? src.dropped.map((item: unknown) => String(item)).filter(Boolean).slice(0, 20)
    : [];
  const drop = (field: string, reason: string) => {
    dropped.push(`${field}: ${reason}`);
  };

  for (const key of Object.keys(src)) {
    if (key === 'dropped') continue;
    if (MONEY_KEYS.has(key) || (COACH_FORBIDDEN_ACCOUNT_FIELDS as readonly string[]).includes(key)) {
      drop(key, 'money, stage, or forbidden account field');
      continue;
    }
    if (!(COACH_DRAFT_KEYS as readonly string[]).includes(key)) {
      drop(key, 'not a Coach draft field');
    }
  }

  let stall_reason_id = text(src.stall_reason_id, 40);
  if (stall_reason_id && !isCoachStallId(stall_reason_id)) {
    drop('stall_reason_id', `not in catalog (${stall_reason_id})`);
    stall_reason_id = null;
  } else if (stall_reason_id === 'closed_or_hold') {
    drop('stall_reason_id', 'Coach is off — closed_or_hold is not advice');
    stall_reason_id = null;
  } else if (stall_reason_id && !isActiveCoachStall(stall_reason_id)) {
    drop('stall_reason_id', 'archived');
    stall_reason_id = null;
  }

  const supporting_reason_ids = stringList(src.supporting_reason_ids, 8, 40)
    .filter((id): id is CoachStallId => {
      if (!isCoachStallId(id) || id === 'closed_or_hold') {
        drop('supporting_reason_ids', `dropped ${id}`);
        return false;
      }
      if (!isActiveCoachStall(id)) {
        drop('supporting_reason_ids', `archived ${id}`);
        return false;
      }
      return id !== stall_reason_id;
    });

  let ask_id = text(src.ask_id, 40);
  if (ask_id && !isCaseAskId(ask_id)) {
    drop('ask_id', `not in catalog (${ask_id})`);
    ask_id = null;
  } else if (ask_id && stage !== undefined && stage < 2) {
    drop('ask_id', 'CASE_ASKS are not used at Intelligence');
    ask_id = null;
  } else if (ask_id && stage !== undefined) {
    const ask = CASE_ASKS.find((a) => a.id === ask_id);
    if (ask && !ask.for_stages.includes(Number(stage))) {
      drop('ask_id', `ask ${ask_id} is not for stage ${stage}`);
      ask_id = null;
    }
  }

  const nextStripped = stripCurrency(text(src.next_action, 400));
  if (nextStripped.stripped) drop('next_action', 'stripped invented currency');
  const whyStripped = stripCurrency(text(src.why, 600));
  if (whyStripped.stripped) drop('why', 'stripped invented currency');

  let suggested_decision_date = text(src.suggested_decision_date, 12);
  if (suggested_decision_date) {
    if (stage !== undefined && !canApplyCoachDecisionDate(stage)) {
      drop('suggested_decision_date', 'decision date only at Proposal+');
      suggested_decision_date = null;
    } else if (!DATE_RE.test(suggested_decision_date)) {
      drop('suggested_decision_date', 'must be YYYY-MM-DD');
      suggested_decision_date = null;
    }
  }

  return {
    stall_reason_id: stall_reason_id as CoachStallId | null,
    supporting_reason_ids,
    next_action: nextStripped.text,
    ask_id: ask_id as CaseAskId | null,
    name_partner: Boolean(src.name_partner),
    suggested_decision_date,
    why: whyStripped.text,
    evidence: stringList(src.evidence, 10, 200),
    caveats: stringList(src.caveats, 8, 240),
    sources: stringList(src.sources, 8, 200),
    dropped,
    polished: false,
  };
}

function parseAcceptedFields(value: unknown): string[] {
  const raw = parseJson(value, []);
  return Array.isArray(raw) ? raw.map((item) => String(item)).filter(Boolean) : [];
}

function shapeAdvice(row: any): ConversionAdviceRecord | null {
  if (!row) return null;
  return {
    id: row.id,
    account_id: row.account_id,
    status: row.status,
    payload: validateCoachDraft(parseJson(row.payload, {})),
    accepted_fields: parseAcceptedFields(row.accepted_fields),
    model: row.model || null,
    provider: row.provider || null,
    created_by: row.created_by || null,
    created_at: row.created_at,
    updated_at: row.updated_at,
    applied_at: row.applied_at || null,
  };
}

function insertAdvice(row: {
  account_id: string;
  payload: CoachDraft;
  model?: string | null;
  provider?: string | null;
  created_by?: string | null;
}): ConversionAdviceRecord {
  const id = `adv_${randomUUID().slice(0, 8)}`;
  db.prepare(`
    INSERT INTO conversion_advice (
      id, account_id, status, payload, model, provider, created_by, accepted_fields
    ) VALUES (?, ?, 'draft', ?, ?, ?, ?, '[]')
  `).run(
    id,
    row.account_id,
    JSON.stringify(row.payload),
    row.model || null,
    row.provider || null,
    row.created_by || null,
  );
  return shapeAdvice(db.prepare('SELECT * FROM conversion_advice WHERE id = ?').get(id))!;
}

export function getAdvice(id: string): ConversionAdviceRecord | null {
  return shapeAdvice(db.prepare('SELECT * FROM conversion_advice WHERE id = ?').get(id));
}

export function getLatestAdvice(accountId: string): ConversionAdviceRecord | null {
  return shapeAdvice(
    db.prepare(
      `SELECT * FROM conversion_advice WHERE account_id = ? ORDER BY created_at DESC LIMIT 1`
    ).get(accountId)
  );
}

interface CoachContext {
  stage: number;
  trigger: string | null;
  buyer: string | null;
  nextAction: string | null;
  urgency: number;
  access: number;
  hasBrief: boolean;
  hasCase: boolean;
  appliedAskId: string | null;
  gaps: string[];
  staleAsk: boolean;
}

function stallFires(id: CoachStallId, ctx: CoachContext): boolean {
  switch (id) {
    case 'no_brief':
      return ctx.stage === 1 && !ctx.hasBrief;
    case 'no_trigger':
      return !ctx.trigger || ctx.urgency <= 2;
    case 'no_buyer':
      return ctx.stage >= 2 && (!ctx.buyer || ctx.access <= 2);
    case 'no_next_action':
      return isWorkingStage(ctx.stage) && !ctx.nextAction;
    case 'stale_ask':
      return isWorkingStage(ctx.stage) && Boolean(ctx.nextAction) && ctx.staleAsk;
    case 'no_case':
      return ctx.stage >= 2 && !ctx.hasCase;
    case 'consortium_unnamed':
      return ctx.gaps.includes('delivery_partner');
    case 'no_decision_date':
      return ctx.gaps.includes('expected_decision_date');
    case 'closed_or_hold':
      return false;
    default:
      return false;
  }
}

function collectStalls(ctx: CoachContext): CoachStallId[] {
  const order = [...BLOCK_ORDER, ...ADVICE_ORDER];
  return order.filter((id) => {
    const def = LANI_COACH_STALLS.find((s) => s.id === id);
    if (!def || !stallAppliesToStage(def, ctx.stage)) return false;
    if (!isActiveCoachStall(id)) return false;
    return stallFires(id, ctx);
  });
}

export function evaluateCoach(accountId: string): CoachDraft {
  const row = db.prepare('SELECT * FROM accounts WHERE id = ?').get(accountId) as any;
  if (!row) {
    throw new AiRequestError('account_not_found', 404);
  }
  if (!canGenerateCoach(row.current_stage)) {
    throw new CoachBlockedError();
  }

  const account = shapeAccount(row);
  const stage = Number(account.current_stage);
  const brief = getLatestAppliedBrief(accountId);
  const appliedCase = getLatestAppliedCase(accountId);
  const nextAction = text(account.next_action, 400);
  const appliedAskId = appliedCase?.payload?.ask_id || null;
  const gaps = conversionGaps({
    current_stage: stage,
    next_action: account.next_action,
    expected_decision_date: account.expected_decision_date,
    consortium_required: account.consortium_required,
    delivery_partner_account_id: account.delivery_partner_account_id,
  });

  const ctx: CoachContext = {
    stage,
    trigger: text(account.trigger_event, 200),
    buyer: text(account.decision_maker, 200),
    nextAction,
    urgency: Number(account.scores?.urgency ?? 3),
    access: Number(account.scores?.access ?? 3),
    hasBrief: Boolean(brief),
    hasCase: Boolean(appliedCase),
    appliedAskId,
    gaps,
    staleAsk: isStaleAsk(nextAction || '', stage, appliedAskId),
  };

  const fired = collectStalls(ctx);
  const primary = fired[0] || null;
  const supporting = fired.slice(1);
  const stall = primary ? getCoachStall(primary) : null;
  const ask = askForStage(stage);

  const evidence: string[] = [
    `Stage ${stage} (${conversionStageLabel(stage)})`,
    ctx.hasBrief ? `Applied brief ${brief!.id}` : 'No applied brief',
    ctx.hasCase ? `Applied case ${appliedCase!.id}` : 'No applied case',
  ];
  if (!ctx.trigger) evidence.push('Trigger empty');
  else evidence.push(`Trigger: ${ctx.trigger}`);
  if (ctx.urgency <= 2) evidence.push(`Urgency ${ctx.urgency}`);
  if (stage >= 2 && !ctx.buyer) evidence.push('Decision-maker empty');
  if (ctx.access <= 2) evidence.push(`Access ${ctx.access}`);
  if (isWorkingStage(stage) && !ctx.nextAction) evidence.push('Next action empty');
  for (const gap of gaps) evidence.push(`Gap: ${gap}`);

  const sources = ['account fields', 'conversion_gaps'];
  if (brief) sources.push(`brief:${brief.id}`);
  if (appliedCase) sources.push(`case:${appliedCase.id}`);

  let next_action: string | null = null;
  if (stall) next_action = stall.owner_move;
  else if (ask) next_action = ask.ask;
  else next_action = 'Stay at Intelligence until the problem and trigger are named.';

  const why = stall
    ? `${stall.name}. ${stall.owner_move}`
    : ask
      ? `No conversion gap. Stay with ${ask.name}.`
      : 'No conversion gap. Stay at Intelligence.';

  const caveats: string[] = [];
  if (primary === 'no_case') {
    caveats.push('Commercial Case is advice, not a hard block. Coach still offers a next action.');
  }

  return validateCoachDraft({
    stall_reason_id: primary,
    supporting_reason_ids: supporting,
    next_action,
    ask_id: ask?.id || null,
    name_partner: fired.includes('consortium_unnamed'),
    suggested_decision_date: null,
    why,
    evidence,
    caveats,
    sources,
    dropped: [],
    polished: false,
  }, stage);
}

function mergePolish(rules: CoachDraft, raw: unknown, stage: number): CoachDraft {
  const polished = validateCoachDraft(raw, stage);
  const dropped = [...rules.dropped, ...polished.dropped];
  if (polished.stall_reason_id && polished.stall_reason_id !== rules.stall_reason_id) {
    dropped.push('stall_reason_id: locked to rules engine');
  }
  if (polished.ask_id && polished.ask_id !== rules.ask_id) {
    dropped.push('ask_id: locked to rules engine');
  }
  if (polished.suggested_decision_date) {
    dropped.push('suggested_decision_date: dates are not invented');
  }
  return validateCoachDraft({
    stall_reason_id: rules.stall_reason_id,
    supporting_reason_ids: rules.supporting_reason_ids,
    next_action: polished.next_action || rules.next_action,
    ask_id: rules.ask_id,
    name_partner: rules.name_partner,
    suggested_decision_date: rules.suggested_decision_date,
    why: polished.why || rules.why,
    evidence: rules.evidence,
    caveats: [...rules.caveats, ...polished.caveats],
    sources: rules.sources,
    dropped,
    polished: true,
  }, stage);
}

/** Persist a rules draft. Optional polish rewrites next_action + why only. */
export async function generateCoach(input: {
  accountId: string;
  polish?: boolean;
  created_by?: string | null;
}): Promise<ConversionAdviceRecord> {
  const row = db.prepare('SELECT organisation, current_stage FROM accounts WHERE id = ?').get(input.accountId) as
    | { organisation: string; current_stage: number }
    | undefined;
  if (!row) {
    throw new AiRequestError('account_not_found', 404);
  }
  const rules = evaluateCoach(input.accountId);
  if (!coachRequiresAi(input.polish)) {
    return insertAdvice({
      account_id: input.accountId,
      payload: rules,
      model: null,
      provider: null,
      created_by: input.created_by || null,
    });
  }

  const completion = await completeJson(
    buildCoachPolishSystemPrompt(),
    buildCoachPolishUserPrompt({
      organisation: row.organisation,
      stage: Number(row.current_stage),
      rules: {
        stall_reason_id: rules.stall_reason_id,
        ask_id: rules.ask_id,
        name_partner: rules.name_partner,
        evidence: rules.evidence,
        next_action: rules.next_action,
        why: rules.why,
      },
    }),
  );

  const draft = mergePolish(rules, completion.json, Number(row.current_stage));
  return insertAdvice({
    account_id: input.accountId,
    payload: draft,
    model: completion.model,
    provider: completion.provider,
    created_by: input.created_by || null,
  });
}

export function applyCoach(input: {
  adviceId: string;
  accountId: string;
  accepted_fields: string[];
  account_fields?: string[];
}): {
  advice: ConversionAdviceRecord;
  accepted_fields: CoachFieldId[];
  applied_account_fields: CoachApplyAccountField[];
  account: any;
} {
  const record = getAdvice(input.adviceId);
  if (!record) {
    throw new AiRequestError('coach_not_found', 404);
  }
  if (record.status === 'discarded') {
    throw new AiRequestError('Advice was discarded', 400);
  }
  if (record.account_id !== input.accountId) {
    throw new AiRequestError('Advice does not belong to this account', 409);
  }

  const existing = db.prepare('SELECT * FROM accounts WHERE id = ?').get(input.accountId) as any;
  if (!existing) {
    throw new AiRequestError('account_not_found', 404);
  }
  if (!canGenerateCoach(existing.current_stage)) {
    throw new CoachBlockedError();
  }

  const accepted = input.accepted_fields
    .map((id) => String(id).trim())
    .filter((id): id is CoachFieldId => isCoachFieldId(id));
  if (!accepted.length) {
    throw new AiRequestError('accepted_fields must include at least one Coach field', 400);
  }

  const allowed = allowedCoachApplyFields(existing.current_stage);
  const requestedWriteback = (input.account_fields || [])
    .map((f) => String(f).trim())
    .filter((f): f is CoachApplyAccountField => isCoachApplyAccountField(f) && allowed.includes(f));
  const forbidden = (input.account_fields || []).filter((f) =>
    MONEY_KEYS.has(String(f))
    || (COACH_FORBIDDEN_ACCOUNT_FIELDS as readonly string[]).includes(String(f))
    || ((COACH_APPLY_ACCOUNT_FIELDS as readonly string[]).includes(String(f)) && !allowed.includes(f as CoachApplyAccountField))
  );
  const draft = record.payload;
  for (const field of forbidden) {
    draft.dropped = [...draft.dropped, `${field}: cannot write stage, money, or a Proposal-only date from Coach`];
  }

  const patch: Record<string, unknown> = {};
  const applied_account_fields: CoachApplyAccountField[] = [];

  if (
    requestedWriteback.includes('next_action')
    && accepted.includes('next_action')
    && draft.next_action
  ) {
    patch.next_action = draft.next_action;
    applied_account_fields.push('next_action');
  }
  if (
    requestedWriteback.includes('expected_decision_date')
    && accepted.includes('suggested_decision_date')
    && draft.suggested_decision_date
    && canApplyCoachDecisionDate(existing.current_stage)
  ) {
    patch.expected_decision_date = draft.suggested_decision_date;
    applied_account_fields.push('expected_decision_date');
  }

  delete patch.current_stage;
  delete patch.estimated_value;
  delete patch.commercial_model;
  delete patch.consortium_required;
  delete patch.delivery_partner_account_id;

  let updated = existing;
  if (applied_account_fields.length) {
    const next = updateAccount(input.accountId, patch);
    if (!next) {
      throw new AiRequestError('account_not_found', 404);
    }
    updated = next;
  }

  db.prepare(`
    UPDATE conversion_advice
    SET status = 'applied',
        accepted_fields = ?,
        payload = ?,
        applied_at = datetime('now'),
        updated_at = datetime('now')
    WHERE id = ?
  `).run(JSON.stringify(accepted), JSON.stringify(draft), input.adviceId);

  return {
    advice: getAdvice(input.adviceId)!,
    accepted_fields: accepted,
    applied_account_fields,
    account: shapeAccount(updated),
  };
}

export function mapCoachError(e: unknown): { status: number; error: string; message: string } {
  if (e instanceof AiNotConfiguredError) {
    return { status: e.status, error: 'ai_not_configured', message: e.message };
  }
  if (e instanceof CoachBlockedError) {
    return { status: 400, error: e.code, message: e.message };
  }
  if (e instanceof AiRequestError) {
    const known = ['coach_not_found', 'account_not_found'];
    return {
      status: e.status,
      error: known.includes(e.message) ? e.message : 'coach_error',
      message: e.message,
    };
  }
  return { status: 500, error: 'internal_error', message: 'Conversion Coach failed' };
}
