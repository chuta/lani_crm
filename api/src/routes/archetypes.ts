/**
 * LANI client archetype library + commercial reference lists
 * GET /api/archetypes — A–F plus sectors, partnership roles, geographies
 * GET /api/archetypes/:id — Single archetype with active deals
 */

import { Router, type Request, type Response } from 'express';
import db from '../db.js';
import {
  ACCOUNT_STAGES,
  CASE_APPLY_ACCOUNT_FIELDS,
  CASE_ASKS,
  CASE_FORBIDDEN_ACCOUNT_FIELDS,
  CASE_MIN_STAGE,
  CASE_SECTIONS,
  COACH_APPLY_ACCOUNT_FIELDS,
  COACH_DATE_MIN_STAGE,
  COACH_DRAFT_KEYS,
  COACH_FIELDS,
  COACH_FORBIDDEN_ACCOUNT_FIELDS,
  COACH_MAX_STAGE,
  COACH_MIN_STAGE,
  COACH_POLISH_REQUIRES_AI,
  COACH_RULES_REQUIRE_AI,
  COACH_SCOPE,
  COMMERCIAL_LANES,
  COMMERCIAL_MODELS,
  COMMERCIAL_TRIGGERS,
  GEOGRAPHIES,
  LANI_CAPABILITIES,
  PARTNERSHIP_ROLES,
  QUALIFICATION_DIMENSIONS,
  SECTORS,
} from '../catalog.js';
import { CONVERSION_GAP_LABELS } from '../services/account-book.js';
import { FeeBandError, listFeeBands, updateFeeBand } from '../services/fee-bands.js';
import { CoachStallError, listCoachStalls, updateCoachStall } from '../services/coach-stalls.js';

const router = Router();

function parseList(value: unknown): string[] {
  if (Array.isArray(value)) return value as string[];
  if (typeof value !== 'string' || !value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function shapeArchetype(row: any) {
  if (!row) return row;
  return {
    id: row.id,
    name: row.name,
    one_line_test: row.one_line_test,
    typical_organisations: parseList(row.typical_organisations),
    problems: parseList(row.problems),
    lani_opportunity: parseList(row.lani_opportunity),
    entry_point: row.entry_point,
    commercial_trigger: row.commercial_trigger,
    description: row.description,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

router.get('/', (_req: Request, res: Response): void => {
  try {
    const rows = db.prepare('SELECT * FROM archetype_library ORDER BY id').all();
    res.json({
      ok: true,
      archetypes: (rows as any[]).map(shapeArchetype),
      sectors: SECTORS,
      partnership_roles: PARTNERSHIP_ROLES,
      geographies: GEOGRAPHIES,
      commercial_triggers: COMMERCIAL_TRIGGERS,
      lanes: COMMERCIAL_LANES,
      qualification_dimensions: QUALIFICATION_DIMENSIONS,
      account_stages: ACCOUNT_STAGES,
      lani_capabilities: LANI_CAPABILITIES,
      commercial_models: COMMERCIAL_MODELS,
      conversion_gap_labels: CONVERSION_GAP_LABELS,
      fee_bands: listFeeBands(),
      coach_stalls: listCoachStalls(),
      case_asks: CASE_ASKS,
      case_locks: {
        min_stage: CASE_MIN_STAGE,
        sections: CASE_SECTIONS,
        apply_account_fields: CASE_APPLY_ACCOUNT_FIELDS,
        forbidden_account_fields: CASE_FORBIDDEN_ACCOUNT_FIELDS,
      },
      coach_locks: {
        scope: COACH_SCOPE,
        min_stage: COACH_MIN_STAGE,
        max_stage: COACH_MAX_STAGE,
        date_min_stage: COACH_DATE_MIN_STAGE,
        fields: COACH_FIELDS,
        apply_account_fields: COACH_APPLY_ACCOUNT_FIELDS,
        forbidden_account_fields: COACH_FORBIDDEN_ACCOUNT_FIELDS,
        draft_keys: COACH_DRAFT_KEYS,
        rules_require_ai: COACH_RULES_REQUIRE_AI,
        polish_requires_ai: COACH_POLISH_REQUIRES_AI,
      },
    });
  } catch (e: any) {
    console.error('[archetypes] List error:', e);
    res.status(500).json({ error: 'internal_error' });
  }
});

router.patch('/fee-bands/:id', (req: Request, res: Response): void => {
  try {
    const band = updateFeeBand(req.params.id, req.body || {}, req.auth?.id || req.auth?.email || null);
    res.json({ ok: true, fee_band: band });
  } catch (e: any) {
    if (e instanceof FeeBandError) {
      res.status(e.status).json({ error: e.code, message: e.message });
      return;
    }
    console.error('[archetypes] Fee band update error:', e);
    res.status(500).json({ error: 'internal_error' });
  }
});

router.patch('/stalls/:id', (req: Request, res: Response): void => {
  try {
    const stall = updateCoachStall(req.params.id, req.body || {}, req.auth?.id || req.auth?.email || null);
    res.json({ ok: true, stall });
  } catch (e: any) {
    if (e instanceof CoachStallError) {
      res.status(e.status).json({ error: e.code, message: e.message });
      return;
    }
    console.error('[archetypes] Stall update error:', e);
    res.status(500).json({ error: 'internal_error' });
  }
});

router.get('/:id', (req: Request, res: Response): void => {
  try {
    const row = db.prepare('SELECT * FROM archetype_library WHERE id = ?').get(req.params.id) as any;
    if (!row) {
      res.status(404).json({ error: 'not_found' });
      return;
    }

    const deals = db.prepare(
      'SELECT id, partner_name, current_stage, priority_score, queue_position, geography, partnership_role FROM deals WHERE archetype = ? AND is_archived = 0 ORDER BY priority_score DESC'
    ).all(req.params.id);

    res.json({ ok: true, archetype: shapeArchetype(row), active_deals: deals });
  } catch (e: any) {
    console.error('[archetypes] Get error:', e);
    res.status(500).json({ error: 'internal_error' });
  }
});

export default router;
