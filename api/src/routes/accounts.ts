import { Router, type Request, type Response } from 'express';
import db from '../db.js';
import {
  CONVERSION_GAP_LABELS,
  conversionGaps,
  insertAccount,
  shapeAccount,
  updateAccount,
  validateAccountPayload,
} from '../services/account-book.js';
import { aiPublicStatus, requireAiConfigured } from '../services/llm.js';
import {
  APPLYABLE_FIELDS,
  applyBrief,
  createAccountFromBrief,
  generateBrief,
  getBrief,
  getLatestBrief,
  mapBriefError,
} from '../services/account-brief.js';
import {
  applyCase,
  generateCase,
  getCase,
  getLatestCase,
  mapCaseError,
} from '../services/commercial-case.js';
import {
  applyCoach,
  generateCoach,
  getAdvice,
  getLatestAdvice,
  mapCoachError,
} from '../services/conversion-coach.js';
import {
  CASE_APPLY_ACCOUNT_FIELDS,
  CASE_SECTIONS,
  COACH_FIELDS,
  allowedCoachApplyFields,
} from '../catalog.js';

const router = Router();

router.get('/', (req: Request, res: Response): void => {
  try {
    const { lane, archetype, geography, partnership_role, archived, search, partners_only } = req.query;
    let sql = `
      SELECT a.*,
        p.organisation AS delivery_partner_name,
        (
          SELECT COUNT(*) FROM deals d
          WHERE d.is_archived = 0 AND (d.account_id = a.id OR d.delivery_partner_account_id = a.id)
        ) AS opportunity_count
      FROM accounts a
      LEFT JOIN accounts p ON p.id = a.delivery_partner_account_id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (archived === 'true') {
      sql += ' AND a.is_archived = 1';
    } else if (archived !== 'all') {
      sql += ' AND a.is_archived = 0';
    }
    if (partners_only === 'true') {
      sql += ` AND a.partnership_role != 'end_client'`;
    }
    if (lane) {
      sql += ' AND a.lane = ?';
      params.push(lane);
    }
    if (archetype) {
      sql += ' AND a.archetype = ?';
      params.push(archetype);
    }
    if (geography) {
      sql += ' AND a.geography = ?';
      params.push(geography);
    }
    if (partnership_role) {
      sql += ' AND a.partnership_role = ?';
      params.push(partnership_role);
    }
    if (search) {
      sql += ` AND (
        a.organisation LIKE ? OR a.decision_maker LIKE ? OR a.relationship_owner LIKE ?
        OR a.strategic_problem LIKE ? OR a.next_action LIKE ? OR a.lani_capability LIKE ?
      )`;
      const q = `%${search}%`;
      params.push(q, q, q, q, q, q);
    }

    sql += ' ORDER BY a.internal_priority DESC, a.organisation ASC';
    const rows = db.prepare(sql).all(...params) as any[];

    const laneCounts = db.prepare(`
      SELECT lane, COUNT(*) as count
      FROM accounts WHERE is_archived = 0
      GROUP BY lane
    `).all() as { lane: string; count: number }[];

    const shaped = rows.map(shapeAccount);
    const roleCounts = db.prepare(`
      SELECT partnership_role, COUNT(*) as count
      FROM accounts WHERE is_archived = 0 AND partnership_role != 'end_client'
      GROUP BY partnership_role
    `).all() as { partnership_role: string; count: number }[];

    res.json({
      ok: true,
      accounts: shaped,
      total: shaped.length,
      lane_counts: Object.fromEntries(laneCounts.map((r) => [r.lane, r.count])),
      role_counts: Object.fromEntries(roleCounts.map((r) => [r.partnership_role, r.count])),
      missing_discipline: shaped.filter((a) => a.conversion_gaps?.length).length,
    });
  } catch (e: any) {
    console.error('[accounts] List error:', e);
    res.status(500).json({ error: 'internal_error', message: e?.message });
  }
});

router.get('/ai-status', (_req: Request, res: Response): void => {
  res.json({ ok: true, ai: aiPublicStatus() });
});

function createdBy(req: Request): string | null {
  return req.auth?.email || req.auth?.id || null;
}

router.get('/briefs/:briefId', (req: Request, res: Response): void => {
  const brief = getBrief(req.params.briefId);
  if (!brief) {
    res.status(404).json({ error: 'brief_not_found' });
    return;
  }
  res.json({ ok: true, brief, applyable_fields: APPLYABLE_FIELDS });
});

router.post('/brief', async (req: Request, res: Response): Promise<void> => {
  if (!requireAiConfigured(res)) return;
  const organisation = String(req.body?.organisation || req.body?.partner_name || '').trim();
  if (!organisation) {
    res.status(400).json({ error: 'validation_error', message: 'organisation is required' });
    return;
  }
  try {
    const brief = await generateBrief({
      organisation,
      geography: req.body?.geography,
      partnership_role: req.body?.partnership_role,
      sector: req.body?.sector,
      notes: req.body?.notes,
      source_url: req.body?.source_url,
      created_by: createdBy(req),
    });
    res.status(201).json({
      ok: true,
      brief,
      applyable_fields: APPLYABLE_FIELDS,
      ai: aiPublicStatus(),
    });
  } catch (e) {
    const mapped = mapBriefError(e);
    console.error('[accounts] Preview brief error:', mapped.error, mapped.message);
    res.status(mapped.status).json({
      error: mapped.error,
      message: mapped.message,
      ai: aiPublicStatus(),
    });
  }
});

router.post('/brief/:briefId/create', (req: Request, res: Response): void => {
  try {
    const accepted = Array.isArray(req.body?.accepted_fields) ? req.body.accepted_fields : [];
    const result = createAccountFromBrief({
      briefId: req.params.briefId,
      accepted_fields: accepted,
      organisation: req.body?.organisation,
      relationship_owner: req.body?.relationship_owner || req.auth?.full_name || req.auth?.email || null,
    });
    res.status(201).json({
      ok: true,
      brief: result.brief,
      applied: result.applied,
      account: shapeAccount(result.account),
    });
  } catch (e) {
    const mapped = mapBriefError(e);
    res.status(mapped.status).json({ error: mapped.error, message: mapped.message });
  }
});

router.get('/:id/brief', (req: Request, res: Response): void => {
  const account = db.prepare('SELECT id FROM accounts WHERE id = ?').get(req.params.id);
  if (!account) {
    res.status(404).json({ error: 'not_found' });
    return;
  }
  const brief = getLatestBrief(req.params.id);
  if (!brief) {
    res.status(404).json({ error: 'brief_not_found', message: 'No brief for this account yet' });
    return;
  }
  res.json({ ok: true, brief, applyable_fields: APPLYABLE_FIELDS });
});

router.post('/:id/brief', async (req: Request, res: Response): Promise<void> => {
  if (!requireAiConfigured(res)) return;
  const row = db.prepare('SELECT * FROM accounts WHERE id = ?').get(req.params.id) as any;
  if (!row) {
    res.status(404).json({ error: 'not_found' });
    return;
  }
  try {
    const brief = await generateBrief({
      organisation: row.organisation,
      account_id: row.id,
      geography: req.body?.geography || row.geography,
      partnership_role: req.body?.partnership_role || row.partnership_role,
      sector: req.body?.sector || row.sector,
      notes: req.body?.notes,
      source_url: req.body?.source_url,
      created_by: createdBy(req),
      existing: {
        archetype: row.archetype,
        sector: row.sector,
        partnership_role: row.partnership_role,
        geography: row.geography,
        lane: row.lane,
        commercial_model: row.commercial_model,
        trigger_event: row.trigger_event,
        strategic_problem: row.strategic_problem,
        lani_capability: row.lani_capability,
        decision_maker: row.decision_maker,
        consortium_required: Boolean(row.consortium_required),
        current_stage: row.current_stage,
        notes: row.notes,
      },
    });
    res.status(201).json({
      ok: true,
      brief,
      applyable_fields: APPLYABLE_FIELDS,
      ai: aiPublicStatus(),
    });
  } catch (e) {
    const mapped = mapBriefError(e);
    console.error('[accounts] Account brief error:', mapped.error, mapped.message);
    res.status(mapped.status).json({
      error: mapped.error,
      message: mapped.message,
      ai: aiPublicStatus(),
    });
  }
});

router.get('/:id/case', (req: Request, res: Response): void => {
  const account = db.prepare('SELECT id FROM accounts WHERE id = ?').get(req.params.id);
  if (!account) {
    res.status(404).json({ error: 'not_found' });
    return;
  }
  const commercialCase = getLatestCase(req.params.id);
  if (!commercialCase) {
    res.status(404).json({ error: 'case_not_found', message: 'No commercial case for this account yet' });
    return;
  }
  res.json({
    ok: true,
    case: commercialCase,
    sections: CASE_SECTIONS,
    apply_account_fields: CASE_APPLY_ACCOUNT_FIELDS,
  });
});

router.get('/:id/case/:caseId', (req: Request, res: Response): void => {
  const commercialCase = getCase(req.params.caseId);
  if (!commercialCase || commercialCase.account_id !== req.params.id) {
    res.status(404).json({ error: 'case_not_found' });
    return;
  }
  res.json({
    ok: true,
    case: commercialCase,
    sections: CASE_SECTIONS,
    apply_account_fields: CASE_APPLY_ACCOUNT_FIELDS,
  });
});

router.post('/:id/case', async (req: Request, res: Response): Promise<void> => {
  if (!requireAiConfigured(res)) return;
  try {
    const commercialCase = await generateCase({
      accountId: req.params.id,
      notes: req.body?.notes,
      source_url: req.body?.source_url,
      created_by: createdBy(req),
    });
    res.status(201).json({
      ok: true,
      case: commercialCase,
      sections: CASE_SECTIONS,
      apply_account_fields: CASE_APPLY_ACCOUNT_FIELDS,
      ai: aiPublicStatus(),
    });
  } catch (e) {
    const mapped = mapCaseError(e);
    console.error('[accounts] Generate case error:', mapped.error, mapped.message);
    res.status(mapped.status).json({
      error: mapped.error,
      message: mapped.message,
      ai: aiPublicStatus(),
    });
  }
});

router.post('/:id/case/:caseId/apply', (req: Request, res: Response): void => {
  try {
    const accepted = Array.isArray(req.body?.accepted_sections) ? req.body.accepted_sections : [];
    const accountFields = Array.isArray(req.body?.account_fields) ? req.body.account_fields : [];
    const result = applyCase({
      caseId: req.params.caseId,
      accountId: req.params.id,
      accepted_sections: accepted,
      account_fields: accountFields,
    });
    res.json({
      ok: true,
      case: result.case,
      accepted_sections: result.accepted_sections,
      applied_account_fields: result.applied_account_fields,
      account: result.account,
    });
  } catch (e) {
    const mapped = mapCaseError(e);
    res.status(mapped.status).json({ error: mapped.error, message: mapped.message });
  }
});

router.get('/:id/coach', (req: Request, res: Response): void => {
  const account = db.prepare('SELECT id, current_stage FROM accounts WHERE id = ?').get(req.params.id) as
    | { id: string; current_stage: number }
    | undefined;
  if (!account) {
    res.status(404).json({ error: 'not_found' });
    return;
  }
  const advice = getLatestAdvice(req.params.id);
  if (!advice) {
    res.status(404).json({ error: 'coach_not_found', message: 'No Conversion Coach advice for this account yet' });
    return;
  }
  res.json({
    ok: true,
    advice,
    fields: COACH_FIELDS,
    apply_account_fields: allowedCoachApplyFields(account.current_stage),
  });
});

router.get('/:id/coach/:adviceId', (req: Request, res: Response): void => {
  const advice = getAdvice(req.params.adviceId);
  if (!advice || advice.account_id !== req.params.id) {
    res.status(404).json({ error: 'coach_not_found' });
    return;
  }
  const account = db.prepare('SELECT current_stage FROM accounts WHERE id = ?').get(req.params.id) as
    | { current_stage: number }
    | undefined;
  res.json({
    ok: true,
    advice,
    fields: COACH_FIELDS,
    apply_account_fields: allowedCoachApplyFields(account?.current_stage),
  });
});

router.post('/:id/coach', async (req: Request, res: Response): Promise<void> => {
  const polish = req.body?.polish === true;
  if (polish && !requireAiConfigured(res)) return;
  try {
    const advice = await generateCoach({
      accountId: req.params.id,
      polish,
      created_by: createdBy(req),
    });
    const account = db.prepare('SELECT current_stage FROM accounts WHERE id = ?').get(req.params.id) as
      | { current_stage: number }
      | undefined;
    res.status(201).json({
      ok: true,
      advice,
      fields: COACH_FIELDS,
      apply_account_fields: allowedCoachApplyFields(account?.current_stage),
      ai: aiPublicStatus(),
    });
  } catch (e) {
    const mapped = mapCoachError(e);
    console.error('[accounts] Generate coach error:', mapped.error, mapped.message);
    res.status(mapped.status).json({
      error: mapped.error,
      message: mapped.message,
      ai: aiPublicStatus(),
    });
  }
});

router.post('/:id/coach/:adviceId/apply', (req: Request, res: Response): void => {
  try {
    const accepted = Array.isArray(req.body?.accepted_fields) ? req.body.accepted_fields : [];
    const accountFields = Array.isArray(req.body?.account_fields) ? req.body.account_fields : [];
    const result = applyCoach({
      adviceId: req.params.adviceId,
      accountId: req.params.id,
      accepted_fields: accepted,
      account_fields: accountFields,
    });
    res.json({
      ok: true,
      advice: result.advice,
      accepted_fields: result.accepted_fields,
      applied_account_fields: result.applied_account_fields,
      account: result.account,
    });
  } catch (e) {
    const mapped = mapCoachError(e);
    res.status(mapped.status).json({ error: mapped.error, message: mapped.message });
  }
});

router.post('/:id/brief/:briefId/apply', (req: Request, res: Response): void => {
  try {
    const accepted = Array.isArray(req.body?.accepted_fields) ? req.body.accepted_fields : [];
    const result = applyBrief({
      briefId: req.params.briefId,
      accountId: req.params.id,
      accepted_fields: accepted,
    });
    res.json({
      ok: true,
      brief: result.brief,
      applied: result.applied,
      account: shapeAccount(result.account),
    });
  } catch (e) {
    const mapped = mapBriefError(e);
    res.status(mapped.status).json({ error: mapped.error, message: mapped.message });
  }
});

router.get('/:id', (req: Request, res: Response): void => {
  try {
    const row = db.prepare('SELECT * FROM accounts WHERE id = ?').get(req.params.id) as any;
    if (!row) {
      res.status(404).json({ error: 'not_found' });
      return;
    }
    const account = shapeAccount(row);
    const partner = row.delivery_partner_account_id
      ? db.prepare('SELECT * FROM accounts WHERE id = ?').get(row.delivery_partner_account_id)
      : null;
    const opportunities = db.prepare(
      `SELECT id, partner_name, current_stage, priority_score, queue_position, geography, partnership_role, archetype, created_at, lane
       FROM deals WHERE is_archived = 0 AND account_id = ?
       ORDER BY priority_score DESC, created_at DESC`
    ).all(req.params.id);
    const spawned = db.prepare(
      `SELECT id, partner_name, current_stage, account_id, lane, archetype
       FROM deals WHERE is_archived = 0 AND delivery_partner_account_id = ?
       ORDER BY created_at DESC`
    ).all(req.params.id);
    res.json({
      ok: true,
      account: {
        ...account,
        delivery_partner_name: (partner as any)?.organisation || null,
      },
      delivery_partner: partner ? shapeAccount(partner) : null,
      opportunities,
      spawned,
    });
  } catch (e: any) {
    console.error('[accounts] Get error:', e);
    res.status(500).json({ error: 'internal_error' });
  }
});

router.post('/', (req: Request, res: Response): void => {
  try {
    const errors = validateAccountPayload(req.body, { requireOrg: true });
    if (errors.length) {
      res.status(400).json({ error: 'validation_error', details: errors });
      return;
    }
    const organisation = String(req.body.organisation || req.body.partner_name).trim();
    const duplicate = db.prepare(
      `SELECT id FROM accounts WHERE is_archived = 0 AND lower(organisation) = lower(?) LIMIT 1`
    ).get(organisation) as { id: string } | undefined;
    if (duplicate) {
      res.status(409).json({ error: 'duplicate_organisation', account_id: duplicate.id, message: 'An active account with this organisation already exists' });
      return;
    }
    const plannedGaps = conversionGaps({
      current_stage: Number(req.body.current_stage) || 1,
      next_action: req.body.next_action,
      expected_decision_date: req.body.expected_decision_date,
      consortium_required: req.body.consortium_required,
      delivery_partner_account_id: req.body.delivery_partner_account_id,
    });
    if (plannedGaps.length) {
      res.status(400).json({
        error: 'conversion_discipline',
        details: plannedGaps.map((g) => CONVERSION_GAP_LABELS[g] || g),
      });
      return;
    }
    const row = insertAccount(req.body);
    res.status(201).json({ ok: true, account: shapeAccount(row) });
  } catch (e: any) {
    console.error('[accounts] Create error:', e);
    res.status(500).json({ error: 'internal_error', message: e?.message });
  }
});

router.patch('/:id', (req: Request, res: Response): void => {
  try {
    const errors = validateAccountPayload(req.body, { requireOrg: false });
    if (errors.length) {
      res.status(400).json({ error: 'validation_error', details: errors });
      return;
    }
    const existing = db.prepare('SELECT * FROM accounts WHERE id = ?').get(req.params.id) as any;
    if (!existing) {
      res.status(404).json({ error: 'not_found' });
      return;
    }
    const merged = {
      current_stage: req.body.current_stage !== undefined && req.body.current_stage !== ''
        ? Number(req.body.current_stage)
        : existing.current_stage,
      next_action: req.body.next_action !== undefined ? req.body.next_action : existing.next_action,
      expected_decision_date: req.body.expected_decision_date !== undefined
        ? req.body.expected_decision_date
        : existing.expected_decision_date,
      consortium_required: req.body.consortium_required !== undefined
        ? req.body.consortium_required
        : existing.consortium_required,
      delivery_partner_account_id: req.body.delivery_partner_account_id !== undefined
        ? req.body.delivery_partner_account_id
        : existing.delivery_partner_account_id,
    };
    const gaps = conversionGaps(merged);
    if (gaps.length) {
      res.status(400).json({
        error: 'conversion_discipline',
        details: gaps.map((g) => CONVERSION_GAP_LABELS[g] || g),
      });
      return;
    }
    const row = updateAccount(req.params.id, req.body);
    res.json({ ok: true, account: shapeAccount(row) });
  } catch (e: any) {
    console.error('[accounts] Update error:', e);
    res.status(500).json({ error: 'internal_error', message: e?.message });
  }
});

router.delete('/:id', (req: Request, res: Response): void => {
  try {
    const existing = db.prepare('SELECT id FROM accounts WHERE id = ?').get(req.params.id);
    if (!existing) {
      res.status(404).json({ error: 'not_found' });
      return;
    }
    db.prepare(`UPDATE accounts SET is_archived = 1, updated_at = datetime('now') WHERE id = ?`).run(req.params.id);
    res.json({ ok: true });
  } catch (e: any) {
    console.error('[accounts] Archive error:', e);
    res.status(500).json({ error: 'internal_error' });
  }
});

export default router;
