/**
 * Claims Library — GW-00 Approved Claims & Evidence Register
 * /api/partnerships/claims/*
 */

import { Router, type Request, type Response } from 'express';
import db from '../db.js';
import { requireRootAdmin } from '../middleware/auth.js';

const router = Router();

/* ─── List all claims ─── */
router.get('/', (_req: Request, res: Response) => {
  const claims = db.prepare('SELECT * FROM proposal_claims_library ORDER BY category, id').all();
  res.json({ ok: true, claims });
});

/* ─── Get single claim ─── */
router.get('/:id', (req: Request, res: Response) => {
  const claim = db.prepare('SELECT * FROM proposal_claims_library WHERE id = ?').get(req.params.id);
  if (!claim) return res.status(404).json({ ok: false, error: 'Claim not found' });
  res.json({ ok: true, claim });
});

/* ─── Create claim ─── */
router.post('/', requireRootAdmin, (req: Request, res: Response) => {
  const { id, category, claim, evidence_url, jurisdiction, version, effective_date, review_date, owner } = req.body;
  if (!id || !category || !claim) {
    return res.status(400).json({ ok: false, error: 'id, category, and claim are required' });
  }
  db.prepare(`INSERT INTO proposal_claims_library (id, category, claim, evidence_url, jurisdiction, version, effective_date, review_date, owner) VALUES (?,?,?,?,?,?,?,?,?)`).run(
    id, category, claim, evidence_url || null, jurisdiction || 'Global', version || '1.0', effective_date || null, review_date || null, owner || null
  );
  const created = db.prepare('SELECT * FROM proposal_claims_library WHERE id = ?').get(id);
  res.status(201).json({ ok: true, claim: created });
});

