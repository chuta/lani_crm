import { randomUUID } from 'node:crypto';
import db from '../db.js';
import {
  DEFAULT_GEOGRAPHY,
  DEFAULT_LANE,
  DEFAULT_PARTNERSHIP_ROLE,
  defaultModelForRole,
  isArchetypeId,
  isCommercialModelId,
  isGeographyId,
  isLaneId,
  isPartnershipRoleId,
  isProposalOrLater,
  isScore,
  isSectorId,
  isWorkingStage,
} from '../catalog.js';
import { computeInternalPriority } from './priority.js';

export interface AccountScores {
  score_strategic_fit: number;
  score_access: number;
  score_commercial: number;
  score_urgency: number;
  score_conversion: number;
}

export function parseScore(value: unknown, fallback = 3): number {
  const n = Number(value);
  return isScore(n) ? n : fallback;
}

export function scoresFromBody(body: any, existing?: AccountScores | null): AccountScores {
  const fallback = existing ?? {
    score_strategic_fit: 3,
    score_access: 3,
    score_commercial: 3,
    score_urgency: 3,
    score_conversion: 3,
  };
  const pick = (direct: unknown, nested: unknown, current: number) => {
    if (direct !== undefined && direct !== null && direct !== '') return parseScore(direct, current);
    if (nested !== undefined && nested !== null && nested !== '') return parseScore(nested, current);
    return current;
  };
  return {
    score_strategic_fit: pick(body.score_strategic_fit, body.scores?.strategic_fit, fallback.score_strategic_fit),
    score_access: pick(body.score_access, body.scores?.access, fallback.score_access),
    score_commercial: pick(body.score_commercial, body.scores?.commercial, fallback.score_commercial),
    score_urgency: pick(body.score_urgency, body.scores?.urgency, fallback.score_urgency),
    score_conversion: pick(body.score_conversion, body.scores?.conversion, fallback.score_conversion),
  };
}

export function conversionGaps(record: {
  current_stage?: number | null;
  next_action?: string | null;
  expected_decision_date?: string | null;
  consortium_required?: boolean | number | null;
  delivery_partner_account_id?: string | null;
}, targetStage?: number): string[] {
  const stage = Number(targetStage ?? record.current_stage ?? 1);
  const gaps: string[] = [];
  const next = String(record.next_action || '').trim();
  const date = String(record.expected_decision_date || '').trim();
  const partner = String(record.delivery_partner_account_id || '').trim();
  const consortium = Boolean(record.consortium_required);
  if (isWorkingStage(stage) && !next) gaps.push('next_action');
  if (isProposalOrLater(stage) && !date) gaps.push('expected_decision_date');
  if (isProposalOrLater(stage) && consortium && !partner) gaps.push('delivery_partner');
  return gaps;
}

export const CONVERSION_GAP_LABELS: Record<string, string> = {
  next_action: 'Set a next action',
  expected_decision_date: 'Set an expected decision date',
  delivery_partner: 'Name the delivery partner — consortium is required',
};

export function shapeAccount(row: any) {
  if (!row) return row;
  const gaps = conversionGaps({
    current_stage: row.current_stage,
    next_action: row.next_action,
    expected_decision_date: row.expected_decision_date,
    consortium_required: row.consortium_required,
    delivery_partner_account_id: row.delivery_partner_account_id,
  });
  return {
    ...row,
    consortium_required: Boolean(row.consortium_required),
    is_archived: Number(row.is_archived) || 0,
    commercial_model: row.commercial_model || defaultModelForRole(row.partnership_role),
    conversion_gaps: gaps,
    scores: {
      strategic_fit: row.score_strategic_fit,
      access: row.score_access,
      commercial: row.score_commercial,
      urgency: row.score_urgency,
      conversion: row.score_conversion,
    },
  };
}

function nullableText(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  const s = String(value).trim();
  return s ? s : null;
}

