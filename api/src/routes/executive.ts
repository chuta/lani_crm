/**
 * Executive (Mamadou) View — Section 5.2
 * GET /api/executive — Simplified overview for leadership
 */

import { Router, type Request, type Response } from 'express';
import db from '../db.js';
import { PIPELINE_STAGES, type ArchetypeId } from '../types.js';

const router = Router();

router.get('/', (_req: Request, res: Response): void => {
  try {
    // 1. Queue overview — all active deals sorted by priority
    const allActive = db.prepare(`
      SELECT id, partner_name, archetype, priority_score, queue_position,
             current_stage, blocking_factor, bd_owner, tech_owner, created_at
      FROM deals
      WHERE is_archived = 0
      ORDER BY queue_position ASC
    `).all();

    // 2. Bottleneck analysis — deals stuck in a stage (no progress)
    const stuckDeals = (allActive as any[]).filter(d => d.blocking_factor);

    // 3. Stage funnel — how many deals in each stage
    const funnel = PIPELINE_STAGES.map(s => {
      const count = db.prepare(
        'SELECT COUNT(*) as c FROM deals WHERE current_stage = ? AND is_archived = 0'
      ).get(s.id) as any;
      return {
        stage_id: s.id,
        stage_name: s.name,
        owner: s.owner,
        count: count?.c || 0,
      };
    });

    // 4. Archetype distribution
    const archetypeDist = db.prepare(`
      SELECT archetype, COUNT(*) as count
      FROM deals WHERE is_archived = 0
      GROUP BY archetype ORDER BY archetype
    `).all();

    // 5. Priority distribution (low/med/high buckets)
    const priorityBuckets = db.prepare(`
      SELECT
        CASE
          WHEN priority_score >= 3 THEN 'high'
          WHEN priority_score >= 1.5 THEN 'medium'
          ELSE 'low'
        END as bucket,
        COUNT(*) as count,
        ROUND(AVG(priority_score), 2) as avg_score
      FROM deals WHERE is_archived = 0 AND priority_score IS NOT NULL
      GROUP BY bucket
    `).all();

    // 6. "What would move this one faster" — suggestion for each stuck deal
    const suggestions = (stuckDeals as any[]).map((d: any) => {
      let suggestion = '';
      const stage = PIPELINE_STAGES.find(s => s.id === d.current_stage);
      if (d.blocking_factor?.toLowerCase().includes('bsilc')) {
        suggestion = 'Escalate BSILC review — flag to Mamadou or Compliance lead for expedited sign-off';
      } else if (d.blocking_factor?.toLowerCase().includes('legal')) {
        suggestion = 'Legal review bottleneck — schedule a joint call with Legal and BD to resolve terms';
      } else if (d.blocking_factor?.toLowerCase().includes('tech') || d.blocking_factor?.toLowerCase().includes('eng')) {
        suggestion = 'Engineering capacity constraint — review if this can be fast-tracked via template reuse';
      } else if (d.current_stage === 3) {
        suggestion = 'Awaiting Tech triage — escalate to Product/Technology lead via weekly triage forum';
      } else if (!d.tech_owner) {
        suggestion = 'No Tech owner assigned — assign one to unblock next-stage progression';
      } else {
        suggestion = `Review blocking factor "${d.blocking_factor}" in weekly triage forum`;
      }
      return {
        deal_id: d.id,
        partner_name: d.partner_name,
        current_stage: d.current_stage,
        stage_name: stage?.name || 'Unknown',
        blocking_factor: d.blocking_factor,
        suggestion,
      };
    });

    // 7. Summary counts
    const totalDeals = (allActive as any[]).length;
    const needsTriage = (allActive as any[]).filter(d => d.current_stage === 3).length;
    const highPriority = (allActive as any[]).filter(d =>
      d.priority_score && d.priority_score >= 3
    ).length;
    const hasBlocker = stuckDeals.length;

    res.json({
      ok: true,
      queue: allActive,
      funnel,
      archetype_distribution: archetypeDist,
      priority_distribution: priorityBuckets,
      bottlenecks: suggestions,
      summary: {
        total_active_deals: totalDeals,
        awaiting_triage: needsTriage,
        high_priority: highPriority,
        blocked_deals: hasBlocker,
      },
    });
  } catch (e: any) {
    console.error('[executive] Error:', e);
    res.status(500).json({ error: 'internal_error' });
  }
});

export default router;