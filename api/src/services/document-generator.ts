/**
 * Proposal Document Generator
 * Renders the partner-facing Commercial Proposal from structured CPO data.
 * - Strips all internal guidance (placeholders, approval statuses, audit trails)
 * - Blocks generation if release gate has not passed
 * - Outputs clean HTML suitable for print-to-PDF
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import db from '../db.js';
import { runReleaseGate } from '../routes/release.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function laniLogoSrc(): string {
  const candidates = [
    path.join(__dirname, '..', '..', '..', 'lani_logo.png'),
    path.join(__dirname, '..', '..', '..', 'web', 'public', 'lani_logo.png'),
  ];
  for (const file of candidates) {
    if (fs.existsSync(file)) {
      return `data:image/png;base64,${fs.readFileSync(file).toString('base64')}`;
    }
  }
  return '';
}

export interface GeneratedDocument {
  html: string;
  version: number;
  generated_at: string;
  proposal_id: string;
  blocked: boolean;
  blockers?: { name: string; detail: string }[];
}

const escape = (v: any): string => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function currency(v: any): string {
  if (v === null || v === undefined) return '—';
  return '$' + Number(v).toLocaleString('en-US', { maximumFractionDigits: 2 });
}

function confidenceBadge(c: string): string {
  const map: Record<string, string> = {
    C: '<span class="tag tag-c">[C] Confirmed</span>',
    E: '<span class="tag tag-e">[E] Estimated</span>',
    P: '<span class="tag tag-p">[P] Placeholder</span>',
  };
  return map[c] || '';
}

export function generateProposalDocument(proposalId: string): GeneratedDocument {
  const project = db.prepare('SELECT * FROM proposal_projects WHERE id = ?').get(proposalId) as any;
  if (!project) {
    return { html: '', version: 0, generated_at: new Date().toISOString(), proposal_id: proposalId, blocked: true, blockers: [{ name: 'Proposal Exists', detail: 'Proposal not found' }] };
  }

  // HARD GATE: must pass release gate before external doc can be generated
  const gate = runReleaseGate(proposalId);
  if (!gate.passed) {
    const blockers = gate.checks.filter(c => !c.passed).map(c => ({ name: c.name, detail: c.detail }));
    return {
      html: '',
      version: 0,
      generated_at: new Date().toISOString(),
      proposal_id: proposalId,
      blocked: true,
      blockers,
    };
  }

  const economics = db.prepare('SELECT * FROM proposal_economics WHERE proposal_id = ?').get(proposalId) as any;
  const approvals = db.prepare(`
    SELECT pa.function_area, pa.reviewer_name, pa.reviewed_at
    FROM proposal_approvals pa WHERE pa.proposal_id = ? AND pa.status = 'approved'
  `).all(proposalId) as any[];

  const responsibilities = db.prepare('SELECT * FROM proposal_responsibilities WHERE proposal_id = ? ORDER BY id').all(proposalId) as any[];
  const terms = db.prepare('SELECT * FROM proposal_terms WHERE proposal_id = ?').get(proposalId) as any;
  const metrics = db.prepare('SELECT * FROM proposal_success_metrics WHERE proposal_id = ? ORDER BY id').all(proposalId) as any[];

  const claims = db.prepare(`
    SELECT pcl.* FROM proposal_claims pc
    JOIN proposal_claims_library pcl ON pc.claim_id = pcl.id
    WHERE pc.proposal_id = ? AND pcl.status = 'Approved'
  `).all(proposalId) as any[];

  const assumptions = db.prepare(`
    SELECT * FROM proposal_assumptions
    WHERE proposal_id = ? AND confidence != 'P' ORDER BY category
  `).all(proposalId) as any[];

  const risks = db.prepare('SELECT * FROM proposal_risks WHERE proposal_id = ?').all(proposalId) as any[];
  const discussionPoints = db.prepare('SELECT * FROM proposal_discussion_points WHERE proposal_id = ?').all(proposalId) as any[];
  const modules = db.prepare('SELECT * FROM proposal_conditional_modules WHERE proposal_id = ? AND is_active = 1').all(proposalId) as any[];
  const fees = db.prepare('SELECT * FROM proposal_extended_fees WHERE proposal_id = ?').all(proposalId) as any[];
  const tiers = db.prepare('SELECT * FROM proposal_growth_tiers WHERE proposal_id = ?').all(proposalId) as any[];

  const activeModuleTypes = new Set(modules.map((m: any) => m.module_type));

  /* ─── Build HTML ─── */
  const modelMap: Record<string, string> = { A: 'Volume / Transaction-Led', B: 'AUM / Recurring Relationship-Led', C: 'Referral / Outcome-Led', D: 'Custom / Strategic' };
  const modelName = modelMap[project.commercial_model] || '—';

  const sections: string[] = [];

  // Header
  const releaseVersion = (project.external_release_version || 0) + 1;
  sections.push(`
    <div class="doc-header">
      <div class="logo-mark">
        <img src="${laniLogoSrc()}" alt="Lani Consulting" height="44" style="height:44px;width:auto;" />
      </div>
      <div>
        <div class="doc-title">COMMERCIAL PROPOSAL</div>
        <div class="doc-partner">Prepared for ${escape(project.partner_name)}</div>
        <div class="doc-meta">UTribe · Proposal Ref: ${escape(project.id)} · v${releaseVersion}</div>
      </div>
    </div>
  `);

  // 1. Executive Summary
  sections.push(`
    <h2>1. Executive Summary</h2>
    <h3>1.1 Partnership Context</h3>
    <p>${escape(project.executive_summary || 'Proposal under development.')}</p>
    ${project.country ? `<p><strong>Jurisdiction:</strong> ${escape(project.country)}</p>` : ''}
    ${project.vertical ? `<p><strong>Vertical:</strong> ${escape(project.vertical)}</p>` : ''}
    <p class="non-binding"><em>This document is non-binding and intended solely as a basis for commercial discussions prior to execution of definitive agreements. All commercial terms are subject to final due diligence, internal approvals from both parties, and definitive agreements.</em></p>
  `);

  // 2. Partnership Scope
  sections.push(`
    <h2>2. Partnership Scope</h2>
    <p><strong>Proposed partnership route:</strong> ${escape(project.partnership_route || '—')}</p>
    <p>${escape(project.partnership_route === 'Embedded / Co-branded' ? 'This partnership is structured as an embedded, co-branded route, with integration and onboarding responsibilities shared across both parties.' : 'This partnership follows a defined route with responsibilities aligned to the selected collaboration model.')}</p>
  `);

  // 2.4 / 2.5 Roles & Responsibilities (free-form role entries only; controls render in §7.5)
  const roleGroups = ['UTribe', 'Partner', 'Joint'].map((party, i) => {
    const items = responsibilities.filter((r: any) => r.party === party && !r.domain);
    if (items.length === 0) return '';
    const title = i === 2 ? 'Joint Responsibilities' : party === 'UTribe' ? 'UTribe Responsibilities' : `${escape(project.partner_name)} Responsibilities`;
    return `<h3>${title}</h3><ul>${items.map((r: any) => `<li>${escape(r.description)}</li>`).join('')}</ul>`;
  }).filter(Boolean).join('');
  if (roleGroups) {
    sections.push(`<h2>2.4 Roles and Responsibilities</h2>${roleGroups}`);
  }

  // 3. Commercial Model
  sections.push(`
    <h2>3. Commercial Model</h2>
    <p><strong>Selected classification:</strong> Model ${escape(project.commercial_model)} — ${escape(modelName)}</p>
    <p>The economics of this proposal are structured around the value created by the partnership under the selected model. All figures below are ${confidenceBadge('C')} or ${confidenceBadge('E')} unless otherwise indicated.</p>
  `);

  // 4. Commercial Framework + Economics
  if (economics) {
    sections.push(`
      <h2>4. Commercial Framework</h2>
      <table>
        <thead><tr><th>Economic layer</th><th>Proposed basis</th><th>Confidence</th></tr></thead>
        <tbody>
          <tr><td>Gross commercial value</td><td>${currency(economics.gross_commercial_value)}</td><td>${confidenceBadge(economics.gross_confidence)}</td></tr>
          <tr><td>Operating / delivery cost</td><td>${currency(economics.operating_cost)}</td><td>${confidenceBadge(economics.operating_cost_confidence)}</td></tr>
          <tr><td>Residual commercial pool</td><td>${currency(economics.residual_pool)}</td><td>—</td></tr>
          <tr><td>Partner allocation</td><td>${currency(economics.partner_allocation)} (${economics.partner_allocation_pct ?? '—'}%)</td><td>—</td></tr>
          <tr><td>UTribe allocation</td><td>${currency(economics.utribe_allocation)} (${economics.utribe_allocation_pct ?? '—'}%)</td><td>—</td></tr>
        </tbody>
      </table>
      <h3>4.1 Effective Economics</h3>
      <table>
        <thead><tr><th>Party</th><th>Share of residual</th><th>Effective economics (vs gross base)</th></tr></thead>
        <tbody>
          <tr><td>Partner</td><td>${economics.partner_allocation_pct ?? '—'}%</td><td>${economics.effective_partner_pct ?? '—'}% (${currency(economics.partner_effective_economics)})</td></tr>
          <tr><td>UTribe</td><td>${economics.utribe_allocation_pct ?? '—'}%</td><td>${economics.effective_utribe_pct ?? '—'}% (${currency(economics.utribe_effective_economics)})</td></tr>
        </tbody>
      </table>
    `);
  }

  // 5. Conditional modules
  if (activeModuleTypes.size > 0) {
    const moduleSections: string[] = [];
    if (activeModuleTypes.has('extended_fees') && fees.length > 0) {
      moduleSections.push(`
        <h3>5.1 Extended Fee Structure</h3>
        <table><thead><tr><th>Fee / mechanism</th><th>Category</th><th>Basis</th><th>Confidence</th></tr></thead><tbody>
        ${fees.map((f: any) => `<tr><td>${escape(f.fee_name)}</td><td>${escape(f.category)}</td><td>${escape(f.basis || '—')}</td><td>${confidenceBadge(f.confidence)}</td></tr>`).join('')}
        </tbody></table>
      `);
    }
    if (activeModuleTypes.has('growth_incentives') && tiers.length > 0) {
      moduleSections.push(`
        <h3>5.2 Tiered Growth Incentives</h3>
        <table><thead><tr><th>Tier</th><th>Measurement threshold</th><th>Partner economics</th><th>Effective date</th></tr></thead><tbody>
        ${tiers.map((t: any) => `<tr><td>${escape(t.tier_name)}</td><td>${currency(t.measurement_threshold)}</td><td>${escape(t.partner_economics || '—')}</td><td>${escape(t.effective_date || '—')}</td></tr>`).join('')}
        </tbody></table>
      `);
    }
    if (activeModuleTypes.has('pilot')) {
      moduleSections.push(`<h3>5.3 Pilot Phase</h3><p>A pilot phase is proposed with defined success measures and an expansion decision gate.</p>`);
    }
    if (activeModuleTypes.has('exclusivity')) {
      moduleSections.push(`<h3>5.4 Exclusivity</h3><p>Exclusivity terms, if applicable, are defined by scope, geography, product, customer segment, duration, and performance conditions, subject to mutual agreement.</p>`);
    }
    if (moduleSections.length > 0) {
      sections.push(`<h2>5. Conditional Commercial Modules</h2>${moduleSections.join('')}`);
    }
  }

  // 6. Strategic Value
  sections.push(`
    <h2>6. Strategic Value</h2>
    <h3>6.1 Value to ${escape(project.partner_name)}</h3>
    <p>${escape(project.partner_value || 'Proposed value to be finalised.')}</p>
    <h3>6.2 Value to UTribe</h3>
    <p>${escape(project.utribe_value || 'Proposed value to be finalised.')}</p>
  `);

  // 7. Implementation & Governance
  sections.push(`
    <h2>7. Implementation &amp; Governance</h2>
    <table>
      <tbody>
        <tr><td><strong>Implementation route</strong></td><td>${escape(project.implementation_route || '—')}</td></tr>
        <tr><td><strong>Technical dependencies</strong></td><td>${escape(project.technical_dependencies || '—')}</td></tr>
        <tr><td><strong>Third-party dependencies</strong></td><td>${escape(project.third_party_dependencies || '—')}</td></tr>
        <tr><td><strong>Product dependencies</strong></td><td>${escape(project.product_dependencies || '—')}</td></tr>
        <tr><td><strong>Estimated timing</strong></td><td>${escape(project.implementation_timing || '—')}</td></tr>
        <tr><td><strong>Governance cadence</strong></td><td>${escape(project.governance_cadence || '—')}</td></tr>
        <tr><td><strong>Escalation route</strong></td><td>${escape(project.escalation_route || '—')}</td></tr>
      </tbody>
    </table>
  `);

  // 7.2 Reporting & Transparency
  sections.push(`
    <h3>7.2 Reporting and Transparency</h3>
    <p>The parties will define a reporting framework covering, where relevant: commercial performance, transaction activity, customer activity, operational exceptions, reconciliation, agreed compliance information and service performance. Exact reporting obligations will be defined during implementation and reflected in definitive agreements.</p>
  `);

  // 7.3 Compliance Alignment
  sections.push(`
    <h3>7.3 Compliance Alignment</h3>
    <p>The proposed partnership remains subject to applicable KYC / AML obligations, jurisdiction-specific regulatory requirements, agreed risk disclosure, customer suitability requirements where applicable, transaction monitoring responsibilities, data and privacy obligations, and applicable $GIFT claims and disclosures under the Approved Claims &amp; Evidence Register.</p>
  `);

  // 7.5 Risk and Control Responsibilities
  const controlRows = responsibilities.filter((r: any) => r.domain);
  if (controlRows.length > 0) {
    sections.push(`
      <h3>7.5 Risk and Control Responsibilities</h3>
      <table>
        <thead><tr><th>Control domain</th><th>Responsible party</th><th>Responsibility</th></tr></thead>
        <tbody>
          ${controlRows.map((r: any) => `<tr><td>${escape(r.domain)}</td><td>${escape(r.party)}</td><td>${escape(r.description)}</td></tr>`).join('')}
        </tbody>
      </table>
    `);
  }

  // 8. Key Assumptions
  if (assumptions.length > 0) {
    const byCategory = assumptions.reduce((acc: Record<string, any[]>, a: any) => {
      (acc[a.category] = acc[a.category] || []).push(a);
      return acc;
    }, {});
    sections.push(`
      <h2>8. Key Assumptions</h2>
      ${Object.entries(byCategory).map(([cat, items]: [string, any[]]) => `
        <h3>${escape(cat)}</h3>
        <ul>${items.map(a => `<li>${escape(a.description)} ${confidenceBadge(a.confidence)}</li>`).join('')}</ul>
      `).join('')}
    `);
  }

  // 9. Commercial Terms (full §9)
  const termRows = [
    ['Proposed term', project.contract_term || '—'],
    ['Review cadence', terms?.commercial_review || '—'],
    ['Payment cadence', terms?.payment_cadence || '—'],
    ['Reconciliation cadence', terms?.recon_cadence || '—'],
    ['Dispute window', terms?.dispute_window || '—'],
    ['Settlement mechanism', terms?.settlement_mechanism || '—'],
  ];
  sections.push(`
    <h2>9. Commercial and Partnership Terms</h2>
    <table><tbody>
    ${termRows.map(([k, v]) => `<tr><td><strong>${escape(k)}</strong></td><td>${escape(v)}</td></tr>`).join('')}
    </tbody></table>
    <p>Confidentiality will be maintained over commercial, operational, customer and technical information, subject to definitive agreement.</p>
  `);

  // 9.2 Commercial Review detail
  if (terms?.commercial_review || terms?.review_data_required || terms?.review_reconsideration || terms?.review_approval_process) {
    sections.push(`
      <h3>9.2 Commercial Review</h3>
      <ul>
        ${terms?.review_data_required ? `<li><strong>Performance data required:</strong> ${escape(terms.review_data_required)}</li>` : ''}
        ${terms?.review_reconsideration ? `<li><strong>Circumstances for reconsideration:</strong> ${escape(terms.review_reconsideration)}</li>` : ''}
        ${terms?.review_approval_process ? `<li><strong>Approval process for changes:</strong> ${escape(terms.review_approval_process)}</li>` : ''}
      </ul>
    `);
  }

  // 9.4 Success Metrics
  if (metrics.length > 0) {
    sections.push(`
      <h3>9.4 Success Metrics</h3>
      <table>
        <thead><tr><th>Metric</th><th>Measurement basis</th><th>Target</th><th>Linked model</th></tr></thead>
        <tbody>
          ${metrics.map((m: any) => `<tr><td>${escape(m.metric)}</td><td>${escape(m.measurement_basis || '—')}</td><td>${escape(m.target || '—')}</td><td>${escape(m.linked_model || '—')}</td></tr>`).join('')}
        </tbody>
      </table>
    `);
  }

  // 9.3 Pilot Phase
  if (activeModuleTypes.has('pilot') && terms?.pilot_duration) {
    sections.push(`
      <h3>9.3 Pilot Phase</h3>
      <table><tbody>
        ${terms?.pilot_target_segment ? `<tr><td><strong>Target segment</strong></td><td>${escape(terms.pilot_target_segment)}</td></tr>` : ''}
        ${terms?.pilot_duration ? `<tr><td><strong>Duration</strong></td><td>${escape(terms.pilot_duration)}</td></tr>` : ''}
        ${terms?.pilot_scope ? `<tr><td><strong>Scope</strong></td><td>${escape(terms.pilot_scope)}</td></tr>` : ''}
        ${terms?.pilot_success_measures ? `<tr><td><strong>Success measures</strong></td><td>${escape(terms.pilot_success_measures)}</td></tr>` : ''}
        ${terms?.pilot_decision_gate ? `<tr><td><strong>Decision gate</strong></td><td>${escape(terms.pilot_decision_gate)}</td></tr>` : ''}
        ${terms?.pilot_expansion_criteria ? `<tr><td><strong>Expansion criteria</strong></td><td>${escape(terms.pilot_expansion_criteria)}</td></tr>` : ''}
      </tbody></table>
    `);
  }

  // 9.7 Exclusivity
  if (activeModuleTypes.has('exclusivity') && terms?.excl_scope) {
    sections.push(`
      <h3>9.7 Exclusivity</h3>
      <table><tbody>
        ${terms?.excl_scope ? `<tr><td><strong>Scope</strong></td><td>${escape(terms.excl_scope)}</td></tr>` : ''}
        ${terms?.excl_geography ? `<tr><td><strong>Geography</strong></td><td>${escape(terms.excl_geography)}</td></tr>` : ''}
        ${terms?.excl_product ? `<tr><td><strong>Product</strong></td><td>${escape(terms.excl_product)}</td></tr>` : ''}
        ${terms?.excl_customer_segment ? `<tr><td><strong>Customer segment</strong></td><td>${escape(terms.excl_customer_segment)}</td></tr>` : ''}
        ${terms?.excl_duration ? `<tr><td><strong>Duration</strong></td><td>${escape(terms.excl_duration)}</td></tr>` : ''}
        ${terms?.excl_performance_conditions ? `<tr><td><strong>Performance conditions</strong></td><td>${escape(terms.excl_performance_conditions)}</td></tr>` : ''}
        ${terms?.excl_conflict_check ? `<tr><td><strong>Conflict check</strong></td><td>${escape(terms.excl_conflict_check)}</td></tr>` : ''}
      </tbody></table>
    `);
  }

  // 10. Approved Claims
  if (claims.length > 0) {
    sections.push(`
      <h2>10. Product and Assurance Statements</h2>
      <ul>${claims.map((c: any) => `<li>${escape(c.claim)}</li>`).join('')}</ul>
    `);
  }

  // 11. Discussion Points
  if (discussionPoints.length > 0) {
    sections.push(`
      <h2>11. Discussion Points</h2>
      <ul>${discussionPoints.filter((d: any) => d.status !== 'resolved').map((d: any) => `<li><strong>${escape(d.category)}:</strong> ${escape(d.question)}</li>`).join('')}</ul>
    `);
  }

  // 12. Next Steps
  sections.push(`
    <h2>12. Proposed Next Steps</h2>
    <ol>
      <li><strong>Commercial alignment</strong> — confirm the proposed economic model and outstanding assumptions.</li>
      <li><strong>Scope confirmation</strong> — confirm the initial partnership, customer and operating scope.</li>
      <li><strong>Functional validation</strong> — close Product, Technology, Finance, Operations, Legal and Compliance dependencies.</li>
      <li><strong>Implementation planning</strong> — agree implementation requirements, owners, milestones and success measures.</li>
      <li><strong>Definitive agreements</strong> — translate the agreed commercial and operating model into the appropriate contractual documentation.</li>
    </ol>
  `);

  // Closing
  sections.push(`
    <div class="closing">
      <p>UTribe looks forward to working with ${escape(project.partner_name)} to refine the proposed model and determine the most appropriate path from commercial alignment to implementation.</p>
      <p class="signature">Prepared by UTribe<br/>${new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })}</p>
    </div>
  `);

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<title>Commercial Proposal — ${escape(project.partner_name)}</title>
<style>
  @page { size: A4; margin: 22mm 20mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Segoe UI', Inter, -apple-system, sans-serif; color: #1a1a2e; line-height: 1.55; font-size: 11pt; }
  .doc-header { display: flex; gap: 14px; align-items: center; border-bottom: 3px solid #00843D; padding-bottom: 16px; margin-bottom: 22px; }
  .logo-mark { flex-shrink: 0; }
  .doc-title { font-size: 19pt; font-weight: 700; letter-spacing: 0.04em; color: #895CFE; }
  .doc-partner { font-size: 13pt; font-weight: 600; color: #1a1a2e; margin-top: 2px; }
  .doc-meta { font-size: 9pt; color: #6b7280; margin-top: 3px; }
  h2 { font-size: 13pt; font-weight: 700; color: #1a1a2e; margin-top: 26px; margin-bottom: 10px; border-bottom: 1px solid #e5e7eb; padding-bottom: 5px; }
  h3 { font-size: 11.5pt; font-weight: 600; color: #374151; margin-top: 16px; margin-bottom: 7px; }
  p { margin: 7px 0; }
  .non-binding { color: #6b7280; margin-top: 12px; }
  table { width: 100%; border-collapse: collapse; margin: 10px 0 16px; font-size: 10pt; }
  th, td { border: 1px solid #d1d5db; padding: 6px 9px; text-align: left; vertical-align: top; }
  th { background: #f3f4f6; font-weight: 600; }
  ul, ol { margin: 7px 0 7px 22px; }
  li { margin: 4px 0; }
  .tag { display: inline-block; font-size: 8.5pt; padding: 1px 6px; border-radius: 3px; font-weight: 600; margin-left: 4px; }
  .tag-c { background: #dcfce7; color: #15803d; }
  .tag-e { background: #fef3c7; color: #b45309; }
  .tag-p { background: #fee2e2; color: #b91c1c; }
  .closing { margin-top: 30px; border-top: 1px solid #e5e7eb; padding-top: 16px; }
  .signature { margin-top: 18px; color: #6b7280; font-size: 9.5pt; }
  .print-btn { position: fixed; top: 14px; right: 14px; background:#895CFE; color:#fff; border:none; padding:9px 16px; border-radius:8px; font-size:10pt; cursor:pointer; }
  @media print { .print-btn { display: none; } }
</style>
</head>
<body>
<button class="print-btn" onclick="window.print()">Print / Save PDF</button>
${sections.join('')}
</body>
</html>
  `;

  const maxVer = (db.prepare('SELECT COALESCE(MAX(version), 0) as v FROM proposal_versions WHERE proposal_id = ?').get(proposalId) as any).v;
  const version = Math.max(1, maxVer);

  return { html, version, generated_at: new Date().toISOString(), proposal_id: proposalId, blocked: false };
}

export default { generateProposalDocument };