/**
 * Intake — classify a LANI commercial opportunity against A–F, sector, role, geography.
 * Upserts an Account (organisation) and attaches the opportunity via account_id.
 */

import { Router, type Request, type Response } from 'express';
import { randomUUID } from 'node:crypto';
import db from '../db.js';
import {
  DEFAULT_GEOGRAPHY,
  DEFAULT_LANE,
  DEFAULT_PARTNERSHIP_ROLE,
  isArchetypeId,
  isCommercialModelId,
  isGeographyId,
  isLaneId,
  isPartnershipRoleId,
  isSectorId,
} from '../catalog.js';
import { getArchetypeEffortTier, getNoveltyPenalty } from '../services/priority.js';
import {
  DEAL_SELECT,
  mapDealPriorityFromAccount,
  scoresFromBody,
  shapeAccount,
  shapeDeal,
  syncAccountStageFromDeal,
  upsertAccountFromIntake,
} from '../services/account-book.js';
import type { IntakeInput } from '../types.js';

const router = Router();

router.post('/', (req: Request, res: Response): void => {
  try {
    const body = req.body as IntakeInput;
    const errors: string[] = [];

    if (!body.partner_name?.trim() && !(body as any).organisation?.trim()) {
      errors.push('partner_name is required');
    }
    if (!isArchetypeId(body.archetype)) errors.push('archetype must be A–F');

    const sector = body.sector?.trim() || null;
    if (sector && !isSectorId(sector)) errors.push('sector must be a LANI sector overlay');

    const partnershipRole = body.partnership_role || DEFAULT_PARTNERSHIP_ROLE;
    if (!isPartnershipRoleId(partnershipRole)) errors.push('partnership_role is invalid');

    const geography = body.geography || DEFAULT_GEOGRAPHY;
    if (!isGeographyId(geography)) errors.push('geography must be NG, ECOWAS, or GLOBAL');

    const lane = (body as any).lane || DEFAULT_LANE;
    if (!isLaneId(lane)) errors.push('lane is invalid');

    if (!String(body.next_action || '').trim()) {
      errors.push('next_action is required to open a working opportunity');
    }

    if (body.commercial_model && !isCommercialModelId(body.commercial_model)) {
      errors.push('commercial_model is invalid');
    }

    const deliveryPartnerId = String(body.delivery_partner_account_id || '').trim() || null;
    if (deliveryPartnerId) {
      const partner = db.prepare('SELECT id FROM accounts WHERE id = ? AND is_archived = 0').get(deliveryPartnerId);
      if (!partner) errors.push('delivery_partner_account_id must be an active account');
    }

    if (errors.length > 0) {
      res.status(400).json({ error: 'validation_error', details: errors });
      return;
    }

    const organisation = String((body as any).organisation || body.partner_name).trim();
    const scores = scoresFromBody(body);
    const account = upsertAccountFromIntake({
      ...body,
      organisation,
      partnership_role: partnershipRole,
      geography,
      lane,
      ...scores,
    });

    const mapped = mapDealPriorityFromAccount(account.internal_priority);
    const id = `deal_${randomUUID().slice(0, 8)}`;
    const archetype = body.archetype;
    const effortTier = getArchetypeEffortTier(archetype);
    const noveltyPenalty = getNoveltyPenalty(1);

    const allActive = db.prepare(
      `SELECT id, priority_score, is_archived FROM deals WHERE is_archived = 0 ORDER BY priority_score DESC`
    ).all() as { id: string; priority_score: number | null; is_archived: number }[];

    const newEntry = { id, priority_score: mapped.priority_score, is_archived: 0 };
    const sorted = [...allActive, newEntry].sort(
      (a, b) => ((b.priority_score ?? 0) - (a.priority_score ?? 0))
    );
    const queuePosition = sorted.findIndex((d) => d.id === id) + 1;

    db.prepare(`
      INSERT INTO deals (
        id, partner_name, sector, partnership_role, geography, deal_stage, description,
        archetype, is_repeat, novelty_level,
        revenue_potential, strategic_fit,
        effort_tier, novelty_penalty, priority_score, queue_position,
        current_stage, bd_owner, urgency, compliance_flags, account_id, lane,
        next_action, expected_decision_date, delivery_partner_account_id
      ) VALUES (
        @id, @partner_name, @sector, @partnership_role, @geography, @deal_stage, @description,
        @archetype, 0, 1,
        @revenue_potential, @strategic_fit,
        @effort_tier, @novelty_penalty, @priority_score, @queue_position,
        2, @bd_owner, @urgency, @compliance_flags, @account_id, @lane,
        @next_action, @expected_decision_date, @delivery_partner_account_id
      )
    `).run({
      id,
      partner_name: organisation,
      sector,
      partnership_role: partnershipRole,
      geography,
      deal_stage: body.deal_stage?.trim() || null,
      description: body.description?.trim() || (body as any).strategic_problem?.trim() || null,
      archetype,
      revenue_potential: mapped.revenue_potential,
      strategic_fit: mapped.strategic_fit,
      effort_tier: effortTier,
      novelty_penalty: noveltyPenalty,
      priority_score: mapped.priority_score,
      queue_position: queuePosition,
      bd_owner: body.bd_owner?.trim() || (body as any).relationship_owner?.trim() || null,
      urgency: body.urgency?.trim() || null,
      compliance_flags: body.compliance_flags?.trim() || null,
      account_id: account.id,
      lane,
      next_action: String(body.next_action).trim(),
      expected_decision_date: body.expected_decision_date?.trim() || null,
      delivery_partner_account_id: deliveryPartnerId,
    });

    db.prepare(`
      INSERT INTO stage_transitions (deal_id, from_stage, to_stage, triggered_by, note)
      VALUES (@id, 1, 2, @owner, 'Intake form submitted')
    `).run({ id, owner: body.bd_owner || 'BD' });

    syncAccountStageFromDeal(account.id, 2);

    const deal = db.prepare(`${DEAL_SELECT} WHERE d.id = ?`).get(id);

    res.status(201).json({
      ok: true,
      deal: shapeDeal(deal),
      account: shapeAccount(account),
      scores,
      priority_breakdown: {
        formula: 'Internal priority = average of five 1–5 qualification scores (sort only)',
        scores,
        internal_priority: account.internal_priority,
        lane,
        priority_score: mapped.priority_score,
        queue_position: queuePosition,
      },
    });
  } catch (e: any) {
    console.error('[intake] Error:', e);
    res.status(500).json({ error: 'internal_error', message: e?.message || 'Unknown error' });
  }
});

export default router;
