/**
 * Executive view — pipeline by lane, archetype, trigger, and conversion.
 */

import { Router, type Request, type Response } from 'express';
import db from '../db.js';
import { COMMERCIAL_LANES, CONVERSION_STAGES, conversionStageLabel } from '../catalog.js';
import { shapeAccount } from '../services/account-book.js';

const router = Router();

router.get('/', (_req: Request, res: Response): void => {
  try {
    const allActive = (db.prepare(`
      SELECT * FROM accounts
      WHERE is_archived = 0
      ORDER BY internal_priority DESC, updated_at DESC
    `).all() as any[]).map((row) => {
      const account = shapeAccount(row);
      return {
        ...account,
        account_id: account.id,
        partner_name: account.organisation,
        priority_score: account.internal_priority,
        bd_owner: account.relationship_owner,
        blocking_factor: account.current_stage === 8 ? 'On hold' : null,
      };
    });

    const stuckDeals = allActive.filter((d: any) => d.blocking_factor || d.current_stage === 8);

    const funnel = CONVERSION_STAGES.map((s) => {
      const count = allActive.filter((d: any) => d.current_stage === s.id).length;
      return {
        stage_id: s.id,
        stage_name: s.label,
        owner: s.owner,
        count,
      };
    });

    const lanes = COMMERCIAL_LANES.map((lane) => ({
      id: lane.id,
      name: lane.name,
      short: lane.short,
      horizon: lane.horizon,
      count: allActive.filter((d: any) => d.lane === lane.id).length,
    }));

    const archetypeDist = db.prepare(`
      SELECT archetype, COUNT(*) as count
      FROM accounts WHERE is_archived = 0
      GROUP BY archetype ORDER BY archetype
    `).all();

    const triggerDist = db.prepare(`
      SELECT COALESCE(NULLIF(trigger_event, ''), 'Unspecified') as trigger_event, COUNT(*) as count
      FROM accounts
      WHERE is_archived = 0
      GROUP BY COALESCE(NULLIF(trigger_event, ''), 'Unspecified')
      ORDER BY count DESC
    `).all();

    const priorityBuckets = db.prepare(`
      SELECT
        CASE
          WHEN internal_priority >= 4 THEN 'high'
          WHEN internal_priority >= 3 THEN 'medium'
          ELSE 'low'
        END as bucket,
        COUNT(*) as count,
        ROUND(AVG(internal_priority), 2) as avg_score
      FROM accounts WHERE is_archived = 0 AND internal_priority IS NOT NULL
      GROUP BY bucket
    `).all();

    const bottlenecks = stuckDeals.map((d: any) => {
      let suggestion = '';
      if (d.current_stage === 8) {
        suggestion = 'On hold — confirm whether to restart the conversation or archive.';
      } else if (!d.decision_maker && (d.current_stage <= 3)) {
        suggestion = 'No decision-maker named — this is an access problem, not a delivery problem.';
      } else if (!d.account_next_action) {
        suggestion = 'Set a next action and expected decision date so this does not stall.';
      } else if (d.blocking_factor?.toLowerCase().includes('legal')) {
        suggestion = 'Legal or contracting bottleneck — schedule a joint review with the relationship owner.';
      } else if (d.consortium_required) {
        suggestion = 'Consortium required — name the delivery partner before promising scope.';
      } else {
        suggestion = `Review "${d.blocking_factor}" with ${d.bd_owner || 'the relationship owner'}.`;
      }
      return {
        deal_id: d.id,
        account_id: d.account_id || d.id,
        partner_name: d.partner_name,
        current_stage: d.current_stage,
        stage_name: conversionStageLabel(d.current_stage),
        lane: d.lane,
        blocking_factor: d.blocking_factor || (d.current_stage === 8 ? 'On hold' : null),
        suggestion,
      };
    });

    const qualifiedBook = allActive.filter((d: any) => d.current_stage >= 2 && d.current_stage <= 5);
    const working = qualifiedBook.length;
    const estimatedValue = qualifiedBook.reduce((sum: number, d: any) => {
      const value = Number(d.estimated_value);
      return sum + (Number.isFinite(value) ? value : 0);
    }, 0);
    const estimatedValueCount = qualifiedBook.filter((d: any) => {
      const value = Number(d.estimated_value);
      return Number.isFinite(value) && value > 0;
    }).length;
    const inConversation = allActive.filter((d: any) => d.current_stage === 3).length;
    const atProposal = allActive.filter((d: any) => d.current_stage === 4 || d.current_stage === 5).length;
    const won = allActive.filter((d: any) => d.current_stage === 6).length;
    const highPriority = allActive.filter((d: any) => d.priority_score && d.priority_score >= 4).length;
    const missingNextAction = allActive.filter((d: any) =>
      d.conversion_gaps?.includes('next_action')
    ).length;
    const unnamedConsortium = allActive.filter((d: any) =>
      d.conversion_gaps?.includes('delivery_partner')
    ).length;
    const ecosystemPartners = (db.prepare(`
      SELECT COUNT(*) as count FROM accounts
      WHERE is_archived = 0 AND partnership_role != 'end_client'
    `).get() as { count: number }).count;

    res.json({
      ok: true,
      queue: allActive,
      funnel,
      lanes,
      archetype_distribution: archetypeDist,
      trigger_distribution: triggerDist,
      priority_distribution: priorityBuckets,
      bottlenecks,
      summary: {
        total_active_deals: allActive.length,
        working,
        in_conversation: inConversation,
        at_proposal: atProposal,
        won,
        high_priority: highPriority,
        stalled: stuckDeals.length,
        awaiting_triage: allActive.filter((d: any) => d.current_stage <= 2).length,
        blocked_deals: stuckDeals.length,
        missing_next_action: missingNextAction,
        unnamed_consortium: unnamedConsortium,
        ecosystem_partners: ecosystemPartners,
        estimated_value: estimatedValue,
        estimated_value_count: estimatedValueCount,
        qualified_accounts: qualifiedBook.length,
      },
    });
  } catch (e: any) {
    console.error('[executive] Error:', e);
    res.status(500).json({ error: 'internal_error' });
  }
});

export default router;