function nullableNumber(value: unknown): number | null {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function validateAccountPayload(body: any, { requireOrg = true } = {}): string[] {
  const errors: string[] = [];
  const org = String(body.organisation || body.partner_name || '').trim();
  if (requireOrg && !org) errors.push('organisation is required');
  if (requireOrg && !isArchetypeId(body.archetype)) errors.push('archetype must be A–F');
  if (!requireOrg && body.archetype !== undefined && body.archetype !== '' && !isArchetypeId(body.archetype)) {
    errors.push('archetype must be A–F');
  }
  if (body.sector && !isSectorId(body.sector)) errors.push('sector is invalid');
  if (body.partnership_role && !isPartnershipRoleId(body.partnership_role)) errors.push('partnership_role is invalid');
  if (body.geography && !isGeographyId(body.geography)) errors.push('geography is invalid');
  if (body.lane && !isLaneId(body.lane)) errors.push('lane is invalid');
  if (body.commercial_model && !isCommercialModelId(body.commercial_model)) errors.push('commercial_model is invalid');
  if (body.delivery_partner_account_id) {
    const partnerId = String(body.delivery_partner_account_id).trim();
    if (partnerId) {
      const partner = db.prepare('SELECT id FROM accounts WHERE id = ? AND is_archived = 0').get(partnerId);
      if (!partner) errors.push('delivery_partner_account_id must be an active account');
    }
  }
  if (body.current_stage !== undefined && body.current_stage !== '') {
    const stage = Number(body.current_stage);
    if (stage < 1 || stage > 8) errors.push('current_stage must be 1–8');
  }
  if (body.probability !== undefined && body.probability !== null && body.probability !== '') {
    const p = Number(body.probability);
    if (!Number.isFinite(p) || p < 0 || p > 100) errors.push('probability must be 0–100');
  }
  return errors;
}

export function upsertAccountFromIntake(body: any): any {
  const organisation = String(body.organisation || body.partner_name).trim();
  const existing = db.prepare(
    `SELECT * FROM accounts WHERE is_archived = 0 AND lower(organisation) = lower(?) LIMIT 1`
  ).get(organisation) as any;
  if (existing) {
    return updateAccount(existing.id, { ...body, organisation });
  }
  return insertAccount({ ...body, organisation });
}

export function insertAccount(body: any): any {
  const organisation = String(body.organisation || body.partner_name).trim();
  const scores = scoresFromBody(body);
  const internalPriority = computeInternalPriority(scores);
  const id = `acct_${randomUUID().slice(0, 8)}`;
  const role = body.partnership_role || DEFAULT_PARTNERSHIP_ROLE;
  const partnerId = nullableText(body.delivery_partner_account_id);
  if (partnerId === id) {
    throw new Error('An organisation cannot be its own delivery partner');
  }
  db.prepare(`
    INSERT INTO accounts (
      id, organisation, archetype, sector, partnership_role, geography, lane, current_stage,
      decision_maker, contact_email, relationship_owner, strategic_problem, trigger_event,
      lani_capability, potential_partners, estimated_value, probability, expected_decision_date,
      next_action, notes, consortium_required, commercial_model, delivery_partner_account_id,
      score_strategic_fit, score_access, score_commercial, score_urgency, score_conversion,
      internal_priority
    ) VALUES (
      @id, @organisation, @archetype, @sector, @partnership_role, @geography, @lane, @current_stage,
      @decision_maker, @contact_email, @relationship_owner, @strategic_problem, @trigger_event,
      @lani_capability, @potential_partners, @estimated_value, @probability, @expected_decision_date,
      @next_action, @notes, @consortium_required, @commercial_model, @delivery_partner_account_id,
      @score_strategic_fit, @score_access, @score_commercial, @score_urgency, @score_conversion,
      @internal_priority
    )
  `).run({
    id,
    organisation,
    archetype: body.archetype,
    sector: nullableText(body.sector),
    partnership_role: role,
    geography: body.geography || DEFAULT_GEOGRAPHY,
    lane: body.lane || DEFAULT_LANE,
    current_stage: Number(body.current_stage) || 1,
    decision_maker: nullableText(body.decision_maker),
    contact_email: nullableText(body.contact_email),
    relationship_owner: nullableText(body.relationship_owner || body.bd_owner),
    strategic_problem: nullableText(body.strategic_problem || body.description),
    trigger_event: nullableText(body.trigger_event),
    lani_capability: nullableText(body.lani_capability),
    potential_partners: nullableText(body.potential_partners),
    estimated_value: nullableNumber(body.estimated_value),
    probability: nullableNumber(body.probability),
    expected_decision_date: nullableText(body.expected_decision_date),
    next_action: nullableText(body.next_action),
    notes: nullableText(body.notes),
    consortium_required: body.consortium_required ? 1 : 0,
    commercial_model: body.commercial_model || defaultModelForRole(role),
    delivery_partner_account_id: partnerId,
    ...scores,
    internal_priority: internalPriority,
  });
  return db.prepare('SELECT * FROM accounts WHERE id = ?').get(id);
}

export function updateAccount(id: string, body: any): any {
  const existing = db.prepare('SELECT * FROM accounts WHERE id = ?').get(id) as any;
  if (!existing) return null;

  const scores = scoresFromBody(body, {
    score_strategic_fit: existing.score_strategic_fit,
    score_access: existing.score_access,
    score_commercial: existing.score_commercial,
    score_urgency: existing.score_urgency,
    score_conversion: existing.score_conversion,
  });
  const internalPriority = computeInternalPriority(scores);

  const fields: Record<string, any> = {
    organisation: body.organisation !== undefined ? String(body.organisation).trim() : existing.organisation,
    archetype: body.archetype || existing.archetype,
    sector: body.sector !== undefined ? nullableText(body.sector) : existing.sector,
    partnership_role: body.partnership_role || existing.partnership_role,
    geography: body.geography || existing.geography,
    lane: body.lane || existing.lane,
    current_stage: body.current_stage !== undefined && body.current_stage !== '' ? Number(body.current_stage) : existing.current_stage,
    decision_maker: body.decision_maker !== undefined ? nullableText(body.decision_maker) : existing.decision_maker,
    contact_email: body.contact_email !== undefined ? nullableText(body.contact_email) : existing.contact_email,
    relationship_owner: body.relationship_owner !== undefined
      ? nullableText(body.relationship_owner)
      : (body.bd_owner !== undefined ? nullableText(body.bd_owner) : existing.relationship_owner),
    strategic_problem: body.strategic_problem !== undefined
      ? nullableText(body.strategic_problem)
      : (body.description !== undefined ? nullableText(body.description) : existing.strategic_problem),
    trigger_event: body.trigger_event !== undefined ? nullableText(body.trigger_event) : existing.trigger_event,
    lani_capability: body.lani_capability !== undefined ? nullableText(body.lani_capability) : existing.lani_capability,
    potential_partners: body.potential_partners !== undefined ? nullableText(body.potential_partners) : existing.potential_partners,
    estimated_value: body.estimated_value !== undefined ? nullableNumber(body.estimated_value) : existing.estimated_value,
    probability: body.probability !== undefined ? nullableNumber(body.probability) : existing.probability,
    expected_decision_date: body.expected_decision_date !== undefined ? nullableText(body.expected_decision_date) : existing.expected_decision_date,
    revenue_originated: body.revenue_originated !== undefined ? nullableNumber(body.revenue_originated) ?? 0 : existing.revenue_originated,
    revenue_influenced: body.revenue_influenced !== undefined ? nullableNumber(body.revenue_influenced) ?? 0 : existing.revenue_influenced,
    next_action: body.next_action !== undefined ? nullableText(body.next_action) : existing.next_action,
    notes: body.notes !== undefined ? nullableText(body.notes) : existing.notes,
    consortium_required: body.consortium_required !== undefined ? (body.consortium_required ? 1 : 0) : existing.consortium_required,
    commercial_model: body.commercial_model || existing.commercial_model || defaultModelForRole(body.partnership_role || existing.partnership_role),
    delivery_partner_account_id: body.delivery_partner_account_id !== undefined
      ? nullableText(body.delivery_partner_account_id)
      : existing.delivery_partner_account_id,
    ...scores,
    internal_priority: internalPriority,
  };

  if (fields.delivery_partner_account_id === id) {
    throw new Error('An organisation cannot be its own delivery partner');
  }

  db.prepare(`
    UPDATE accounts SET
      organisation=@organisation, archetype=@archetype, sector=@sector, partnership_role=@partnership_role,
      geography=@geography, lane=@lane, current_stage=@current_stage, decision_maker=@decision_maker,
      contact_email=@contact_email, relationship_owner=@relationship_owner, strategic_problem=@strategic_problem,
      trigger_event=@trigger_event, lani_capability=@lani_capability, potential_partners=@potential_partners,
      estimated_value=@estimated_value, probability=@probability, expected_decision_date=@expected_decision_date,
      revenue_originated=@revenue_originated, revenue_influenced=@revenue_influenced, next_action=@next_action,
      notes=@notes, consortium_required=@consortium_required, commercial_model=@commercial_model,
      delivery_partner_account_id=@delivery_partner_account_id,
      score_strategic_fit=@score_strategic_fit, score_access=@score_access, score_commercial=@score_commercial,
      score_urgency=@score_urgency, score_conversion=@score_conversion, internal_priority=@internal_priority,
      updated_at=datetime('now')
    WHERE id=@id
  `).run({ id, ...fields });

  return db.prepare('SELECT * FROM accounts WHERE id = ?').get(id);
}

export function mapDealPriorityFromAccount(internalPriority: number): {
  revenue_potential: number;
  strategic_fit: number;
  priority_score: number;
} {
  const rounded = Math.round(internalPriority);
  const band = rounded <= 2 ? 1 : rounded === 3 ? 2 : 3;
  return {
    revenue_potential: band,
    strategic_fit: band,
    priority_score: internalPriority,
  };
}

export const DEAL_SELECT = `
  SELECT d.*,
    COALESCE(d.lane, a.lane, 'immediate') AS lane,
    a.trigger_event AS trigger_event,
    a.decision_maker AS decision_maker,
    a.next_action AS account_next_action,
    a.internal_priority AS account_internal_priority,
    a.consortium_required AS consortium_required,
    a.organisation AS account_organisation,
    a.commercial_model AS commercial_model,
    COALESCE(NULLIF(d.next_action, ''), a.next_action) AS next_action,
    COALESCE(NULLIF(d.expected_decision_date, ''), a.expected_decision_date) AS expected_decision_date,
    COALESCE(d.delivery_partner_account_id, a.delivery_partner_account_id) AS delivery_partner_account_id,
    p.organisation AS delivery_partner_name
  FROM deals d
  LEFT JOIN accounts a ON a.id = d.account_id
  LEFT JOIN accounts p ON p.id = COALESCE(d.delivery_partner_account_id, a.delivery_partner_account_id)
`;

export function shapeDeal(row: any) {
  if (!row) return row;
  const nextAction = row.next_action || row.account_next_action;
  const decisionDate = row.expected_decision_date;
  const partnerId = row.delivery_partner_account_id;
  const consortium = Boolean(row.consortium_required);
  return {
    ...row,
    consortium_required: consortium,
    next_action: nextAction,
    conversion_gaps: conversionGaps({
      current_stage: row.current_stage,
      next_action: nextAction,
      expected_decision_date: decisionDate,
      consortium_required: consortium,
      delivery_partner_account_id: partnerId,
    }),
  };
}

/** Bump the account along the conversion path when an opportunity moves forward. */
export function syncAccountStageFromDeal(accountId: string | null | undefined, dealStage: number): void {
  if (!accountId) return;
  const account = db.prepare('SELECT current_stage FROM accounts WHERE id = ?').get(accountId) as
    { current_stage: number } | undefined;
  if (!account) return;
  if (account.current_stage === 7 || account.current_stage === 8) return;
  if (dealStage === 7 || dealStage === 8) return;
  if (dealStage >= 1 && dealStage <= 6 && dealStage > account.current_stage) {
    db.prepare(`UPDATE accounts SET current_stage = ?, updated_at = datetime('now') WHERE id = ?`)
      .run(dealStage, accountId);
  }
}
