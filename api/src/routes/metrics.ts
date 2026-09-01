/**
 * Success Metrics — Section 10
 * GET /api/metrics — Track framework KPIs over time
 */

import { Router, type Request, type Response } from 'express';
import db from '../db.js';

const router = Router();

router.get('/', (_req: Request, res: Response): void => {
  try {
    // 1. % of deals correctly self-classified by BD at intake
    const triageResults = db.prepare(`
      SELECT
        COUNT(*) as total_triaged,
        SUM(CASE WHEN archetype = triage_classification_corrected THEN 1 ELSE 0 END) as correct_classifications
      FROM deals
      WHERE triage_classification_corrected IS NOT NULL
    `).get() as any;

    const classificationAccuracy = triageResults.total_triaged > 0
      ? Math.round((triageResults.correct_classifications / triageResults.total_triaged) * 100)
      : null;

    // 2. Average time from Lead to Tech triage response
    const triageTimes = db.prepare(`
      SELECT
        AVG(
          (julianday(triage_response_at) - julianday(created_at)) * 24 * 60
        ) as avg_triage_minutes
      FROM deals
      WHERE triage_response_at IS NOT NULL
    `).get() as any;

    const avgTriageHours = triageTimes.avg_triage_minutes != null
      ? Math.round((triageTimes.avg_triage_minutes / 60) * 10) / 10
      : null;

    // 3. % of deals fast-tracked via existing template vs. requiring fresh design
    const templateReuse = db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN is_repeat = 1 THEN 1 ELSE 0 END) as repeat_templates,
        SUM(CASE WHEN is_repeat = 0 THEN 1 ELSE 0 END) as new_designs
      FROM deals
      WHERE is_archived = 0
    `).get() as any;

    const templateReuseRate = templateReuse.total > 0
      ? Math.round((templateReuse.repeat_templates / templateReuse.total) * 100)
      : 0;

    // 4. Average time-to-launch by archetype (stage 8 reached)
    const timeToLaunch = db.prepare(`
      SELECT
        d.archetype,
        COUNT(*) as launched_count,
        AVG(
          (julianday(
            (SELECT MIN(created_at) FROM stage_transitions WHERE deal_id = d.id AND to_stage = 8)
          ) - julianday(d.created_at))
        ) as avg_days
      FROM deals d
      WHERE d.current_stage >= 8 AND d.is_archived = 0
      GROUP BY d.archetype
    `).all();

    // 5. Engineering hours saved via template reuse (self-reported)
    const engHoursSaved = db.prepare(`
      SELECT
        SUM(CASE WHEN is_repeat = 1 THEN 40 ELSE 0 END) as estimated_hours_saved
      FROM deals
      WHERE is_archived = 0
    `).get() as any;

    // 6. Archetype distribution (which archetypes are most common)
    const archetypeCounts = db.prepare(`
      SELECT archetype, COUNT(*) as count
      FROM deals WHERE is_archived = 0
      GROUP BY archetype ORDER BY count DESC
    `).all();

    // 7. Stage distribution
    const stageCounts = db.prepare(`
      SELECT current_stage, COUNT(*) as count
      FROM deals WHERE is_archived = 0
      GROUP BY current_stage ORDER BY current_stage
    `).all();

    res.json({
      ok: true,
      metrics: {
        classification_accuracy_percent: classificationAccuracy,
        total_triaged_deals: triageResults.total_triaged || 0,
        avg_triage_response_hours: avgTriageHours,
        template_reuse_rate_percent: templateReuseRate,
        template_repeat_count: templateReuse.repeat_templates || 0,
        new_designs_required: templateReuse.new_designs || 0,
        total_active_deals: templateReuse.total || 0,
        estimated_engineer_hours_saved: engHoursSaved.estimated_hours_saved || 0,
        time_to_launch_by_archetype: timeToLaunch,
        archetype_distribution: archetypeCounts,
        stage_distribution: stageCounts,
      },
    });
  } catch (e: any) {
    console.error('[metrics] Error:', e);
    res.status(500).json({ error: 'internal_error' });
  }
});

export default router;