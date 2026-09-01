/**
 * Archetype Library — Section 3 + 7
 * GET /api/archetypes — List all 7 archetypes
 * GET /api/archetypes/:id — Single archetype with template
 */

import { Router, type Request, type Response } from 'express';
import db from '../db.js';

const router = Router();

// GET /api/archetypes — List all
router.get('/', (_req: Request, res: Response): void => {
  try {
    const archetypes = db.prepare('SELECT * FROM archetype_library ORDER BY id').all();
    res.json({ ok: true, archetypes });
  } catch (e: any) {
    console.error('[archetypes] List error:', e);
    res.status(500).json({ error: 'internal_error' });
  }
});

// GET /api/archetypes/:id — Single
router.get('/:id', (req: Request, res: Response): void => {
  try {
    const archetype = db.prepare('SELECT * FROM archetype_library WHERE id = ?').get(req.params.id);
    if (!archetype) {
      res.status(404).json({ error: 'not_found' });
      return;
    }

    // Find deals classified under this archetype
    const deals = db.prepare(
      'SELECT id, partner_name, current_stage, priority_score, queue_position FROM deals WHERE archetype = ? AND is_archived = 0 ORDER BY priority_score DESC'
    ).all(req.params.id);

    res.json({ ok: true, archetype, active_deals: deals });
  } catch (e: any) {
    console.error('[archetypes] Get error:', e);
    res.status(500).json({ error: 'internal_error' });
  }
});

export default router;