/**
 * Deals — qualified opportunities on the consulting conversion path.
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
import { isConversionStage, isLaneId } from '../catalog.js';
import {
  CONVERSION_GAP_LABELS,
  conversionGaps,
  DEAL_SELECT,
  shapeDeal,
  syncAccountStageFromDeal,
} from '../services/account-book.js';

const router = Router();

function getDealRow(id: string) {
  return db.prepare(`${DEAL_SELECT} WHERE d.id = ?`).get(id);
}

function applyDisciplineFields(id: string, body: any, accountId?: string | null): string[] {
  const errors: string[] = [];
  const updates: string[] = [];
  const params: any[] = [];

  if (body.next_action !== undefined) {
    updates.push('next_action = ?');
    params.push(String(body.next_action || '').trim() || null);
  }
  if (body.expected_decision_date !== undefined) {
    updates.push('expected_decision_date = ?');
    params.push(String(body.expected_decision_date || '').trim() || null);
  }
  if (body.delivery_partner_account_id !== undefined) {
    const partnerId = String(body.delivery_partner_account_id || '').trim() || null;
    if (partnerId) {
      const partner = db.prepare('SELECT id FROM accounts WHERE id = ? AND is_archived = 0').get(partnerId);
      if (!partner) errors.push('delivery_partner_account_id must be an active account');
      if (accountId && partnerId === accountId) errors.push('An organisation cannot be its own delivery partner');
    }
    if (!errors.length) {
      updates.push('delivery_partner_account_id = ?');
      params.push(partnerId);
    }
  }

  if (!errors.length && updates.length) {
    updates.push("updated_at = datetime('now')");
    params.push(id);
    db.prepare(`UPDATE deals SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  }
  return errors;
}

router.get('/', (req: Request, res: Response): void => {
  try {
    const { archetype, stage, archived, search, lane, geography } = req.query;

    let sql = `${DEAL_SELECT} WHERE 1=1`;
    const params: any[] = [];

    if (archetype) {
      sql += ' AND d.archetype = ?';
      params.push(archetype);
    }
    if (stage) {
      sql += ' AND d.current_stage = ?';
      params.push(Number(stage));
    }
    if (lane) {
      sql += ` AND COALESCE(d.lane, a.lane, 'immediate') = ?`;
      params.push(lane);
    }
    if (geography) {
      sql += ' AND d.geography = ?';
      params.push(geography);
    }
    if (archived === 'true') {
      sql += ' AND d.is_archived = 1';
    } else if (archived !== 'all') {
      sql += ' AND d.is_archived = 0';
    }
    if (search) {
      sql += ' AND (d.partner_name LIKE ? OR d.description LIKE ? OR a.organisation LIKE ? OR a.trigger_event LIKE ?)';
      const q = `%${search}%`;
      params.push(q, q, q, q);
    }

    sql += ` ORDER BY COALESCE(d.lane, a.lane, 'immediate'), d.priority_score DESC, d.created_at DESC`;

    const deals = (db.prepare(sql).all(...params) as any[]).map(shapeDeal);

    const laneCounts = db.prepare(`
      SELECT COALESCE(d.lane, a.lane, 'immediate') as lane, COUNT(*) as count
      FROM deals d
      LEFT JOIN accounts a ON a.id = d.account_id
      WHERE d.is_archived = 0
      GROUP BY COALESCE(d.lane, a.lane, 'immediate')
    `).all() as { lane: string; count: number }[];

    res.json({
      ok: true,
      deals,
      total: deals.length,
      lane_counts: Object.fromEntries(laneCounts.map((r) => [r.lane, r.count])),
    });
  } catch (e: any) {
    console.error('[deals] List error:', e);
    res.status(500).json({ error: 'internal_error', message: e?.message });
  }
});

router.get('/:id', (req: Request, res: Response): void => {
  try {
    const deal = getDealRow(req.params.id) as any;
    if (!deal) {
      res.status(404).json({ error: 'not_found' });
      return;
    }

    const transitions = db.prepare(
      'SELECT * FROM stage_transitions WHERE deal_id = ? ORDER BY created_at ASC'
    ).all(req.params.id);

    res.json({ ok: true, deal: shapeDeal(deal), transitions });
  } catch (e: any) {
    console.error('[deals] Get error:', e);
    res.status(500).json({ error: 'internal_error' });
  }
});

router.patch('/:id/stage', (req: Request, res: Response): void => {
  try {
    const deal = db.prepare('SELECT * FROM deals WHERE id = ?').get(req.params.id) as any;
    if (!deal) {
      res.status(404).json({ error: 'not_found' });
      return;
    }

    const { stage, triggered_by, note } = req.body;
    const newStage = Number(stage);

    if (!isConversionStage(newStage)) {
      res.status(400).json({ error: 'invalid_stage', message: 'Stage must be 1–8 on the conversion path' });
      return;
    }

    const disciplineErrors = applyDisciplineFields(req.params.id, req.body, deal.account_id);
    if (disciplineErrors.length) {
      res.status(400).json({ error: 'validation_error', details: disciplineErrors });
      return;
    }

    const preview = shapeDeal(getDealRow(req.params.id));
    const gaps = conversionGaps(preview, newStage);
    if (gaps.length) {
      res.status(400).json({
        error: 'conversion_discipline',
        details: gaps.map((g) => CONVERSION_GAP_LABELS[g] || g),
        conversion_gaps: gaps,
      });
      return;
    }

    const fromStage = deal.current_stage;

    db.prepare('UPDATE deals SET current_stage = ?, updated_at = datetime(\'now\') WHERE id = ?')
      .run(newStage, req.params.id);

    db.prepare(
      'INSERT INTO stage_transitions (deal_id, from_stage, to_stage, triggered_by, note) VALUES (?, ?, ?, ?, ?)'
    ).run(req.params.id, fromStage, newStage, triggered_by || null, note || null);

    syncAccountStageFromDeal(deal.account_id, newStage);

    const updated = getDealRow(req.params.id) as any;
    const stageName = PIPELINE_STAGES.find((s) => s.id === newStage);
    void notifyStageChange(
      req.params.id,
      updated.partner_name,
      newStage,
      stageName?.owner || 'BD',
      updated.bd_owner,
      updated.tech_owner
    );

    res.json({ ok: true, deal: shapeDeal(updated) });
  } catch (e: any) {
    console.error('[deals] Stage error:', e);
    res.status(500).json({ error: 'internal_error' });
  }
});

router.patch('/:id/blocker', (req: Request, res: Response): void => {
  try {
    const { blocking_factor } = req.body;
    db.prepare('UPDATE deals SET blocking_factor = ?, updated_at = datetime(\'now\') WHERE id = ?')
      .run(blocking_factor || null, req.params.id);
    const deal = getDealRow(req.params.id);
    if (!deal) {
      res.status(404).json({ error: 'not_found' });
      return;
    }
    res.json({ ok: true, deal: shapeDeal(deal) });
  } catch (e: any) {
    console.error('[deals] Blocker error:', e);
    res.status(500).json({ error: 'internal_error' });
  }
});

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
    const deal = getDealRow(req.params.id);
    res.json({ ok: true, deal: shapeDeal(deal) });
  } catch (e: any) {
    console.error('[deals] Owner error:', e);
    res.status(500).json({ error: 'internal_error' });
  }
});

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

    const allActive = db.prepare(
      'SELECT id, priority_score, is_archived FROM deals WHERE is_archived = 0 ORDER BY priority_score DESC'
    ).all() as { id: string; priority_score: number | null; is_archived: number }[];

    const sorted = allActive.sort((a, b) => ((b.priority_score ?? 0) - (a.priority_score ?? 0)));
    sorted.forEach((d, i) => {
      db.prepare('UPDATE deals SET queue_position = ? WHERE id = ?').run(i + 1, d.id);
    });

    res.json({
      ok: true,
      deal: shapeDeal(getDealRow(req.params.id)),
      priority_breakdown: {
        formula: 'Internal priority = average of five 1–5 qualification scores (sort only)',
        priority_score: priorityScore,
      },
    });
  } catch (e: any) {
    console.error('[deals] Priority re-score error:', e);
    res.status(500).json({ error: 'internal_error' });
  }
});

router.patch('/:id', (req: Request, res: Response): void => {
  try {
    const deal = db.prepare('SELECT * FROM deals WHERE id = ?').get(req.params.id) as any;
    if (!deal) {
      res.status(404).json({ error: 'not_found' });
      return;
    }

    if (req.body.lane !== undefined && req.body.lane !== '' && !isLaneId(req.body.lane)) {
      res.status(400).json({ error: 'validation_error', details: ['lane is invalid'] });
      return;
    }

    const current = shapeDeal(getDealRow(req.params.id));
    const gaps = conversionGaps({
      current_stage: current.current_stage,
      next_action: req.body.next_action !== undefined ? req.body.next_action : current.next_action,
      expected_decision_date: req.body.expected_decision_date !== undefined
        ? req.body.expected_decision_date
        : current.expected_decision_date,
      consortium_required: current.consortium_required,
      delivery_partner_account_id: req.body.delivery_partner_account_id !== undefined
        ? req.body.delivery_partner_account_id
        : current.delivery_partner_account_id,
    });
    if (gaps.length) {
      res.status(400).json({
        error: 'conversion_discipline',
        details: gaps.map((g) => CONVERSION_GAP_LABELS[g] || g),
        conversion_gaps: gaps,
      });
      return;
    }

    const updatable = [
      'partner_name', 'sector', 'partnership_role', 'geography', 'description',
      'bd_owner', 'urgency', 'lane', 'archetype', 'is_repeat',
    ];
    const updates: string[] = [];
    const params: any[] = [];

    for (const f of updatable) {
      if (req.body[f] !== undefined) {
        updates.push(`${f} = ?`);
        params.push(req.body[f] === '' ? null : req.body[f]);
      }
    }

    const disciplineErrors = applyDisciplineFields(req.params.id, req.body, deal.account_id);
    if (disciplineErrors.length) {
      res.status(400).json({ error: 'validation_error', details: disciplineErrors });
      return;
    }

    if (updates.length === 0
      && req.body.next_action === undefined
      && req.body.expected_decision_date === undefined
      && req.body.delivery_partner_account_id === undefined) {
      res.status(400).json({ error: 'no_fields' });
      return;
    }

    if (updates.length) {
      updates.push("updated_at = datetime('now')");
      params.push(req.params.id);
      db.prepare(`UPDATE deals SET ${updates.join(', ')} WHERE id = ?`).run(...params);
    }

    res.json({ ok: true, deal: shapeDeal(getDealRow(req.params.id)) });
  } catch (e: any) {
    console.error('[deals] Update error:', e);
    res.status(500).json({ error: 'internal_error' });
  }
});

router.delete('/:id', (req: Request, res: Response): void => {
  try {
    db.prepare('UPDATE deals SET is_archived = 1, updated_at = datetime(\'now\') WHERE id = ?')
      .run(req.params.id);
    res.json({ ok: true, message: 'Opportunity archived' });
  } catch (e: any) {
    console.error('[deals] Archive error:', e);
    res.status(500).json({ error: 'internal_error' });
  }
});

export default router;
