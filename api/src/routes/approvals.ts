/**
 * Approvals — /api/partnerships/proposals/:id/approvals
 * Approval matrix per proposal. Each function area gets a record.
 * The 13 approval functions mirror the template's internal release gate.
 */

import { Router, type Request, type Response } from 'express';
import db from '../db.js';
import { audit } from '../services/audit.js';

const router = Router({ mergeParams: true });

/* ─── Default approval functions for every proposal ─── */
const DEFAULT_FUNCTIONS = [
  'BD', 'Finance_Model', 'Finance_Economics', 'Finance_Fees',
  'Product_Scope', 'Product_Capability', 'Technology_Implementation',
  'Operations', 'Legal_Claims', 'Legal_Regulatory', 'Legal_Risk',
  'Legal_Commercial',
  'Marketing_Template', 'Marketing_Claims',
];

/* ─── Seed approvals for a proposal (idempotent) ─── */
router.post('/seed', (req: Request, res: Response) => {
  const { proposal_id } = req.params;
  const existing = db.prepare('SELECT function_area from proposal_approvals WHERE proposal_id = ?').all(proposal_id) as any[];
  const existingAreas = new Set(existing.map((e: any) => e.function_area));

  const insert = db.prepare('INSERT OR IGNORE INTO proposal_approvals (proposal_id, function_area) VALUES (?,?)');
  let count = 0;
  for (const fn of DEFAULT_FUNCTIONS) {
    if (!existingAreas.has(fn)) {
      insert.run(proposal_id, fn);
      count++;
    }
  }
  const approvals = db.prepare('SELECT * FROM proposal_approvals WHERE proposal_id = ?').all(proposal_id);
  res.json({ ok: true, seeded: count, approvals });
});

/* ─── List all approvals for proposal ─── */
router.get('/', (req: Request, res: Response) => {
  const approvals = db.prepare('SELECT * FROM proposal_approvals WHERE proposal_id = ?').all(req.params.proposal_id);
  const summary = (approvals as any[]).reduce((acc: any, a: any) => {
    acc[a.function_area] = a.status;
    return acc;
  }, {});
  res.json({ ok: true, approvals, summary });
});

/* ─── Submit / update approval decision ─── */
router.patch('/:functionArea', (req: Request, res: Response) => {
  const { proposal_id } = req.params;
  const { functionArea } = req.params;
  const { status, reviewer_name, decision, evidence_url } = req.body;

  if (!status || !['approved', 'rejected', 'clarification'].includes(status)) {
    return res.status(400).json({ ok: false, error: 'status must be approved, rejected, or clarification' });
  }

  if (!DEFAULT_FUNCTIONS.includes(functionArea as any)) {
    return res.status(400).json({ ok: false, error: `Unknown function area: ${functionArea}` });
  }

  const existing = db.prepare('SELECT id FROM proposal_approvals WHERE proposal_id = ? AND function_area = ?').get(proposal_id, functionArea);
  if (!existing) {
    db.prepare('INSERT INTO proposal_approvals (proposal_id, function_area, status, reviewer_name, decision, evidence_url, reviewed_at) VALUES (?,?,?,?,?,?,datetime(\'now\'))').run(
      proposal_id, functionArea, status, reviewer_name || null, decision || null, evidence_url || null
    );
  } else {
    db.prepare('UPDATE proposal_approvals SET status = ?, reviewer_name = ?, decision = ?, evidence_url = ?, reviewed_at = datetime(\'now\') WHERE id = ?').run(
      status, reviewer_name || null, decision || null, evidence_url || null, (existing as any).id
    );
  }

  const approval = db.prepare('SELECT * FROM proposal_approvals WHERE proposal_id = ? AND function_area = ?').get(proposal_id, functionArea);
  audit(proposal_id, 'approval_updated', req.body.actor || reviewer_name || null, `Approval: ${functionArea} → ${status}`, { decision });

  res.json({ ok: true, approval });
});

export default router;