/* ─── Update claim ─── */
router.patch('/:id', requireRootAdmin, (req: Request, res: Response) => {
  const existing = db.prepare('SELECT * FROM proposal_claims_library WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ ok: false, error: 'Claim not found' });

  const fields = ['category', 'claim', 'evidence_url', 'jurisdiction', 'status', 'version', 'effective_date', 'review_date', 'owner'];
  const updates: string[] = [];
  const vals: any[] = [];

  for (const f of fields) {
    if (req.body[f] !== undefined) {
      updates.push(`${f} = ?`);
      vals.push(req.body[f]);
    }
  }
  if (updates.length === 0) return res.json({ ok: true, claim: existing });

  updates.push('updated_at = datetime(\'now\')');
  vals.push(req.params.id);
  db.prepare(`UPDATE proposal_claims_library SET ${updates.join(', ')} WHERE id = ?`).run(...vals);

  const updated = db.prepare('SELECT * FROM proposal_claims_library WHERE id = ?').get(req.params.id);
  res.json({ ok: true, claim: updated });
});

/* ─── Delete claim ─── */
router.delete('/:id', requireRootAdmin, (req: Request, res: Response) => {
  db.prepare('DELETE FROM proposal_claims_library WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

/* ─── Seed default claims (idempotent — only inserts if missing) ─── */
router.post('/seed', requireRootAdmin, (_req: Request, res: Response) => {
  const defaultClaims = [
    { id: 'CLM-001', category: 'GIFT Description', claim: '$GIFT is a gold-backed digital token designed to represent ownership of physical gold stored in institutional-grade vaults.', evidence_url: null, jurisdiction: 'Global', version: '1.0', effective_date: '2026-01-01', review_date: '2026-12-31', owner: 'Marketing' },
    { id: 'CLM-002', category: 'Gold Backing', claim: 'Each $GIFT token is fully backed by physical gold, with a target of 1 gram of 99.99% fine gold per token.', evidence_url: null, jurisdiction: 'Global', version: '1.0', effective_date: '2026-01-01', review_date: '2026-12-31', owner: 'Product' },
    { id: 'CLM-003', category: 'Custody', claim: 'Physical gold backing $GIFT is held by regulated custodians with institutional-grade security and operational controls.', evidence_url: null, jurisdiction: 'Global', version: '1.0', effective_date: '2026-01-01', review_date: '2026-12-31', owner: 'Operations' },
    { id: 'CLM-004', category: 'Vaulting', claim: 'Gold storage is managed through vaulting partners that maintain audited inventory controls and independent verification.', evidence_url: null, jurisdiction: 'Global', version: '1.0', effective_date: '2026-01-01', review_date: '2026-12-31', owner: 'Operations' },
    { id: 'CLM-005', category: 'Proof of Reserves', claim: 'UTribe publishes periodic Proof of Reserves reports verified by an independent auditor to confirm gold holdings match circulating $GIFT supply.', evidence_url: null, jurisdiction: 'Global', version: '1.0', effective_date: '2026-01-01', review_date: '2026-12-31', owner: 'Finance' },
    { id: 'CLM-006', category: 'Proof of Circulating Supply', claim: 'The circulating supply of $GIFT is transparently verifiable on-chain, with regular reconciliation against vaulted gold inventories.', evidence_url: null, jurisdiction: 'Global', version: '1.0', effective_date: '2026-01-01', review_date: '2026-12-31', owner: 'Product' },
    { id: 'CLM-007', category: 'Auditor / Assurance', claim: 'UTribe engages a recognized third-party auditor to perform annual assurance engagements covering gold holdings and token issuance.', evidence_url: null, jurisdiction: 'Global', version: '1.0', effective_date: '2026-01-01', review_date: '2026-12-31', owner: 'Finance' },
    { id: 'CLM-008', category: 'Regulatory Status', claim: '$GIFT is structured with reference to applicable regulatory frameworks. Prospective partners should conduct their own legal and regulatory assessment.', evidence_url: null, jurisdiction: 'Global', version: '1.0', effective_date: '2026-01-01', review_date: '2026-12-31', owner: 'Legal' },
    { id: 'CLM-009', category: 'Bank / Partner Exposure', claim: 'Institutional partners gain exposure to the gold-backed digital asset ecosystem through a structured, compliance-aligned partnership model.', evidence_url: null, jurisdiction: 'Global', version: '1.0', effective_date: '2026-01-01', review_date: '2026-12-31', owner: 'BD' },
    { id: 'CLM-010', category: 'Security', claim: '$GIFT smart contracts have been subject to third-party security audits. Security practices follow industry standards for digital asset custody.', evidence_url: null, jurisdiction: 'Global', version: '1.0', effective_date: '2026-01-01', review_date: '2026-12-31', owner: 'Product' },
    { id: 'CLM-011', category: 'Insurance', claim: 'Vaulted gold inventories are covered by insurance arrangements maintained by custodians, subject to policy terms and limits.', evidence_url: null, jurisdiction: 'Global', version: '1.0', effective_date: '2026-01-01', review_date: '2026-12-31', owner: 'Operations' },
    { id: 'CLM-012', category: 'Redemption', claim: '$GIFT token holders may redeem tokens for physical gold or equivalent value, subject to applicable minimums, fees, and terms.', evidence_url: null, jurisdiction: 'Global', version: '1.0', effective_date: '2026-01-01', review_date: '2026-12-31', owner: 'Product' },
  ];

  const insert = db.prepare(`INSERT OR IGNORE INTO proposal_claims_library (id, category, claim, evidence_url, jurisdiction, version, effective_date, review_date, owner) VALUES (?,?,?,?,?,?,?,?,?)`);

  const tx = db.transaction(() => {
    let count = 0;
    for (const c of defaultClaims) {
      const info = insert.run(c.id, c.category, c.claim, c.evidence_url, c.jurisdiction, c.version, c.effective_date, c.review_date, c.owner);
      if (info.changes > 0) count++;
    }
    return count;
  });

  const inserted = tx();
  const total = db.prepare('SELECT COUNT(*) as count FROM proposal_claims_library').get() as any;

  res.json({ ok: true, inserted, total: total.count });
});

export default router;