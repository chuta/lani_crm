/**
 * Proposals — Commercial Proposal lifecycle
 * /api/partnerships/proposals/*
 */

import { Router, type Request, type Response } from 'express';
import db from '../db.js';
import { runReleaseGate } from './release.js';
import type { ProposalState } from '../cpo-types.js';
import { ROUTE_RESPONSIBILITY_DEFAULTS } from '../cpo-types.js';

const router = Router();

/* ─── Generate unique proposal ID ─── */
function generateProposalId(partner: string): string {
  const prefix = partner.replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase();
  const count = (db.prepare('SELECT COUNT(*) as c FROM proposal_projects WHERE id LIKE ?').get(`${prefix}-%`) as any).c;
  return `${prefix}-CP-${String(count + 1).padStart(3, '0')}`;
}

/* ─── Audit helper ─── */
function audit(proposalId: string, eventType: string, actor: string | null, description: string, metadata?: any) {
  db.prepare(`INSERT INTO proposal_audit_events (proposal_id, event_type, actor, description, metadata) VALUES (?,?,?,?,?)`).run(
    proposalId, eventType, actor, description, metadata ? JSON.stringify(metadata) : null
  );
}

/* ─── Create version snapshot ─── */
function snapshotVersion(proposalId: string, createdBy: string | null, isRelease = 0) {
  const project = db.prepare('SELECT * FROM proposal_projects WHERE id = ?').get(proposalId);
  if (!project) return;
  const maxVer = (db.prepare('SELECT COALESCE(MAX(version), 0) as v FROM proposal_versions WHERE proposal_id = ?').get(proposalId) as any).v;
  db.prepare(`INSERT INTO proposal_versions (proposal_id, version, state_snapshot, created_by, is_release) VALUES (?,?,?,?,?)`).run(
    proposalId, maxVer + 1, JSON.stringify(project), createdBy, isRelease
  );
}

/* ─── Transition state helper ─── */
const VALID_TRANSITIONS: Record<string, string[]> = {
  'not_eligible': ['intake'],
  'intake': ['pre_flight', 'withdrawn'],
  'pre_flight': ['business_case', 'intake', 'withdrawn'],
  'business_case': ['eligible', 'pre_flight', 'withdrawn'],
  'eligible': ['drafting', 'withdrawn'],
  'drafting': ['functional_review', 'eligible', 'withdrawn'],
  'functional_review': ['revision_required', 'approval_ready', 'drafting', 'withdrawn'],
  'revision_required': ['drafting', 'functional_review', 'withdrawn'],
  'approval_ready': ['release_gate', 'revision_required', 'withdrawn'],
  'release_gate': ['approved_external', 'revision_required', 'withdrawn'],
  'approved_external': ['delivered', 'negotiation', 'superseded', 'withdrawn'],
  'delivered': ['negotiation', 'superseded', 'withdrawn'],
  'negotiation': ['approved_external', 'superseded', 'withdrawn'],
  'superseded': [],
  'withdrawn': [],
};

function canTransition(from: ProposalState, to: ProposalState): boolean {
  const allowed = VALID_TRANSITIONS[from];
  return allowed ? allowed.includes(to) : false;
}

