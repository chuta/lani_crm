/**
 * Deals endpoints
 * GET  /api/deals — List all deals with optional filters
 * GET  /api/deals/:id — Single deal detail with transitions
 * PATCH /api/deals/:id/stage — Advance deal stage
 * PATCH /api/deals/:id/blocker — Update blocking factor
 * PATCH /api/deals/:id/owner — Update owner
 * PATCH /api/deals/:id/priority — Re-score priority
 * DELETE /api/deals/:id — Archive a deal
 */

import { Router, type Request, type Response } from 'express';
import db from '../db.js';
import {
  getArchetypeEffortTier,
  getNoveltyPenalty,
  computePriorityScore,
} from '../services/priority.js';
import { notifyStageChange } from '../services/notifications.js';
import { PIPELINE_STAGES } from '../types.js';
import type { ArchetypeId } from '../types.js';

const router = Router();

// GET /api/deals — List all deals
router.get('/', (req: Request, res: Response): void => {
  try {
    const { archetype, stage, archived, search } = req.query;

    let sql = 'SELECT * FROM deals WHERE 1=1';
    const params: any[] = [];

    if (archetype) {
      sql += ' AND archetype = ?';
      params.push(archetype);
    }
    if (stage) {
      sql += ' AND current_stage = ?';
      params.push(Number(stage));
    }
    if (archived === 'true') {
      sql += ' AND is_archived = 1';
    } else if (archived !== 'all') {
      sql += ' AND is_archived = 0';
    }
    if (search) {
      sql += ' AND (partner_name LIKE ? OR description LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }

    sql += ' ORDER BY priority_score DESC, created_at DESC';

    const deals = db.prepare(sql).all(...params);
    res.json({ ok: true, deals, total: (deals as any[]).length });
  } catch (e: any) {
    console.error('[deals] List error:', e);
    res.status(500).json({ error: 'internal_error' });
  }
});

// GET /api/deals/:id — Single deal detail
router.get('/:id', (req: Request, res: Response): void => {
  try {
    const deal = db.prepare('SELECT * FROM deals WHERE id = ?').get(req.params.id) as any;
    if (!deal) {
      res.status(404).json({ error: 'not_found' });
      return;
    }

    const transitions = db.prepare(
      'SELECT * FROM stage_transitions WHERE deal_id = ? ORDER BY created_at ASC'
    ).all(req.params.id);

    res.json({ ok: true, deal, transitions });
  } catch (e: any) {
    console.error('[deals] Get error:', e);
    res.status(500).json({ error: 'internal_error' });
  }
});

// PATCH /api/deals/:id/stage — Advance deal stage
router.patch('/:id/stage', (req: Request, res: Response): void => {
  try {
    const deal = db.prepare('SELECT * FROM deals WHERE id = ?').get(req.params.id) as any;
    if (!deal) {
      res.status(404).json({ error: 'not_found' });
      return;
    }

    const { stage, triggered_by, note } = req.body;
    const newStage = Number(stage);

    if (newStage < 1 || newStage > 9) {
      res.status(400).json({ error: 'invalid_stage', message: 'Stage must be 1-9' });
      return;
    }

    const fromStage = deal.current_stage;

    db.prepare('UPDATE deals SET current_stage = ?, updated_at = datetime(\'now\') WHERE id = ?')
      .run(newStage, req.params.id);

    db.prepare(
      'INSERT INTO stage_transitions (deal_id, from_stage, to_stage, triggered_by, note) VALUES (?, ?, ?, ?, ?)'
    ).run(req.params.id, fromStage, newStage, triggered_by || null, note || null);

    // Recompute queue position if score-relevant fields changed
    const updated = db.prepare('SELECT * FROM deals WHERE id = ?').get(req.params.id) as any;

    // Send Teams notification
    const stageName = PIPELINE_STAGES.find(s => s.id === newStage);
    const owner = stageName?.owner || 'Unknown';
    void notifyStageChange(
      req.params.id,
      updated.partner_name,
      newStage,
      owner,
      updated.bd_owner,
      updated.tech_owner
    );

    res.json({ ok: true, deal: updated });
  } catch (e: any) {
    console.error('[deals] Stage error:', e);
    res.status(500).json({ error: 'internal_error' });
  }
});

// PATCH /api/deals/:id/blocker — Update blocking factor
router.patch('/:id/blocker', (req: Request, res: Response): void => {
  try {
    const { blocking_factor } = req.body;
    db.prepare('UPDATE deals SET blocking_factor = ?, updated_at = datetime(\'now\') WHERE id = ?')
      .run(blocking_factor || null, req.params.id);
    const deal = db.prepare('SELECT * FROM deals WHERE id = ?').get(req.params.id);
    res.json({ ok: true, deal });
  } catch (e: any) {
    console.error('[deals] Blocker error:', e);
    res.status(500).json({ error: 'internal_error' });
  }
});

// PATCH /api/deals/:id/owner — Update owner(s)
router.patch('/:id/owner', (req: Request, res: Response): void => {
  try {
    const { bd_owner, tech_owner } = req.body;
    const updates: string[] = [];
    const params: any[] = [];

    if (bd_owner !== undefined) { updates.push('bd_owner = ?'); params.push(bd_owner || null); }
    if (tech_owner !== undefined) { updates.push('tech_owner = ?'); params.push(tech_owner || null); }

    if (updates.length === 0) {
      res.status(400).json({ error: 'no_fields' });
      return;
    }

    updates.push('updated_at = datetime(\'now\')');
    params.push(req.params.id);

    db.prepare(`UPDATE deals SET ${updates.join(', ')} WHERE id = ?`).run(...params);
    const deal = db.prepare('SELECT * FROM deals WHERE id = ?').get(req.params.id);
    res.json({ ok: true, deal });
  } catch (e: any) {
    console.error('[deals] Owner error:', e);
    res.status(500).json({ error: 'internal_error' });
  }
});

// PATCH /api/deals/:id/priority — Re-score priority
router.patch('/:id/priority', (req: Request, res: Response): void => {
  try {
    const deal = db.prepare('SELECT * FROM deals WHERE id = ?').get(req.params.id) as any;
    if (!deal) {
      res.status(404).json({ error: 'not_found' });
      return;
    }

    const body = req.body;
    const revenuePotential = body.revenue_potential ?? deal.revenue_potential;
    const strategicFit = body.strategic_fit ?? deal.strategic_fit;
    const noveltyLevel = body.novelty_level ?? deal.novelty_level;

    const effortTier = getArchetypeEffortTier(deal.archetype as ArchetypeId);
    const noveltyPenalty = getNoveltyPenalty(noveltyLevel);
    const priorityScore = computePriorityScore(revenuePotential, strategicFit, effortTier, noveltyPenalty);

    db.prepare(`
      UPDATE deals SET
        revenue_potential = ?, strategic_fit = ?, novelty_level = ?,
        novelty_penalty = ?, priority_score = ?,
        updated_at = datetime('now')
      WHERE id = ?
    `).run(revenuePotential, strategicFit, noveltyLevel, noveltyPenalty, priorityScore, req.params.id);

    // Recompute all queue positions
    const allActive = db.prepare(
      'SELECT id, priority_score, is_archived FROM deals WHERE is_archived = 0 ORDER BY priority_score DESC'
    ).all() as { id: string; priority_score: number | null; is_archived: number }[];

    const sorted = allActive.sort((a, b) => ((b.priority_score ?? 0) - (a.priority_score ?? 0)));
    sorted.forEach((d, i) => {
      db.prepare('UPDATE deals SET queue_position = ? WHERE id = ?').run(i + 1, d.id);
    });

    const updated = db.prepare('SELECT * FROM deals WHERE id = ?').get(req.params.id);
    res.json({
      ok: true,
      deal: updated,
      priority_breakdown: {
        formula: '(Revenue × Strategic Fit) ÷ (Effort Tier × Novelty Penalty)',
        revenue_potential: revenuePotential,
        strategic_fit: strategicFit,
        effort_tier: effortTier,
        novelty_penalty: noveltyPenalty,
        priority_score: priorityScore,
      },
    });
  } catch (e: any) {
    console.error('[deals] Priority re-score error:', e);
    res.status(500).json({ error: 'internal_error' });
  }
});

// PATCH /api/deals/:id — Update deal fields
router.patch('/:id', (req: Request, res: Response): void => {
  try {
    const deal = db.prepare('SELECT * FROM deals WHERE id = ?').get(req.params.id) as any;
    if (!deal) {
      res.status(404).json({ error: 'not_found' });
      return;
    }

    const updatable = [
      'partner_name', 'sector', 'description', 'bd_owner', 'tech_owner',
      'urgency', 'compliance_flags', 'is_repeat',
    ];
    // Also allow priority fields that trigger re-score
    const priorityFields = ['revenue_potential', 'strategic_fit', 'novelty_level', 'archetype'];
    // Allow triage fields (for admin override of triage metadata)
    const triageFields = ['triage_classification_corrected', 'triage_responded_by'];
    const allFields = [...updatable, ...priorityFields, ...triageFields];

    const updates: string[] = [];
    const params: any[] = [];

    for (const f of allFields) {
      if (req.body[f] !== undefined) {
        updates.push(`${f} = ?`);
        params.push(req.body[f]);
      }
    }

    if (updates.length === 0) {
      res.status(400).json({ error: 'no_fields' });
      return;
    }

    updates.push("updated_at = datetime('now')");
    params.push(req.params.id);

    db.prepare(`UPDATE deals SET ${updates.join(', ')} WHERE id = ?`).run(...params);

    // Re-score priority if any priority fields changed
    const hasPriorityChange = priorityFields.some(f => req.body[f] !== undefined);
    const hasTriageChange = triageFields.some(f => req.body[f] !== undefined);
    if (hasPriorityChange || hasTriageChange) {
      const updated = db.prepare('SELECT * FROM deals WHERE id = ?').get(req.params.id) as any;

      // If triage was explicitly set, mark the response timestamp
      if (hasTriageChange && req.body.triage_classification_corrected) {
        db.prepare('UPDATE deals SET triage_response_at = COALESCE(triage_response_at, datetime(\'now\')) WHERE id = ?')
          .run(req.params.id);
      }

      const effortTier = getArchetypeEffortTier(updated.archetype as ArchetypeId);
      const noveltyPenalty = getNoveltyPenalty(updated.novelty_level);
      const priorityScore = computePriorityScore(
        updated.revenue_potential, updated.strategic_fit, effortTier, noveltyPenalty
      );
      db.prepare('UPDATE deals SET effort_tier = ?, novelty_penalty = ?, priority_score = ? WHERE id = ?')
        .run(effortTier, noveltyPenalty, priorityScore, req.params.id);

      // Recompute queue positions
      const allActive = db.prepare(
        'SELECT id, priority_score FROM deals WHERE is_archived = 0 ORDER BY priority_score DESC'
      ).all() as { id: string; priority_score: number | null }[];
      allActive.sort((a, b) => ((b.priority_score ?? 0) - (a.priority_score ?? 0)));
      allActive.forEach((d, i) => {
        db.prepare('UPDATE deals SET queue_position = ? WHERE id = ?').run(i + 1, d.id);
      });
    }

    const updated = db.prepare('SELECT * FROM deals WHERE id = ?').get(req.params.id);
    res.json({ ok: true, deal: updated });
  } catch (e: any) {
    console.error('[deals] Update error:', e);
    res.status(500).json({ error: 'internal_error' });
  }
});

// DELETE /api/deals/:id — Archive a deal
router.delete('/:id', (req: Request, res: Response): void => {
  try {
    db.prepare('UPDATE deals SET is_archived = 1, updated_at = datetime(\'now\') WHERE id = ?')
      .run(req.params.id);
    res.json({ ok: true, message: 'Deal archived' });
  } catch (e: any) {
    console.error('[deals] Archive error:', e);
    res.status(500).json({ error: 'internal_error' });
  }
});

export default router;