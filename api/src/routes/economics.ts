/**
 * Economics Calculator — /api/partnerships/proposals/:id/economics
 * Computes residual pool, effective economics, and scenario modeling.
 */

import { Router, type Request, type Response } from 'express';
import db from '../db.js';
import { audit } from '../services/audit.js';

const router = Router({ mergeParams: true });

/** Calculate and store proposal economics with full derivation */
router.post('/', (req: Request, res: Response) => {
  const { proposal_id } = req.params;
  const project = db.prepare('SELECT * FROM proposal_projects WHERE id = ?').get(proposal_id);
  if (!project) return res.status(404).json({ ok: false, error: 'Proposal not found' });

  const {
    gross_commercial_value, gross_confidence,
    operating_cost, operating_cost_confidence,
    partner_allocation_pct, utribe_allocation_pct,
    base_gross, base_operating_cost,
    downside_gross, downside_operating_cost,
    upside_gross, upside_operating_cost,
  } = req.body;

  if (gross_commercial_value === undefined || operating_cost === undefined) {
    return res.status(400).json({ ok: false, error: 'gross_commercial_value and operating_cost required' });
  }

  // Derived calculations
  const residual = gross_commercial_value - operating_cost;
  const partner_econ = residual * (partner_allocation_pct !== undefined ? partner_allocation_pct / 100 : 0);
  const utribe_econ = residual * (utribe_allocation_pct !== undefined ? utribe_allocation_pct / 100 : 0);
  const effective_partner_pct = gross_commercial_value > 0 ? (partner_econ / gross_commercial_value) * 100 : 0;
  const effective_utribe_pct = gross_commercial_value > 0 ? (utribe_econ / gross_commercial_value) * 100 : 0;

  // Upsert
  const existing = db.prepare('SELECT id FROM proposal_economics WHERE proposal_id = ?').get(proposal_id);

  const data: any[] = [
    gross_commercial_value, gross_confidence || 'E',
    operating_cost, operating_cost_confidence || 'E',
    residual,
    partner_econ, partner_allocation_pct || null, utribe_econ, utribe_allocation_pct || null,
    Math.round(effective_partner_pct * 100) / 100, Math.round(effective_utribe_pct * 100) / 100,
    Math.round(partner_econ * 100) / 100, Math.round(utribe_econ * 100) / 100,
    base_gross || null, base_operating_cost || null,
    downside_gross || null, downside_operating_cost || null,
    upside_gross || null, upside_operating_cost || null,
    proposal_id,
  ];

  if (existing) {
    db.prepare(`
      UPDATE proposal_economics SET
        gross_commercial_value = ?, gross_confidence = ?,
        operating_cost = ?, operating_cost_confidence = ?,
        residual_pool = ?, partner_allocation = ?, partner_allocation_pct = ?,
        utribe_allocation = ?, utribe_allocation_pct = ?,
        effective_partner_pct = ?, effective_utribe_pct = ?,
        partner_effective_economics = ?, utribe_effective_economics = ?,
        base_gross = ?, base_operating_cost = ?,
        downside_gross = ?, downside_operating_cost = ?,
        upside_gross = ?, upside_operating_cost = ?,
        updated_at = datetime('now')
      WHERE proposal_id = ?
    `).run(...data);
  } else {
    // INSERT: proposal_id goes last in VALUES to match data array order
    db.prepare(`
      INSERT INTO proposal_economics (
        gross_commercial_value, gross_confidence,
        operating_cost, operating_cost_confidence,
        residual_pool,
        partner_allocation, partner_allocation_pct,
        utribe_allocation, utribe_allocation_pct,
        effective_partner_pct, effective_utribe_pct,
        partner_effective_economics, utribe_effective_economics,
        base_gross, base_operating_cost,
        downside_gross, downside_operating_cost,
        upside_gross, upside_operating_cost,
        proposal_id
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(...data);
  }

  const economics = db.prepare('SELECT * FROM proposal_economics WHERE proposal_id = ?').get(proposal_id);
  audit(proposal_id, 'economics_updated', req.body.actor || null,
    `Economics: gross ${gross_commercial_value}, residual ${residual}, partner ${Math.round(partner_econ)}, UTribe ${Math.round(utribe_econ)}`);

  res.json({ ok: true, economics });
});

export default router;