/* ─── LIST proposals ─── */
router.get('/', (req: Request, res: Response) => {
  const { state, deal_id, archived, search } = req.query;
  let sql = 'SELECT * FROM proposal_projects WHERE 1=1';
  const params: any[] = [];

  if (state) { sql += ' AND current_state = ?'; params.push(state); }
  if (deal_id) { sql += ' AND deal_id = ?'; params.push(deal_id); }
  if (archived === 'true') sql += ' AND is_archived = 1';
  else if (archived !== 'all') sql += ' AND is_archived = 0';
  if (search) { sql += ' AND (partner_name LIKE ? OR id LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }

  sql += ' ORDER BY created_at DESC';
  const proposals = db.prepare(sql).all(...params);
  res.json({ ok: true, proposals, total: proposals.length });
});

/* ─── GET single proposal with full detail ─── */
router.get('/:id', (req: Request, res: Response) => {
  const project = db.prepare('SELECT * FROM proposal_projects WHERE id = ?').get(req.params.id) as any;
  if (!project) return res.status(404).json({ ok: false, error: 'Proposal not found' });

  const economics = db.prepare('SELECT * FROM proposal_economics WHERE proposal_id = ? ORDER BY id DESC LIMIT 1').get(req.params.id);
  const approvals = db.prepare('SELECT * FROM proposal_approvals WHERE proposal_id = ?').all(req.params.id);
  const preflight = db.prepare('SELECT * FROM proposal_preflight WHERE proposal_id = ?').all(req.params.id);
  const assumptions = db.prepare('SELECT * FROM proposal_assumptions WHERE proposal_id = ?').all(req.params.id);
  const unresolvedP = db.prepare("SELECT COUNT(*) as c FROM proposal_assumptions WHERE proposal_id = ? AND confidence = 'P' AND status = 'open'").get(req.params.id) as any;
  const risks = db.prepare('SELECT * FROM proposal_risks WHERE proposal_id = ?').all(req.params.id);
  const discussionPoints = db.prepare('SELECT * FROM proposal_discussion_points WHERE proposal_id = ?').all(req.params.id);
  const modules = db.prepare("SELECT module_type FROM proposal_conditional_modules WHERE proposal_id = ? AND is_active = 1").all(req.params.id) as any[];
  const claims = db.prepare(`SELECT pc.claim_id, pcl.* FROM proposal_claims pc JOIN proposal_claims_library pcl ON pc.claim_id = pcl.id WHERE pc.proposal_id = ?`).all(req.params.id);
  const versions = db.prepare('SELECT version, created_at, is_release FROM proposal_versions WHERE proposal_id = ? ORDER BY version DESC').all(req.params.id);
  const audit = db.prepare('SELECT event_type, actor, description, created_at FROM proposal_audit_events WHERE proposal_id = ? ORDER BY created_at DESC LIMIT 50').all(req.params.id);
  const responsibilities = db.prepare('SELECT * FROM proposal_responsibilities WHERE proposal_id = ? ORDER BY id').all(req.params.id);
  const terms = db.prepare('SELECT * FROM proposal_terms WHERE proposal_id = ?').get(req.params.id);
  const successMetrics = db.prepare('SELECT * FROM proposal_success_metrics WHERE proposal_id = ? ORDER BY id').all(req.params.id);

  res.json({
    ok: true,
    project,
    economics: economics || null,
    approvals,
    preflight,
    assumptions,
    unresolved_p_count: unresolvedP.c,
    risks,
    discussion_points: discussionPoints,
    active_modules: modules.map((m: any) => m.module_type),
    claims,
    versions,
    audit,
    responsibilities: responsibilities || [],
    terms: terms || null,
    success_metrics: successMetrics || [],
  });
});

/* ─── PROMOTE deal to proposal ─── */
router.post('/promote/:dealId', (req: Request, res: Response) => {
  const deal = db.prepare('SELECT * FROM deals WHERE id = ?').get(req.params.dealId) as any;
  if (!deal) return res.status(404).json({ ok: false, error: 'Deal not found' });

  if (deal.current_stage < 5) {
    return res.status(400).json({
      ok: false,
      error: 'Deal must be at stage 5 (Business Case / Proposal) or higher to promote to CPO',
      current_stage: deal.current_stage,
    });
  }

  // Check if already promoted
  const existing = db.prepare('SELECT id FROM proposal_projects WHERE deal_id = ? AND is_archived = 0').get(req.params.dealId);
  if (existing) {
    return res.status(409).json({ ok: false, error: 'Deal already has an active proposal project', existing_proposal_id: (existing as any).id });
  }

  const proposalId = generateProposalId(deal.partner_name);
  const { partner_contact, country, vertical, pipedrive_deal_url, bd_tracker_deal_ref, source } = req.body;

  db.prepare(`INSERT INTO proposal_projects (id, deal_id, pipedrive_deal_url, partner_name, partner_contact, country, vertical, owner, source, bd_tracker_deal_ref, current_state) VALUES (?,?,?,?,?,?,?,?,?,?, 'intake')`).run(
    proposalId,
    req.params.dealId,
    pipedrive_deal_url || null,
    deal.partner_name,
    partner_contact || null,
    country || null,
    vertical || null,
    deal.bd_owner || null,
    source || 'manual',
    bd_tracker_deal_ref || null,
  );

  // Seed pre-flight checklist
  const preflightItems = [
    { check: 'Partner has passed relevant internal qualification stage', cat: 'Qualification' },
    { check: 'Discovery findings are sufficiently complete', cat: 'Qualification' },
    { check: 'Proposed partnership route has been identified', cat: 'Qualification' },
    { check: 'Business Case or equivalent internal commercial justification approved', cat: 'Qualification' },
    { check: 'Current GTM priority / account status checked', cat: 'Qualification' },
    { check: 'Named partner contact and decision-making stakeholders known', cat: 'Stakeholders' },
    { check: 'Commercial Model Classification selected', cat: 'Commercial' },
    { check: 'Finance / Commercial reviewed proposed economic logic', cat: 'Functional' },
    { check: 'Product / Technology validated capabilities represented', cat: 'Functional' },
    { check: 'Legal / Compliance validated route-specific regulatory wording', cat: 'Functional' },
    { check: 'All claims checked against Approved Claims & Evidence Register', cat: 'Functional' },
    { check: 'No outdated claims copied from previous materials', cat: 'Functional' },
    { check: 'All numerical assumptions have a confidence classification', cat: 'Functional' },
    { check: 'No unsupported fee, SLA, integration or launch commitment inserted', cat: 'Functional' },
  ];

  const insertPf = db.prepare('INSERT INTO proposal_preflight (proposal_id, check_item, category) VALUES (?,?,?)');
  const tx = db.transaction(() => {
    for (const item of preflightItems) {
      insertPf.run(proposalId, item.check, item.cat);
    }
    // Create initial version snapshot
    snapshotVersion(proposalId, req.body.actor || null);
    audit(proposalId, 'promoted', req.body.actor || null, `Proposal ${proposalId} promoted from deal ${req.params.dealId}`);
  });
  tx();

  const created = db.prepare('SELECT * FROM proposal_projects WHERE id = ?').get(proposalId);
  res.status(201).json({ ok: true, proposal: created });
});

/* ─── PROMOTE from BD Tracker (no existing deal) ─── */
router.post('/promote-bd', (req: Request, res: Response) => {
  const { firm_name, partner_contact, country, vertical, pipedrive_deal_url, bd_tracker_deal_ref, actor } = req.body;
  if (!firm_name) return res.status(400).json({ ok: false, error: 'firm_name is required' });

  // Create a placeholder deal so the FK holds
  const slug = firm_name.replace(/[^A-Za-z0-9]/g, '_').toLowerCase().slice(0, 40);
  const dealId = `bd_${slug}_${Date.now()}`;

  db.prepare(`INSERT INTO deals (id, partner_name, current_stage, archetype, is_repeat, novelty_level, revenue_potential, strategic_fit, effort_tier, novelty_penalty) VALUES (?,?,5,'B',0,1,2,2,1,1)`).run(
    dealId, firm_name
  );

  // Create proposal
  const proposalId = generateProposalId(firm_name);

  db.prepare(`INSERT INTO proposal_projects (id, deal_id, pipedrive_deal_url, partner_name, partner_contact, country, vertical, owner, source, bd_tracker_deal_ref, current_state) VALUES (?,?,?,?,?,?,?,?,?,?, 'intake')`).run(
    proposalId,
    dealId,
    pipedrive_deal_url || null,
    firm_name,
    partner_contact || null,
    country || null,
    vertical || null,
    actor || null,
    'bd_tracker',
    bd_tracker_deal_ref || null,
  );

  // Seed pre-flight checklist
  const preflightItems = [
    { check: 'Partner has passed relevant internal qualification stage', cat: 'Qualification' },
    { check: 'Discovery findings are sufficiently complete', cat: 'Qualification' },
    { check: 'Proposed partnership route has been identified', cat: 'Qualification' },
    { check: 'Business Case or equivalent internal commercial justification approved', cat: 'Qualification' },
    { check: 'Current GTM priority / account status checked', cat: 'Qualification' },
    { check: 'Named partner contact and decision-making stakeholders known', cat: 'Stakeholders' },
    { check: 'Commercial Model Classification selected', cat: 'Commercial' },
    { check: 'Finance / Commercial reviewed proposed economic logic', cat: 'Functional' },
    { check: 'Product / Technology validated capabilities represented', cat: 'Functional' },
    { check: 'Legal / Compliance validated route-specific regulatory wording', cat: 'Functional' },
    { check: 'All claims checked against Approved Claims & Evidence Register', cat: 'Functional' },
    { check: 'No outdated claims copied from previous materials', cat: 'Functional' },
    { check: 'All numerical assumptions have a confidence classification', cat: 'Functional' },
    { check: 'No unsupported fee, SLA, integration or launch commitment inserted', cat: 'Functional' },
  ];

  const insertPf = db.prepare('INSERT INTO proposal_preflight (proposal_id, check_item, category) VALUES (?,?,?)');
  const tx = db.transaction(() => {
    for (const item of preflightItems) {
      insertPf.run(proposalId, item.check, item.cat);
    }
    snapshotVersion(proposalId, actor || null);
    audit(proposalId, 'promoted_bd', actor || null, `Proposal ${proposalId} promoted from BD Tracker: ${firm_name}`);
  });
  tx();

  const created = db.prepare('SELECT * FROM proposal_projects WHERE id = ?').get(proposalId);
  res.status(201).json({ ok: true, proposal: created });
});

/* ─── UPDATE proposal fields ─── */
router.patch('/:id', (req: Request, res: Response) => {
  const existing = db.prepare('SELECT * FROM proposal_projects WHERE id = ?').get(req.params.id) as any;
  if (!existing) return res.status(404).json({ ok: false, error: 'Proposal not found' });

  const fields = [
    'partner_name', 'partner_contact', 'country', 'vertical', 'owner', 'priority',
    'partnership_route', 'commercial_model', 'expected_revenue', 'expected_aum',
    'expected_volume', 'target_close_date', 'pipedrive_deal_url',
    'bd_tracker_deal_ref', 'pipedrive_deal_id',
    'executive_summary', 'partner_value', 'utribe_value',
    'implementation_route', 'technical_dependencies', 'third_party_dependencies',
    'product_dependencies', 'implementation_timing', 'contract_term',
    'governance_cadence', 'escalation_route',
  ];

  const updates: string[] = [];
  const vals: any[] = [];
  for (const f of fields) {
    if (req.body[f] !== undefined) {
      updates.push(`${f} = ?`);
      vals.push(req.body[f]);
    }
  }
  if (updates.length === 0) return res.json({ ok: true, proposal: existing });

  // If partnership route set/qa-changed and no responsibilities exist, seed route defaults
  if (req.body.partnership_route && existing.partnership_route !== req.body.partnership_route) {
    const have = (db.prepare('SELECT COUNT(*) as c FROM proposal_responsibilities WHERE proposal_id = ?').get(req.params.id) as any).c;
    if (have === 0) {
      const defaults = ROUTE_RESPONSIBILITY_DEFAULTS[req.body.partnership_route] || [];
      const ins = db.prepare('INSERT INTO proposal_responsibilities (proposal_id, party, domain, description) VALUES (?,?,?,?)');
      const tx = db.transaction(() => {
        for (const d of defaults) ins.run(req.params.id, d.party, d.domain, d.description);
      });
      tx();
      audit(req.params.id, 'responsibilities_seeded', req.body.actor || null, `Responsibility defaults seeded for route ${req.body.partnership_route}`);
    }
  }

  updates.push('updated_at = datetime(\'now\')');
  vals.push(req.params.id);
  db.prepare(`UPDATE proposal_projects SET ${updates.join(', ')} WHERE id = ?`).run(...vals);

  snapshotVersion(req.params.id, req.body.actor || null);
  if (req.body.actor) {
    audit(req.params.id, 'updated', req.body.actor, `Proposal fields updated: ${updates.map(u => u.split(' =')[0]).join(', ')}`);
  }

  const updated = db.prepare('SELECT * FROM proposal_projects WHERE id = ?').get(req.params.id);
  res.json({ ok: true, proposal: updated });
});

/* ─── TRANSITION state ─── */
router.post('/:id/transition', (req: Request, res: Response) => {
  const { to, actor, note } = req.body;
  if (!to) return res.status(400).json({ ok: false, error: 'target state (to) required' });

  const project = db.prepare('SELECT * FROM proposal_projects WHERE id = ?').get(req.params.id) as any;
  if (!project) return res.status(404).json({ ok: false, error: 'Proposal not found' });

  if (!canTransition(project.current_state, to)) {
    return res.status(400).json({
      ok: false,
      error: `Cannot transition from '${project.current_state}' to '${to}'`,
      valid_transitions: VALID_TRANSITIONS[project.current_state] || [],
    });
  }

  db.prepare('UPDATE proposal_projects SET current_state = ?, updated_at = datetime(\'now\') WHERE id = ?').run(to, req.params.id);
  snapshotVersion(req.params.id, actor || null);
  audit(req.params.id, 'state_transition', actor || null, `State: ${project.current_state} → ${to}`, { note: note || null });

  // If transitioning to release_gate, run automated checks
  let releaseResult = null;
  if (to === 'release_gate') {
    releaseResult = runReleaseGate(req.params.id);
  }

  const updated = db.prepare('SELECT * FROM proposal_projects WHERE id = ?').get(req.params.id);
  res.json({ ok: true, proposal: updated, release_gate: releaseResult });
});

/* ─── DELETE / ARCHIVE ─── */
router.delete('/:id', (req: Request, res: Response) => {
  db.prepare('UPDATE proposal_projects SET is_archived = 1, updated_at = datetime(\'now\') WHERE id = ?').run(req.params.id);
  audit(req.params.id, 'archived', req.body.actor || null, 'Proposal archived');
  res.json({ ok: true });
});

/* ─── PRE-FLIGHT CHECKLIST ─── */
router.get('/:id/preflight', (req: Request, res: Response) => {
  const items = db.prepare('SELECT * FROM proposal_preflight WHERE proposal_id = ? ORDER BY id').all(req.params.id);
  const total = items.length;
  const checked = (items as any[]).filter(i => i.is_checked).length;
  res.json({ ok: true, items, progress: { total, checked, pct: total ? Math.round(checked / total * 100) : 0 } });
});

router.patch('/:id/preflight/:itemId', (req: Request, res: Response) => {
  const { is_checked, checked_by } = req.body;
  if (is_checked === undefined) return res.status(400).json({ ok: false, error: 'is_checked required' });

  if (is_checked) {
    db.prepare('UPDATE proposal_preflight SET is_checked = 1, checked_by = ?, checked_at = datetime(\'now\') WHERE id = ? AND proposal_id = ?').run(
      checked_by || null, req.params.itemId, req.params.id
    );
  } else {
    db.prepare('UPDATE proposal_preflight SET is_checked = 0, checked_by = NULL, checked_at = NULL WHERE id = ? AND proposal_id = ?').run(
      req.params.itemId, req.params.id
    );
  }
  const item = db.prepare('SELECT * FROM proposal_preflight WHERE id = ?').get(req.params.itemId);
  res.json({ ok: true, item });
});

/* ─── ASSUMPTIONS ─── */
router.get('/:id/assumptions', (req: Request, res: Response) => {
  const assumptions = db.prepare('SELECT * FROM proposal_assumptions WHERE proposal_id = ? ORDER BY created_at DESC').all(req.params.id);
  res.json({ ok: true, assumptions });
});

router.post('/:id/assumptions', (req: Request, res: Response) => {
  const { category, description, confidence, owner, evidence, impact } = req.body;
  if (!category || !description || !confidence) {
    return res.status(400).json({ ok: false, error: 'category, description, and confidence required' });
  }
  const result = db.prepare(`INSERT INTO proposal_assumptions (proposal_id, category, description, confidence, owner, evidence, impact) VALUES (?,?,?,?,?,?,?)`).run(
    req.params.id, category, description, confidence, owner || null, evidence || null, impact || null
  );
  const created = db.prepare('SELECT * FROM proposal_assumptions WHERE id = ?').get(result.lastInsertRowid);
  audit(req.params.id, 'assumption_added', req.body.actor || null, `Assumption added: ${description.slice(0, 80)}`);
  res.status(201).json({ ok: true, assumption: created });
});

router.patch('/:id/assumptions/:assumptionId', (req: Request, res: Response) => {
  const fields = ['category', 'description', 'confidence', 'owner', 'evidence', 'impact', 'status'];
  const updates: string[] = [];
  const vals: any[] = [];
  for (const f of fields) {
    if (req.body[f] !== undefined) { updates.push(`${f} = ?`); vals.push(req.body[f]); }
  }
  if (updates.length === 0) return res.status(400).json({ ok: false, error: 'No fields to update' });
  vals.push(req.params.assumptionId, req.params.id);
  db.prepare(`UPDATE proposal_assumptions SET ${updates.join(', ')} WHERE id = ? AND proposal_id = ?`).run(...vals);
  const updated = db.prepare('SELECT * FROM proposal_assumptions WHERE id = ?').get(req.params.assumptionId);
  res.json({ ok: true, assumption: updated });
});

router.delete('/:id/assumptions/:assumptionId', (req: Request, res: Response) => {
  db.prepare('DELETE FROM proposal_assumptions WHERE id = ? AND proposal_id = ?').run(req.params.assumptionId, req.params.id);
  res.json({ ok: true });
});

/* ─── RISKS ─── */
router.get('/:id/risks', (req: Request, res: Response) => {
  const risks = db.prepare('SELECT * FROM proposal_risks WHERE proposal_id = ? ORDER BY created_at DESC').all(req.params.id);
  res.json({ ok: true, risks });
});

router.post('/:id/risks', (req: Request, res: Response) => {
  const { risk_type, owner, severity, mitigation } = req.body;
  if (!risk_type || !severity) return res.status(400).json({ ok: false, error: 'risk_type and severity required' });
  const result = db.prepare(`INSERT INTO proposal_risks (proposal_id, risk_type, owner, severity, mitigation) VALUES (?,?,?,?,?)`).run(
    req.params.id, risk_type, owner || null, severity, mitigation || null
  );
  const created = db.prepare('SELECT * FROM proposal_risks WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json({ ok: true, risk: created });
});

router.patch('/:id/risks/:riskId', (req: Request, res: Response) => {
  const fields = ['risk_type', 'owner', 'severity', 'mitigation', 'status'];
  const updates: string[] = [];
  const vals: any[] = [];
  for (const f of fields) {
    if (req.body[f] !== undefined) { updates.push(`${f} = ?`); vals.push(req.body[f]); }
  }
  if (updates.length === 0) return res.status(400).json({ ok: false, error: 'No fields' });
  vals.push(req.params.riskId, req.params.id);
  db.prepare(`UPDATE proposal_risks SET ${updates.join(', ')} WHERE id = ? AND proposal_id = ?`).run(...vals);
  const updated = db.prepare('SELECT * FROM proposal_risks WHERE id = ?').get(req.params.riskId);
  res.json({ ok: true, risk: updated });
});

router.delete('/:id/risks/:riskId', (req: Request, res: Response) => {
  db.prepare('DELETE FROM proposal_risks WHERE id = ? AND proposal_id = ?').run(req.params.riskId, req.params.id);
  res.json({ ok: true });
});

/* ─── DISCUSSION POINTS ─── */
router.get('/:id/discussion-points', (req: Request, res: Response) => {
  const items = db.prepare('SELECT * FROM proposal_discussion_points WHERE proposal_id = ? ORDER BY created_at DESC').all(req.params.id);
  res.json({ ok: true, discussion_points: items });
});

router.post('/:id/discussion-points', (req: Request, res: Response) => {
  const { category, question, owner, due_date } = req.body;
  if (!category || !question) return res.status(400).json({ ok: false, error: 'category and question required' });
  const result = db.prepare(`INSERT INTO proposal_discussion_points (proposal_id, category, question, owner, due_date) VALUES (?,?,?,?,?)`).run(
    req.params.id, category, question, owner || null, due_date || null
  );
  const created = db.prepare('SELECT * FROM proposal_discussion_points WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json({ ok: true, discussion_point: created });
});

router.patch('/:id/discussion-points/:dpId', (req: Request, res: Response) => {
  const fields = ['category', 'question', 'owner', 'due_date', 'status', 'resolution'];
  const updates: string[] = [];
  const vals: any[] = [];
  for (const f of fields) {
    if (req.body[f] !== undefined) { updates.push(`${f} = ?`); vals.push(req.body[f]); }
  }
  if (updates.length === 0) return res.status(400).json({ ok: false, error: 'No fields' });
  vals.push(req.params.dpId, req.params.id);
  db.prepare(`UPDATE proposal_discussion_points SET ${updates.join(', ')} WHERE id = ? AND proposal_id = ?`).run(...vals);
  const updated = db.prepare('SELECT * FROM proposal_discussion_points WHERE id = ?').get(req.params.dpId);
  res.json({ ok: true, discussion_point: updated });
});

router.delete('/:id/discussion-points/:dpId', (req: Request, res: Response) => {
  db.prepare('DELETE FROM proposal_discussion_points WHERE id = ? AND proposal_id = ?').run(req.params.dpId, req.params.id);
  res.json({ ok: true });
});

/* ─── CONDITIONAL MODULES ─── */
router.get('/:id/modules', (req: Request, res: Response) => {
  const modules = db.prepare('SELECT * FROM proposal_conditional_modules WHERE proposal_id = ?').all(req.params.id);
  const fees = db.prepare('SELECT * FROM proposal_extended_fees WHERE proposal_id = ?').all(req.params.id);
  const tiers = db.prepare('SELECT * FROM proposal_growth_tiers WHERE proposal_id = ?').all(req.params.id);
  res.json({ ok: true, modules, extended_fees: fees, growth_tiers: tiers });
});

router.post('/:id/modules', (req: Request, res: Response) => {
  const { module_type, is_active, config } = req.body;
  if (!module_type) return res.status(400).json({ ok: false, error: 'module_type required' });

  const existing = db.prepare('SELECT id FROM proposal_conditional_modules WHERE proposal_id = ? AND module_type = ?').get(req.params.id, module_type);
  if (existing) {
    db.prepare('UPDATE proposal_conditional_modules SET is_active = ?, config = ?, updated_at = datetime(\'now\') WHERE id = ?').run(
      is_active ? 1 : 0, config ? JSON.stringify(config) : null, (existing as any).id
    );
  } else {
    db.prepare(`INSERT INTO proposal_conditional_modules (proposal_id, module_type, is_active, config) VALUES (?,?,?,?)`).run(
      req.params.id, module_type, is_active ? 1 : 0, config ? JSON.stringify(config) : null
    );
  }
  const modules = db.prepare('SELECT * FROM proposal_conditional_modules WHERE proposal_id = ?').all(req.params.id);
  audit(req.params.id, 'module_toggled', req.body.actor || null, `Module ${module_type} ${is_active ? 'activated' : 'deactivated'}`);
  res.json({ ok: true, modules });
});

/* ─── EXTENDED FEES ─── */
router.post('/:id/fees', (req: Request, res: Response) => {
  const { fee_name, category, basis, confidence } = req.body;
  if (!fee_name) return res.status(400).json({ ok: false, error: 'fee_name required' });
  db.prepare(`INSERT INTO proposal_extended_fees (proposal_id, fee_name, category, basis, confidence) VALUES (?,?,?,?,?)`).run(
    req.params.id, fee_name, category || 'Transaction-led', basis || null, confidence || 'E'
  );
  const fees = db.prepare('SELECT * FROM proposal_extended_fees WHERE proposal_id = ?').all(req.params.id);
  res.status(201).json({ ok: true, fees });
});

/* ─── GROWTH TIERS ─── */
router.post('/:id/tiers', (req: Request, res: Response) => {
  const { tier_name, measurement_threshold, partner_economics, effective_date } = req.body;
  if (!tier_name) return res.status(400).json({ ok: false, error: 'tier_name required' });
  db.prepare(`INSERT INTO proposal_growth_tiers (proposal_id, tier_name, measurement_threshold, partner_economics, effective_date) VALUES (?,?,?,?,?)`).run(
    req.params.id, tier_name, measurement_threshold || null, partner_economics || null, effective_date || null
  );
  const tiers = db.prepare('SELECT * FROM proposal_growth_tiers WHERE proposal_id = ?').all(req.params.id);
  res.status(201).json({ ok: true, tiers });
});

/* ─── CLAIMS ATTACHMENT ─── */
router.get('/:id/claims', (req: Request, res: Response) => {
  const claims = db.prepare(`SELECT pc.id as mapping_id, pcl.* FROM proposal_claims pc JOIN proposal_claims_library pcl ON pc.claim_id = pcl.id WHERE pc.proposal_id = ?`).all(req.params.id);
  res.json({ ok: true, claims });
});

router.post('/:id/claims', (req: Request, res: Response) => {
  const { claim_id, section, custom_wording } = req.body;
  if (!claim_id) return res.status(400).json({ ok: false, error: 'claim_id required' });

  // Verify claim exists and is not deprecated
  const claim = db.prepare('SELECT * FROM proposal_claims_library WHERE id = ?').get(claim_id) as any;
  if (!claim) return res.status(404).json({ ok: false, error: 'Claim not found' });
  if (claim.status === 'Deprecated') return res.status(400).json({ ok: false, error: 'Deprecated claims cannot be attached' });
  if (claim.status === 'Pending') {
    // WARN but allow — will be blocked at release gate
  }

  db.prepare(`INSERT OR IGNORE INTO proposal_claims (proposal_id, claim_id, section, custom_wording) VALUES (?,?,?,?)`).run(
    req.params.id, claim_id, section || null, custom_wording || null
  );
  const claims = db.prepare(`SELECT pc.id as mapping_id, pcl.* FROM proposal_claims pc JOIN proposal_claims_library pcl ON pc.claim_id = pcl.id WHERE pc.proposal_id = ?`).all(req.params.id);
  res.status(201).json({ ok: true, claims });
});

router.delete('/:id/claims/:claimId', (req: Request, res: Response) => {
  db.prepare('DELETE FROM proposal_claims WHERE proposal_id = ? AND claim_id = ?').run(req.params.id, req.params.claimId);
  res.json({ ok: true });
});

/* ─── RESPONSIBILITIES (template §2.4/2.5 roles + §7.5 risk & control) ─── */
router.get('/:id/responsibilities', (req: Request, res: Response) => {
  const rows = db.prepare('SELECT * FROM proposal_responsibilities WHERE proposal_id = ? ORDER BY id').all(req.params.id);
  res.json({ ok: true, responsibilities: rows });
});

router.post('/:id/responsibilities', (req: Request, res: Response) => {
  const { party, domain, description } = req.body;
  if (!party || !description) return res.status(400).json({ ok: false, error: 'party and description required' });
  const result = db.prepare('INSERT INTO proposal_responsibilities (proposal_id, party, domain, description) VALUES (?,?,?,?)').run(
    req.params.id, party, domain || null, description
  );
  const created = db.prepare('SELECT * FROM proposal_responsibilities WHERE id = ?').get(result.lastInsertRowid);
  audit(req.params.id, 'responsibility_added', req.body.actor || null, `Responsibility: ${party} — ${domain || 'role'} — ${description.slice(0, 80)}`);
  res.status(201).json({ ok: true, responsibility: created });
});

router.patch('/:id/responsibilities/:respId', (req: Request, res: Response) => {
  const fields = ['party', 'domain', 'description'];
  const updates: string[] = [];
  const vals: any[] = [];
  for (const f of fields) {
    if (req.body[f] !== undefined) { updates.push(`${f} = ?`); vals.push(req.body[f]); }
  }
  if (updates.length === 0) return res.status(400).json({ ok: false, error: 'No fields' });
  vals.push(req.params.respId, req.params.id);
  db.prepare(`UPDATE proposal_responsibilities SET ${updates.join(', ')} WHERE id = ? AND proposal_id = ?`).run(...vals);
  const updated = db.prepare('SELECT * FROM proposal_responsibilities WHERE id = ?').get(req.params.respId);
  res.json({ ok: true, responsibility: updated });
});

router.delete('/:id/responsibilities/:respId', (req: Request, res: Response) => {
  db.prepare('DELETE FROM proposal_responsibilities WHERE id = ? AND proposal_id = ?').run(req.params.respId, req.params.id);
  audit(req.params.id, 'responsibility_removed', req.body.actor || null, `Responsibility removed (id ${req.params.respId})`);
  res.json({ ok: true });
});

router.post('/:id/responsibilities/seed', (req: Request, res: Response) => {
  const route = req.body.route || (db.prepare('SELECT partnership_route FROM proposal_projects WHERE id = ?').get(req.params.id) as any)?.partnership_route || 'Other';
  const defaults = ROUTE_RESPONSIBILITY_DEFAULTS[route] || [];
  const existing = db.prepare('SELECT COUNT(*) as c FROM proposal_responsibilities WHERE proposal_id = ?').get(req.params.id) as any;
  if (existing.c === 0 && defaults.length > 0) {
    const ins = db.prepare('INSERT INTO proposal_responsibilities (proposal_id, party, domain, description) VALUES (?,?,?,?)');
    const tx = db.transaction(() => {
      for (const d of defaults) ins.run(req.params.id, d.party, d.domain, d.description);
    });
    tx();
    audit(req.params.id, 'responsibilities_seeded', req.body.actor || null, `Responsibility defaults seeded for route ${route}`);
  }
  const rows = db.prepare('SELECT * FROM proposal_responsibilities WHERE proposal_id = ? ORDER BY id').all(req.params.id);
  res.json({ ok: true, seeded: existing.c === 0 ? defaults.length : 0, responsibilities: rows });
});

/* ─── COMMERCIAL & PARTNERSHIP TERMS (template §9) ─── */
router.get('/:id/terms', (req: Request, res: Response) => {
  const terms = db.prepare('SELECT * FROM proposal_terms WHERE proposal_id = ?').get(req.params.id);
  const metrics = db.prepare('SELECT * FROM proposal_success_metrics WHERE proposal_id = ? ORDER BY id').all(req.params.id);
  res.json({ ok: true, terms: terms || null, success_metrics: metrics });
});

router.put('/:id/terms', (req: Request, res: Response) => {
  const f = [
    'commercial_review','review_data_required','review_reconsideration','review_approval_process',
    'recon_cadence','payment_cadence','dispute_window','settlement_mechanism',
    'pilot_required','pilot_target_segment','pilot_duration','pilot_scope','pilot_success_measures','pilot_decision_gate','pilot_expansion_criteria',
    'exclusivity_requested','excl_scope','excl_geography','excl_product','excl_customer_segment','excl_duration','excl_performance_conditions','excl_conflict_check',
  ];
  const set: string[] = [];
  const vals: any[] = [];
  for (const k of f) {
    if (req.body[k] !== undefined) { set.push(`${k} = ?`); vals.push(k === 'pilot_required' || k === 'exclusivity_requested' ? (req.body[k] ? 1 : 0) : req.body[k]); }
  }
  set.push('updated_at = datetime(\'now\')');
  const existing = db.prepare('SELECT proposal_id FROM proposal_terms WHERE proposal_id = ?').get(req.params.id);
  if (existing) {
    db.prepare(`UPDATE proposal_terms SET ${set.join(', ')} WHERE proposal_id = ?`).run(...vals, req.params.id);
  } else {
    const cols = f.filter(k => req.body[k] !== undefined).map(k => k).join(', ');
    const placeholders = f.filter(k => req.body[k] !== undefined).map(() => '?').join(', ');
    const insertVals = vals; // updated_at is a literal in the SQL below (no placeholder added to vals)
    db.prepare(`INSERT INTO proposal_terms (proposal_id, ${cols}, updated_at) VALUES (?, ${placeholders}, datetime('now'))`).run(req.params.id, ...insertVals);
  }
  audit(req.params.id, 'terms_updated', req.body.actor || null, 'Commercial & partnership terms updated');
  const terms = db.prepare('SELECT * FROM proposal_terms WHERE proposal_id = ?').get(req.params.id);
  res.json({ ok: true, terms });
});

/* ─── SUCCESS METRICS (template §9.4) ─── */
router.post('/:id/metrics', (req: Request, res: Response) => {
  const { metric, measurement_basis, target, linked_model } = req.body;
  if (!metric) return res.status(400).json({ ok: false, error: 'metric required' });
  const result = db.prepare('INSERT INTO proposal_success_metrics (proposal_id, metric, measurement_basis, target, linked_model) VALUES (?,?,?,?,?)').run(
    req.params.id, metric, measurement_basis || null, target || null, linked_model || null
  );
  const created = db.prepare('SELECT * FROM proposal_success_metrics WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json({ ok: true, metric: created });
});

router.patch('/:id/metrics/:metricId', (req: Request, res: Response) => {
  const fields = ['metric', 'measurement_basis', 'target', 'linked_model'];
  const updates: string[] = [];
  const vals: any[] = [];
  for (const f of fields) {
    if (req.body[f] !== undefined) { updates.push(`${f} = ?`); vals.push(req.body[f]); }
  }
  if (updates.length === 0) return res.status(400).json({ ok: false, error: 'No fields' });
  vals.push(req.params.metricId, req.params.id);
  db.prepare(`UPDATE proposal_success_metrics SET ${updates.join(', ')} WHERE id = ? AND proposal_id = ?`).run(...vals);
  const updated = db.prepare('SELECT * FROM proposal_success_metrics WHERE id = ?').get(req.params.metricId);
  res.json({ ok: true, metric: updated });
});

router.delete('/:id/metrics/:metricId', (req: Request, res: Response) => {
  db.prepare('DELETE FROM proposal_success_metrics WHERE id = ? AND proposal_id = ?').run(req.params.metricId, req.params.id);
  res.json({ ok: true });
});

/* ─── AUDIT TRAIL ─── */
router.get('/:id/audit', (req: Request, res: Response) => {
  const events = db.prepare('SELECT * FROM proposal_audit_events WHERE proposal_id = ? ORDER BY created_at DESC LIMIT 100').all(req.params.id);
  res.json({ ok: true, events });
});

/* ─── DASHBOARD ─── */
router.get('/dashboard/summary', (_req: Request, res: Response) => {
  const total = (db.prepare('SELECT COUNT(*) as c FROM proposal_projects WHERE is_archived = 0').get() as any).c;
  const blocked = (db.prepare("SELECT COUNT(*) as c FROM proposal_projects WHERE current_state IN ('revision_required','not_eligible') AND is_archived = 0").get() as any).c;
  const inDraft = (db.prepare("SELECT COUNT(*) as c FROM proposal_projects WHERE current_state IN ('drafting','eligible') AND is_archived = 0").get() as any).c;
  const awaitingReview = (db.prepare("SELECT COUNT(*) as c FROM proposal_projects WHERE current_state IN ('pre_flight','functional_review','business_case') AND is_archived = 0").get() as any).c;
  const releaseReady = (db.prepare("SELECT COUNT(*) as c FROM proposal_projects WHERE current_state IN ('approval_ready','release_gate') AND is_archived = 0").get() as any).c;

  // Attention items — approvals overdue, unresolved P, blocked
  const overdueApprovals = db.prepare(`
    SELECT pp.id as proposal_id, pp.partner_name as partner,
           pa.function_area,
           pa.status,
           pa.reviewed_at,
           'approval_overdue' as issue, 'high' as severity
    FROM proposal_approvals pa JOIN proposal_projects pp ON pa.proposal_id = pp.id
    WHERE pa.status = 'pending' AND pp.is_archived = 0
    ORDER BY pp.partner_name, pa.function_area
  `).all() as any[];

  const unresolvedPlaceholders = db.prepare(`
    SELECT pp.id as proposal_id, pp.partner_name as partner,
           NULL as function_area,
           'open' as status,
           NULL as reviewed_at,
           'unresolved_placeholder' as issue, 'high' as severity
    FROM proposal_assumptions pa JOIN proposal_projects pp ON pa.proposal_id = pp.id
    WHERE pa.confidence = 'P' AND pa.status = 'open' AND pp.is_archived = 0
    GROUP BY pp.id
  `).all() as any[];

  // Rich attention items with detail line + target tab for Resolve Now
  const attentionItems = [...overdueApprovals, ...unresolvedPlaceholders].map((a: any) => {
    if (a.issue === 'approval_overdue') {
      return {
        proposal_id: a.proposal_id,
        partner: a.partner,
        issue: 'approval_overdue',
        function_area: a.function_area,
        detail: `${a.function_area.replace(/_/g, ' ')} approval pending`, 
        count: 1,
        severity: 'high',
        target_tab: 'approvals',
      };
    }
    return {
      proposal_id: a.proposal_id,
      partner: a.partner,
      issue: 'unresolved_placeholder',
      function_area: null,
      detail: 'Unresolved [P] placeholder assumption',
      count: 1,
      severity: 'high',
      target_tab: 'assumptions',
    };
  });

  // Group by proposal so each partner shows once (most urgent approval first)
  const grouped = attentionItems.reduce((acc: any[], item: any) => {
    const existing = acc.find(x => x.proposal_id === item.proposal_id && x.issue === item.issue);
    if (existing) {
      existing.count += 1;
      existing.detail = `${existing.count} ${existing.issue === 'approval_overdue' ? 'approvals pending' : 'unresolved [P] placeholders'} — ${existing.function_area || ''}`.trim();
      existing.function_area = existing.function_area || item.function_area;
    } else {
      acc.push({ ...item });
    }
    return acc;
  }, []);

  // Pipeline by state
  const pipeline = db.prepare(`
    SELECT current_state as state, COUNT(*) as count, COALESCE(SUM(expected_revenue), 0) as total_revenue
    FROM proposal_projects WHERE is_archived = 0 GROUP BY current_state ORDER BY count DESC
  `).all();

  res.json({
    ok: true,
    summary: { total_active: total, blocked, in_draft: inDraft, awaiting_review: awaitingReview, release_ready: releaseReady },
    attention_required: grouped.slice(0, 10),
    pipeline,
  });
});

/* ─── GENERATE DOCUMENT ─── */
router.post('/:id/generate', (req: Request, res: Response) => {
  // Dynamic import to break circular dependency
  import('../services/document-generator.js').then(({ generateProposalDocument }) => {
    const result = generateProposalDocument(req.params.id);
    if (result.blocked) {
      return res.status(400).json({
        ok: false,
        error: 'Release gate has not passed — document cannot be generated',
        blockers: result.blockers,
      });
    }

    // Record the external release
    db.prepare('UPDATE proposal_projects SET external_released_at = datetime(\'now\'), external_release_version = external_release_version + 1, updated_at = datetime(\'now\') WHERE id = ?').run(req.params.id);

    // Create version snapshot
    snapshotVersion(req.params.id, req.body.actor || null, 1);
    audit(req.params.id, 'document_generated', req.body.actor || null, 'External proposal document generated');

    res.json({
      ok: true,
      document: result.html,
      version: result.version,
      generated_at: result.generated_at,
    });
  }).catch((err) => {
    console.error('[proposals] document generator error:', err);
    res.status(500).json({ ok: false, error: 'Failed to generate document' });
  });
});

/* ─── EXPORT TO DOCX ─── */
router.post('/:id/export-docx', async (req: Request, res: Response) => {
  try {
    const { generateProposalDocx } = await import('../services/docx-exporter.js');
    const result = await generateProposalDocx(req.params.id);

    if (result.blocked) {
      return res.status(400).json({
        ok: false,
        error: 'Release gate has not passed — document cannot be exported',
        blockers: result.blockers,
      });
    }

    // Record the external release (same as HTML generation)
    db.prepare('UPDATE proposal_projects SET external_released_at = datetime(\'now\'), external_release_version = external_release_version + 1, updated_at = datetime(\'now\') WHERE id = ?').run(req.params.id);
    snapshotVersion(req.params.id, req.body.actor || null, 1);
    audit(req.params.id, 'docx_exported', req.body.actor || null, 'External proposal exported as DOCX');

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
    res.send(result.buffer);
  } catch (err) {
    console.error('[proposals] docx export error:', err);
    res.status(500).json({ ok: false, error: 'Failed to export DOCX' });
  }
});

export default router;