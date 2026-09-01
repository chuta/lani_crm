/**
 * Tech Triage — Section 4.2
 * PATCH /api/deals/:id/triage — Tech confirms or corrects archetype classification
 */

import { Router, type Request, type Response } from 'express';
import db from '../db.js';
import { notifyTriageDue } from '../services/notifications.js';
import { getArchetypeEffortTier, getNoveltyPenalty, computePriorityScore } from '../services/priority.js';
import type { ArchetypeId } from '../types.js';

const router = Router();

router.patch('/:id/triage', (req: Request, res: Response): void => {
  try {
    const deal = db.prepare('SELECT * FROM deals WHERE id = ?').get(req.params.id) as any;
    if (!deal) {
      res.status(404).json({ error: 'not_found' });
      return;
    }

    const { classification_corrected, novelty_flag, responded_by } = req.body;

    if (!classification_corrected || !['I','II','III','IV','V','VI','VII'].includes(classification_corrected)) {
      res.status(400).json({ error: 'invalid_classification', message: 'Must be archetype I-VII' });
      return;
    }

    if (!novelty_flag || !['confirmed_repeat', 'moderate_adaptation', 'genuinely_new'].includes(novelty_flag)) {
      res.status(400).json({ error: 'invalid_novelty_flag' });
      return;
    }

    // Map novelty_flag to novelty_level for re-scoring
    const noveltyLevelMap: Record<string, number> = {
      confirmed_repeat: 1,
      moderate_adaptation: 2,
      genuinely_new: 3,
    };
    const noveltyLevel = noveltyLevelMap[novelty_flag];

    db.prepare(`
      UPDATE deals SET
        archetype = ?,
        triage_classification_corrected = ?,
        triage_novelty_flag = ?,
        triage_response_at = datetime('now'),
        triage_responded_by = ?,
        novelty_level = ?,
        updated_at = datetime('now')
      WHERE id = ?
    `).run(
      classification_corrected,
      classification_corrected,
      novelty_flag,
      responded_by || null,
      noveltyLevel,
      req.params.id
    );

    // Recompute effort tier and priority
    const effortTier = getArchetypeEffortTier(classification_corrected as ArchetypeId);
    const noveltyPenalty = getNoveltyPenalty(noveltyLevel);

    db.prepare('UPDATE deals SET effort_tier = ?, novelty_penalty = ? WHERE id = ?')
      .run(effortTier, noveltyPenalty, req.params.id);

    // Recompute priority
    const updated = db.prepare('SELECT * FROM deals WHERE id = ?').get(req.params.id) as any;
    const priorityScore = computePriorityScore(
      updated.revenue_potential,
      updated.strategic_fit,
      effortTier,
      noveltyPenalty
    );

    db.prepare('UPDATE deals SET priority_score = ? WHERE id = ?')
      .run(priorityScore, req.params.id);

    // Recompute queue
    const allActive = db.prepare(
      'SELECT id, priority_score, is_archived FROM deals WHERE is_archived = 0 ORDER BY priority_score DESC'
    ).all() as { id: string; priority_score: number | null; is_archived: number }[];

    const sorted = allActive.sort((a, b) => ((b.priority_score ?? 0) - (a.priority_score ?? 0)));
    sorted.forEach((d, i) => {
      db.prepare('UPDATE deals SET queue_position = ? WHERE id = ?').run(i + 1, d.id);
    });

    const final = db.prepare('SELECT * FROM deals WHERE id = ?').get(req.params.id);
    res.json({ ok: true, deal: final });
  } catch (e: any) {
    console.error('[triage] Error:', e);
    res.status(500).json({ error: 'internal_error' });
  }
});

// POST /api/triage/remind/:id — Send triage reminder
router.post('/remind/:id', (req: Request, res: Response): void => {
  try {
    const deal = db.prepare('SELECT * FROM deals WHERE id = ?').get(req.params.id) as any;
    if (!deal) {
      res.status(404).json({ error: 'not_found' });
      return;
    }

    if (deal.tech_owner) {
      void notifyTriageDue(deal.partner_name, deal.archetype, deal.tech_owner);
    }

    res.json({ ok: true, message: 'Triage reminder sent (if configured)' });
  } catch (e: any) {
    console.error('[triage] Remind error:', e);
    res.status(500).json({ error: 'internal_error' });
  }
});

export default router;