/**
 * Intake endpoint — Section 4.1
 * POST /api/intake — Submit a new partnership integration intake form
 */

import { Router, type Request, type Response } from 'express';
import { randomUUID } from 'node:crypto';
import db from '../db.js';
import {
  getArchetypeEffortTier,
  getNoveltyPenalty,
  computePriorityScore,
} from '../services/priority.js';
import type { ArchetypeId, IntakeInput } from '../types.js';

const router = Router();

router.post('/', (req: Request, res: Response): void => {
  try {
    const body = req.body as IntakeInput;

    // Validation
    const errors: string[] = [];
    if (!body.partner_name?.trim()) errors.push('partner_name is required');
    if (!body.archetype) errors.push('archetype is required');
    if (!['I','II','III','IV','V','VI','VII'].includes(body.archetype)) {
      errors.push('archetype must be I-VII');
    }
    if (body.revenue_potential < 1 || body.revenue_potential > 3) {
      errors.push('revenue_potential must be 1-3');
    }
    if (body.strategic_fit < 1 || body.strategic_fit > 3) {
      errors.push('strategic_fit must be 1-3');
    }
    if (body.novelty_level < 1 || body.novelty_level > 3) {
      errors.push('novelty_level must be 1-3');
    }

    if (errors.length > 0) {
      res.status(400).json({ error: 'validation_error', details: errors });
      return;
    }

    const id = `deal_${randomUUID().slice(0, 8)}`;
    const archetype = body.archetype as ArchetypeId;
    const effortTier = getArchetypeEffortTier(archetype);
    const noveltyPenalty = getNoveltyPenalty(body.novelty_level);
    const priorityScore = computePriorityScore(
      body.revenue_potential,
      body.strategic_fit,
      effortTier,
      noveltyPenalty
    );

    // Compute queue position
    const allActive = db.prepare(
      `SELECT id, priority_score, is_archived FROM deals WHERE is_archived = 0 ORDER BY priority_score DESC`
    ).all() as { id: string; priority_score: number | null; is_archived: number }[];

    const newEntry = { id, priority_score: priorityScore, is_archived: 0 };
    const sorted = [...allActive, newEntry].sort(
      (a, b) => ((b.priority_score ?? 0) - (a.priority_score ?? 0))
    );
    const queuePosition = sorted.findIndex(d => d.id === id) + 1;

    const stmt = db.prepare(`
      INSERT INTO deals (
        id, partner_name, sector, deal_stage, description,
        archetype, is_repeat, novelty_level,
        revenue_potential, strategic_fit,
        effort_tier, novelty_penalty, priority_score, queue_position,
        current_stage, bd_owner, urgency, compliance_flags
      ) VALUES (
        @id, @partner_name, @sector, @deal_stage, @description,
        @archetype, @is_repeat, @novelty_level,
        @revenue_potential, @strategic_fit,
        @effort_tier, @novelty_penalty, @priority_score, @queue_position,
        2, @bd_owner, @urgency, @compliance_flags
      )
    `);

    stmt.run({
      id,
      partner_name: body.partner_name.trim(),
      sector: body.sector?.trim() || null,
      deal_stage: body.deal_stage?.trim() || null,
      description: body.description?.trim() || null,
      archetype,
      is_repeat: body.is_repeat ? 1 : 0,
      novelty_level: body.novelty_level,
      revenue_potential: body.revenue_potential,
      strategic_fit: body.strategic_fit,
      effort_tier: effortTier,
      novelty_penalty: noveltyPenalty,
      priority_score: priorityScore,
      queue_position: queuePosition,
      bd_owner: body.bd_owner?.trim() || null,
      urgency: body.urgency?.trim() || null,
      compliance_flags: body.compliance_flags?.trim() || null,
    });

    // Record initial stage transition (Lead → Intake)
    db.prepare(`
      INSERT INTO stage_transitions (deal_id, from_stage, to_stage, triggered_by, note)
      VALUES (@id, 1, 2, @owner, 'Intake form submitted via BD')
    `).run({ id, owner: body.bd_owner || 'BD' });

    // Fetch the created deal
    const deal = db.prepare('SELECT * FROM deals WHERE id = ?').get(id);

    res.status(201).json({
      ok: true,
      deal,
      priority_breakdown: {
        formula: '(Revenue × Strategic Fit) ÷ (Effort Tier × Novelty Penalty)',
        revenue_potential: body.revenue_potential,
        strategic_fit: body.strategic_fit,
        effort_tier: effortTier,
        novelty_penalty: noveltyPenalty,
        priority_score: priorityScore,
        queue_position: queuePosition,
      },
    });
  } catch (e: any) {
    console.error('[intake] Error:', e);
    res.status(500).json({ error: 'internal_error', message: e?.message || 'Unknown error' });
  }
});

export default router;