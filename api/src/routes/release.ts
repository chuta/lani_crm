/**
 * Release Gate — automated pre-release validation.
 * Exported so it can be called both as HTTP route and inline from proposals.ts transitions.
 */

import { Router, type Request, type Response } from 'express';
import db from '../db.js';
import { audit } from '../services/audit.js';
import type { ReleaseGateResult, ReleaseCheck } from '../cpo-types.js';

const router = Router({ mergeParams: true });

export function runReleaseGate(proposalId: string): ReleaseGateResult {
  const checks: ReleaseCheck[] = [];
  const project = db.prepare('SELECT * FROM proposal_projects WHERE id = ?').get(proposalId) as any;
  if (!project) {
    return { passed: false, checks: [{ name: 'Proposal Exists', passed: false, detail: 'Proposal not found' }], score: 0, timestamp: new Date().toISOString() };
  }

  /* ─── 1. No unresolved [P] placeholders ─── */
  const unresolvedP = (db.prepare("SELECT COUNT(*) as c FROM proposal_assumptions WHERE proposal_id = ? AND confidence = 'P' AND status = 'open'").get(proposalId) as any).c;
  checks.push({
    name: 'No Placeholder Assumptions',
    passed: unresolvedP === 0,
    detail: unresolvedP > 0 ? `${unresolvedP} unresolved [P] placeholders — must all be resolved before external release` : 'All assumptions have confirmed or estimated confidence tags',
  });

  /* ─── 2. Pre-flight all checked ─── */
  const preflight = db.prepare('SELECT is_checked FROM proposal_preflight WHERE proposal_id = ?').all(proposalId) as any[];
  const totalPf = preflight.length;
  const checkedPf = preflight.filter((p: any) => p.is_checked).length;
  checks.push({
    name: 'Pre-Flight Complete',
    passed: totalPf > 0 && totalPf === checkedPf,
    detail: totalPf === 0 ? 'No pre-flight items found' : `${checkedPf}/${totalPf} pre-flight checks completed`,
  });

  /* ─── 3. Commercial model selected ─── */
  checks.push({
    name: 'Commercial Model Selected',
    passed: !!project.commercial_model,
    detail: project.commercial_model ? `Model ${project.commercial_model}` : 'No commercial model selected',
  });

  /* ─── 4. Economics validated ─── */
  const economics = db.prepare('SELECT * FROM proposal_economics WHERE proposal_id = ?').get(proposalId) as any;
  checks.push({
    name: 'Economics Entered',
    passed: !!economics && economics.gross_commercial_value !== null,
    detail: economics?.gross_commercial_value ? `Gross: ${economics.gross_commercial_value}` : 'No economics entered',
  });

  /* ─── 5. No deprecated claims ─── */
  const deprecatedClaims = db.prepare(`
    SELECT COUNT(*) as c FROM proposal_claims pc
    JOIN proposal_claims_library pcl ON pc.claim_id = pcl.id
    WHERE pc.proposal_id = ? AND pcl.status = 'Deprecated'
  `).get(proposalId) as any;
  checks.push({
    name: 'No Deprecated Claims',
    passed: deprecatedClaims.c === 0,
    detail: deprecatedClaims.c > 0 ? `${deprecatedClaims.c} deprecated claim(s) attached — remove before release` : 'No deprecated claims in use',
  });

  /* ─── 6. Pending claims warning (not a hard block, but flagged) ─── */
  const pendingClaims = db.prepare(`
    SELECT COUNT(*) as c FROM proposal_claims pc
    JOIN proposal_claims_library pcl ON pc.claim_id = pcl.id
    WHERE pc.proposal_id = ? AND pcl.status = 'Pending'
  `).get(proposalId) as any;
  checks.push({
    name: 'Claims Approved',
    passed: pendingClaims.c === 0,
    detail: pendingClaims.c > 0 ? `${pendingClaims.c} pending claim(s) — these have not yet been approved by Legal/Compliance` : 'All claims are approved',
  });

  /* ─── 7. Partnership route selected ─── */
  checks.push({
    name: 'Partnership Route Selected',
    passed: !!project.partnership_route,
    detail: project.partnership_route || 'No partnership route selected',
  });

  /* ─── 8. Executive summary written ─── */
  checks.push({
    name: 'Executive Summary Written',
    passed: !!project.executive_summary && project.executive_summary.length > 20,
    detail: project.executive_summary ? `Summary: ${project.executive_summary.slice(0, 80)}...` : 'No executive summary',
  });

  /* ─── 9. All approval functions responded ─── */
  const approvals = db.prepare('SELECT function_area, status FROM proposal_approvals WHERE proposal_id = ?').all(proposalId) as any[];
  const pendingApprovals = approvals.filter((a: any) => a.status === 'pending');
  const rejectedApprovals = approvals.filter((a: any) => a.status === 'rejected' || a.status === 'clarification');
  checks.push({
    name: 'Approval Matrix Complete',
    passed: pendingApprovals.length === 0 && rejectedApprovals.length === 0,
    detail: pendingApprovals.length + rejectedApprovals.length === 0
      ? 'All 13 approval functions resolved'
      : `${pendingApprovals.length} pending, ${rejectedApprovals.length} rejected/needs clarification`,
  });

  /* ─── 10. Responsibilities not empty (scope exists) ─── */
  checks.push({
    name: 'Implementation Route Defined',
    passed: !!project.implementation_route,
    detail: project.implementation_route || 'No implementation route defined',
  });

  /* ─── 11. Outstanding risks not critical ─── */
  const criticalRisks = db.prepare("SELECT COUNT(*) as c FROM proposal_risks WHERE proposal_id = ? AND severity = 'Critical' AND status = 'open'").get(proposalId) as any;
  checks.push({
    name: 'No Critical Open Risks',
    passed: criticalRisks.c === 0,
    detail: criticalRisks.c > 0 ? `${criticalRisks.c} critical risk(s) unresolved` : 'No critical risks open',
  });

  /* ─── 12. Contract term set ─── */
  checks.push({
    name: 'Contract Term Defined',
    passed: !!project.contract_term,
    detail: project.contract_term || 'No contract term defined',
  });

  /* ─── 13. Risk & Control Responsibilities (template §7.5) ─── */
  const responsibilities = db.prepare('SELECT party, domain FROM proposal_responsibilities WHERE proposal_id = ?').all(proposalId) as any[];
  const coveredDomains = new Set(responsibilities.map((r: any) => r.domain).filter(Boolean));
  const CONTROL_DOMAINS = [
    'Custody','Insurance','Redemption','Liquidity','Settlement','Reconciliation',
    'API / Technical Integration','Customer Onboarding','Customer Support',
    'Customer Communication','Customer Complaints','Operational Escalation',
    'KYC / AML','Transaction Monitoring','Data Privacy','Cybersecurity',
    'Regulatory Engagement','Controlled Claims & Disclosures','Reporting',
  ];
  const missingDomains = CONTROL_DOMAINS.filter((d: string) => !coveredDomains.has(d));
  checks.push({
    name: 'Risk & Control Responsibilities Complete',
    passed: missingDomains.length === 0,
    detail: missingDomains.length === 0
      ? `All ${CONTROL_DOMAINS.length} control domains have an assigned party`
      : `Missing responsibility assignment: ${missingDomains.join(', ')}`,
  });

  /* ─── 14. Commercial & Partnership Terms (template §9) ─── */
  const terms = db.prepare('SELECT * FROM proposal_terms WHERE proposal_id = ?').get(proposalId) as any;
  const metrics = db.prepare('SELECT id FROM proposal_success_metrics WHERE proposal_id = ?').all(proposalId) as any[];
  const modules = db.prepare('SELECT module_type FROM proposal_conditional_modules WHERE proposal_id = ? AND is_active = 1').all(proposalId) as any[];
  const moduleTypes = new Set(modules.map((m: any) => m.module_type));
  const missingTermFields = [
    !terms?.commercial_review && 'commercial review',
    !terms?.review_data_required && 'review data requirements',
    !terms?.review_reconsideration && 'review reconsideration basis',
    !terms?.review_approval_process && 'change approval process',
    !terms?.recon_cadence && 'reconciliation cadence',
    !terms?.payment_cadence && 'payment cadence',
    !terms?.dispute_window && 'dispute window',
    !terms?.settlement_mechanism && 'settlement mechanism',
  ].filter(Boolean);
  const pilotIncomplete = moduleTypes.has('pilot') && (
    !terms?.pilot_duration || !terms?.pilot_success_measures || !terms?.pilot_decision_gate
  );
  const exclIncomplete = moduleTypes.has('exclusivity') && (
    !terms?.excl_scope || !terms?.excl_duration || !terms?.excl_performance_conditions
  );
  checks.push({
    name: 'Commercial Terms Complete',
    passed: missingTermFields.length === 0 && metrics.length > 0 && !pilotIncomplete && !exclIncomplete,
    detail: missingTermFields.length === 0 && metrics.length > 0 && !pilotIncomplete && !exclIncomplete
      ? 'Commercial review, payment/reconciliation, and ≥1 success metric defined'
      : [
          missingTermFields.length > 0 ? `Missing: ${missingTermFields.join(', ')}` : '',
          metrics.length === 0 ? 'No success metrics defined (≥1 required)' : '',
          pilotIncomplete ? 'Pilot module active but pilot fields incomplete' : '',
          exclIncomplete ? 'Exclusivity module active but exclusivity fields incomplete' : '',
        ].filter(Boolean).join(' — ') || 'Terms incomplete',
  });

  /* ─── 15. Jurisdiction claims qualified ─── */
  const jurisdictionMismatch = db.prepare(`
    SELECT COUNT(*) as c FROM proposal_claims pc
    JOIN proposal_claims_library pcl ON pc.claim_id = pcl.id
    WHERE pc.proposal_id = ? AND pcl.jurisdiction IS NOT NULL
      AND pcl.jurisdiction != 'Global' AND pcl.jurisdiction != ?
  `).get(proposalId, project.country || '') as any;
  checks.push({
    name: 'Jurisdiction Claims Qualified',
    passed: jurisdictionMismatch.c === 0,
    detail: jurisdictionMismatch.c > 0
      ? `${jurisdictionMismatch.c} attached claim(s) are jurisdiction-specific and do not match the proposal country (${project.country || 'none set'})`
      : 'All attached claims are Global or match the proposal jurisdiction',
  });

  /* ─── Score calculation ─── */
  const passedCount = checks.filter(c => c.passed).length;
  const score = Math.round((passedCount / checks.length) * 100);

  const passed = checks.every(c => c.passed);

  // Record audit event
  audit(proposalId, 'release_gate_run', 'system',
    passed ? '✅ RELEASE GATE PASSED' : '🔴 RELEASE GATE BLOCKED',
    { score, passed: passedCount, total: checks.length, details: checks.map(c => ({ name: c.name, passed: c.passed })) }
  );

  return { passed, checks, score, timestamp: new Date().toISOString() };
}

/* ─── HTTP: Run release gate ─── */
router.post('/run', (req: Request, res: Response) => {
  const { proposal_id } = req.params;
  const project = db.prepare('SELECT * FROM proposal_projects WHERE id = ?').get(proposal_id);
  if (!project) return res.status(404).json({ ok: false, error: 'Proposal not found' });

  const result = runReleaseGate(proposal_id);
  res.json({ ok: true, ...result });
});

/* ─── HTTP: Get latest release status ─── */
router.get('/', (req: Request, res: Response) => {
  const { proposal_id } = req.params;
  const project = db.prepare('SELECT current_state, external_released_at, external_release_version FROM proposal_projects WHERE id = ?').get(proposal_id);
  if (!project) return res.status(404).json({ ok: false, error: 'Proposal not found' });

  res.json({ ok: true, state: (project as any).current_state, external_released_at: (project as any).external_released_at, external_release_version: (project as any).external_release_version });
});

export default router;