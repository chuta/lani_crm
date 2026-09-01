/**
 * DOCX Export — generates a proper Word .docx from CPO proposal data.
 * Mirrors document-generator.ts but outputs Word format for client-side editing.
 */

import db from '../db.js';
import { runReleaseGate } from '../routes/release.js';

import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  HeadingLevel, AlignmentType, WidthType, BorderStyle,
  type ITableOptions, type ITableCellOptions, type ITableRowOptions,
} from 'docx';

/* ─── Helpers ─── */
function currency(v: any): string {
  if (v === null || v === undefined) return '—';
  return '$' + Number(v).toLocaleString('en-US', { maximumFractionDigits: 2 });
}

const esc = (v: any): string => String(v ?? '');

/* ─── Table helpers ─── */
function cell(text: string, cellOpts?: { bold?: boolean }): TableCell {
  return new TableCell({
    children: [new Paragraph({ children: [new TextRun({ text, size: 20, bold: cellOpts?.bold })], spacing: { after: 40 } })],
  });
}

function headerCell(text: string): TableCell {
  return new TableCell({
    children: [new Paragraph({ children: [new TextRun({ text, size: 20, bold: true })], spacing: { after: 40 } })],
    shading: { fill: 'F3F4F6', type: 'clear', color: 'auto' },
  });
}

function row(cells: TableCell[], opts?: Partial<ITableRowOptions>): TableRow {
  return new TableRow({ children: cells, ...opts });
}

/* ─── Section helpers ─── */
function heading(text: string, level: number = 1): Paragraph {
  const sizes: Record<number, number> = { 1: 28, 2: 24, 3: 20 };
  return new Paragraph({
    children: [new TextRun({ text, bold: true, size: sizes[level] || 20, color: level === 1 ? '1A1A2E' : '374151' })],
    spacing: { before: level === 1 ? 400 : 280, after: 120 },
    ...(level === 1 ? { border: { bottom: { color: '895CFE', size: 6, style: BorderStyle.SINGLE, space: 4 } } } : {}),
  });
}

function para(text: string, opts?: { bold?: boolean; italic?: boolean; color?: string; size?: number }): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text, size: opts?.size || 20, bold: opts?.bold, italics: opts?.italic, color: opts?.color })],
    spacing: { after: 100 },
  });
}

function bullet(text: string): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text, size: 20 })],
    bullet: { level: 0 },
    spacing: { after: 60 },
  });
}

function numbered(text: string, num: number): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text: `${num}. ${text}`, size: 20 })],
    spacing: { after: 60 },
  });
}

/* ─── Generate DOCX ─── */
export async function generateProposalDocx(proposalId: string): Promise<{
  buffer?: Buffer;
  filename: string;
  blocked: boolean;
  blockers?: { name: string; detail: string }[];
}> {
  const project = db.prepare('SELECT * FROM proposal_projects WHERE id = ?').get(proposalId) as any;
  if (!project) {
    return { filename: 'proposal.docx', blocked: true, blockers: [{ name: 'Proposal Exists', detail: 'Proposal not found' }] };
  }

  // HARD GATE: must pass release gate before external doc can be generated
  const gate = runReleaseGate(proposalId);
  if (!gate.passed) {
    const blockers = gate.checks.filter((c: any) => !c.passed).map((c: any) => ({ name: c.name, detail: c.detail }));
    return { filename: 'proposal.docx', blocked: true, blockers };
  }

  const economics = db.prepare('SELECT * FROM proposal_economics WHERE proposal_id = ?').get(proposalId) as any;
  const claims = db.prepare(`
    SELECT pcl.* FROM proposal_claims pc
    JOIN proposal_claims_library pcl ON pc.claim_id = pcl.id
    WHERE pc.proposal_id = ? AND pcl.status = 'Approved'
  `).all(proposalId) as any[];
  const responsibilities = db.prepare('SELECT * FROM proposal_responsibilities WHERE proposal_id = ? ORDER BY id').all(proposalId) as any[];
  const terms = db.prepare('SELECT * FROM proposal_terms WHERE proposal_id = ?').get(proposalId) as any;
  const metrics = db.prepare('SELECT * FROM proposal_success_metrics WHERE proposal_id = ? ORDER BY id').all(proposalId) as any[];
  const assumptions = db.prepare(`
    SELECT * FROM proposal_assumptions
    WHERE proposal_id = ? AND confidence != 'P' ORDER BY category
  `).all(proposalId) as any[];
  const discussionPoints = db.prepare('SELECT * FROM proposal_discussion_points WHERE proposal_id = ?').all(proposalId) as any[];
  const modules = db.prepare('SELECT * FROM proposal_conditional_modules WHERE proposal_id = ? AND is_active = 1').all(proposalId) as any[];
  const fees = db.prepare('SELECT * FROM proposal_extended_fees WHERE proposal_id = ?').all(proposalId) as any[];
  const tiers = db.prepare('SELECT * FROM proposal_growth_tiers WHERE proposal_id = ?').all(proposalId) as any[];
  const activeModuleTypes = new Set(modules.map((m: any) => m.module_type));

  const modelMap: Record<string, string> = {
    A: 'Volume / Transaction-Led',
    B: 'AUM / Recurring Relationship-Led',
    C: 'Referral / Outcome-Led',
    D: 'Custom / Strategic',
  };
  const modelName = modelMap[project.commercial_model] || '—';
  const children: (Paragraph | Table)[] = [];

  // ─── Title ───
  const releaseVersion = (project.external_release_version || 0) + 1;
  children.push(
    new Paragraph({
      children: [
        new TextRun({ text: 'COMMERCIAL PROPOSAL', bold: true, size: 36, color: '895CFE' }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { after: 60 },
    }),
    new Paragraph({
      children: [new TextRun({ text: `Prepared for ${esc(project.partner_name)}`, size: 24, bold: true })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 40 },
    }),
    new Paragraph({
      children: [new TextRun({ text: `UTribe · Proposal Ref: ${esc(project.id)} · v${releaseVersion}`, size: 18, color: '6B7280' })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
    }),
  );

  // ─── 1. Executive Summary ───
  children.push(heading('1. Executive Summary'));
  children.push(heading('1.1 Partnership Context', 3));
  children.push(para(esc(project.executive_summary || 'Proposal under development.')));
  if (project.country) children.push(para(`Jurisdiction: ${esc(project.country)}`, { bold: true }));
  if (project.vertical) children.push(para(`Vertical: ${esc(project.vertical)}`, { bold: true }));
  children.push(
    para('This document is non-binding and intended solely as a basis for commercial discussions prior to execution of definitive agreements. All commercial terms are subject to final due diligence, internal approvals from both parties, and definitive agreements.', { italic: true, color: '6B7280', size: 18 }),
  );

  // ─── 2. Partnership Scope ───
  children.push(heading('2. Partnership Scope'));
  children.push(para(`Proposed partnership route: ${esc(project.partnership_route || '—')}`, { bold: true }));
  const scopeText = project.partnership_route === 'Embedded / Co-branded'
    ? 'This partnership is structured as an embedded, co-branded route, with integration and onboarding responsibilities shared across both parties.'
    : 'This partnership follows a defined route with responsibilities aligned to the selected collaboration model.';
  children.push(para(scopeText));

  // 2.4 / 2.5 Roles & Responsibilities
  const roleGroupsD: { title: string; items: any[] }[] = [
    { title: 'UTribe Responsibilities', items: responsibilities.filter((r: any) => r.party === 'UTribe' && !r.domain) },
    { title: `${esc(project.partner_name)} Responsibilities`, items: responsibilities.filter((r: any) => r.party === 'Partner' && !r.domain) },
    { title: 'Joint Responsibilities', items: responsibilities.filter((r: any) => r.party === 'Joint' && !r.domain) },
  ];
  const nonEmptyRoleGroups = roleGroupsD.filter(g => g.items.length > 0);
  if (nonEmptyRoleGroups.length > 0) {
    children.push(heading('2.4 Roles and Responsibilities', 2));
    for (const g of nonEmptyRoleGroups) {
      children.push(heading(g.title, 3));
      for (const r of g.items) {
        children.push(bullet(esc(r.description)));
      }
    }
  }

  // ─── 3. Commercial Model ───
  children.push(heading('3. Commercial Model'));
  children.push(para(`Selected classification: Model ${esc(project.commercial_model)} — ${esc(modelName)}`));
  children.push(para('The economics of this proposal are structured around the value created by the partnership under the selected model.'));

  // ─── 4. Commercial Framework ───
  if (economics) {
    children.push(heading('4. Commercial Framework'));
    children.push(
      new Table({
        rows: [
          row([headerCell('Economic layer'), headerCell('Proposed basis'), headerCell('Confidence')]),
          row([cell('Gross commercial value'), cell(currency(economics.gross_commercial_value)), cell(economics.gross_confidence ? `[${economics.gross_confidence}]` : '—')]),
          row([cell('Operating / delivery cost'), cell(currency(economics.operating_cost)), cell(economics.operating_cost_confidence ? `[${economics.operating_cost_confidence}]` : '—')]),
          row([cell('Residual commercial pool'), cell(currency(economics.residual_pool)), cell('—')]),
          row([cell('Partner allocation'), cell(`${currency(economics.partner_allocation)} (${economics.partner_allocation_pct ?? '—'}%)`), cell('—')]),
          row([cell('UTribe allocation'), cell(`${currency(economics.utribe_allocation)} (${economics.utribe_allocation_pct ?? '—'}%)`), cell('—')]),
        ],
      }),
    );
    children.push(heading('4.1 Effective Economics', 3));
    children.push(
      new Table({
        rows: [
          row([headerCell('Party'), headerCell('Share of residual'), headerCell('Effective economics (vs gross base)')]),
          row([cell('Partner'), cell(`${economics.partner_allocation_pct ?? '—'}%`), cell(`${economics.effective_partner_pct ?? '—'}% (${currency(economics.partner_effective_economics)})`)]),
          row([cell('UTribe'), cell(`${economics.utribe_allocation_pct ?? '—'}%`), cell(`${economics.effective_utribe_pct ?? '—'}% (${currency(economics.utribe_effective_economics)})`)]),
        ],
      }),
    );
  }

  // ─── 5. Conditional Modules ───
  if (activeModuleTypes.size > 0) {
    children.push(heading('5. Conditional Commercial Modules'));

    if (activeModuleTypes.has('extended_fees') && fees.length > 0) {
      children.push(heading('5.1 Extended Fee Structure', 3));
      children.push(
        new Table({
          rows: [
            row([headerCell('Fee / mechanism'), headerCell('Category'), headerCell('Basis'), headerCell('Confidence')]),
            ...fees.map((f: any) => row([
              cell(esc(f.fee_name)),
              cell(esc(f.category)),
              cell(esc(f.basis || '—')),
              cell(f.confidence ? `[${f.confidence}]` : '—'),
            ])),
          ],
        }),
      );
    }
    if (activeModuleTypes.has('growth_incentives') && tiers.length > 0) {
      children.push(heading('5.2 Tiered Growth Incentives', 3));
      children.push(
        new Table({
          rows: [
            row([headerCell('Tier'), headerCell('Measurement threshold'), headerCell('Partner economics'), headerCell('Effective date')]),
            ...tiers.map((t: any) => row([
              cell(esc(t.tier_name)),
              cell(currency(t.measurement_threshold)),
              cell(esc(t.partner_economics || '—')),
              cell(esc(t.effective_date || '—')),
            ])),
          ],
        }),
      );
    }
    if (activeModuleTypes.has('pilot')) {
      children.push(heading('5.3 Pilot Phase', 3));
      children.push(para('A pilot phase is proposed with defined success measures and an expansion decision gate.'));
    }
    if (activeModuleTypes.has('exclusivity')) {
      children.push(heading('5.4 Exclusivity', 3));
      children.push(para('Exclusivity terms, if applicable, are defined by scope, geography, product, customer segment, duration, and performance conditions, subject to mutual agreement.'));
    }
  }

  // ─── 6. Strategic Value ───
  children.push(heading('6. Strategic Value'));
  children.push(heading(`6.1 Value to ${esc(project.partner_name)}`, 3));
  children.push(para(esc(project.partner_value || 'Proposed value to be finalised.')));
  children.push(heading('6.2 Value to UTribe', 3));
  children.push(para(esc(project.utribe_value || 'Proposed value to be finalised.')));

  // ─── 7. Implementation & Governance ───
  children.push(heading('7. Implementation & Governance'));
  const implRows: [string, string][] = [
    ['Implementation route', project.implementation_route],
    ['Technical dependencies', project.technical_dependencies],
    ['Third-party dependencies', project.third_party_dependencies],
    ['Product dependencies', project.product_dependencies],
    ['Estimated timing', project.implementation_timing],
    ['Governance cadence', project.governance_cadence],
    ['Escalation route', project.escalation_route],
  ];
  children.push(
    new Table({
      rows: [
        row([headerCell('Area'), headerCell('Details')]),
        ...implRows.map(([k, v]) => row([cell(k, { bold: true }), cell(esc(v || '—'))])),
      ],
    }),
  );

  // 7.2 Reporting & Transparency
  children.push(heading('7.2 Reporting and Transparency', 3));
  children.push(para('The parties will define a reporting framework covering, where relevant: commercial performance, transaction activity, customer activity, operational exceptions, reconciliation, agreed compliance information and service performance. Exact reporting obligations will be defined during implementation and reflected in definitive agreements.'));

  // 7.3 Compliance Alignment
  children.push(heading('7.3 Compliance Alignment', 3));
  children.push(para('The proposed partnership remains subject to applicable KYC / AML obligations, jurisdiction-specific regulatory requirements, agreed risk disclosure, customer suitability requirements where applicable, transaction monitoring responsibilities, data and privacy obligations, and applicable $GIFT claims and disclosures under the Approved Claims & Evidence Register.'));

  // 7.5 Risk and Control Responsibilities
  const controlRows = responsibilities.filter((r: any) => r.domain);
  if (controlRows.length > 0) {
    children.push(heading('7.5 Risk and Control Responsibilities', 3));
    children.push(
      new Table({
        rows: [
          row([headerCell('Control domain'), headerCell('Responsible party'), headerCell('Responsibility')]),
          ...controlRows.map((r: any) => row([cell(esc(r.domain)), cell(esc(r.party)), cell(esc(r.description))])),
        ],
      }),
    );
  }

  // ─── 8. Key Assumptions ───
  if (assumptions.length > 0) {
    children.push(heading('8. Key Assumptions'));
    const byCategory: Record<string, any[]> = {};
    for (const a of assumptions) {
      (byCategory[a.category] = byCategory[a.category] || []).push(a);
    }
    for (const [cat, items] of Object.entries(byCategory)) {
      children.push(heading(cat, 3));
      for (const a of items) {
        children.push(bullet(`${esc(a.description)} [${a.confidence}]`));
      }
    }
  }

  // ─── 9. Commercial Terms (full §9) ───
  children.push(heading('9. Commercial and Partnership Terms'));
  const termRows: [string, string][] = [
    ['Proposed term', terms?.contract_term || project.contract_term || '—'],
    ['Review cadence', terms?.commercial_review || '—'],
    ['Payment cadence', terms?.payment_cadence || '—'],
    ['Reconciliation cadence', terms?.recon_cadence || '—'],
    ['Dispute window', terms?.dispute_window || '—'],
    ['Settlement mechanism', terms?.settlement_mechanism || '—'],
  ];
  children.push(
    new Table({
      rows: [
        row([headerCell('Term'), headerCell('Details')]),
        ...termRows.map(([k, v]) => row([cell(k, { bold: true }), cell(esc(v || '—'))])),
      ],
    }),
  );
  children.push(para('Confidentiality will be maintained over commercial, operational, customer and technical information, subject to definitive agreement.', { italic: true, size: 18 }));

  // 9.2 Commercial Review detail
  if (terms?.review_data_required || terms?.review_reconsideration || terms?.review_approval_process) {
    children.push(heading('9.2 Commercial Review', 3));
    if (terms?.review_data_required) children.push(bullet(`Performance data required: ${esc(terms.review_data_required)}`));
    if (terms?.review_reconsideration) children.push(bullet(`Circumstances for reconsideration: ${esc(terms.review_reconsideration)}`));
    if (terms?.review_approval_process) children.push(bullet(`Approval process for changes: ${esc(terms.review_approval_process)}`));
  }

  // 9.4 Success Metrics
  if (metrics.length > 0) {
    children.push(heading('9.4 Success Metrics', 3));
    children.push(
      new Table({
        rows: [
          row([headerCell('Metric'), headerCell('Measurement basis'), headerCell('Target'), headerCell('Linked model')]),
          ...metrics.map((m: any) => row([cell(esc(m.metric)), cell(esc(m.measurement_basis || '—')), cell(esc(m.target || '—')), cell(esc(m.linked_model || '—'))])),
        ],
      }),
    );
  }

  // 9.3 Pilot Phase
  if (activeModuleTypes.has('pilot') && terms?.pilot_duration) {
    children.push(heading('9.3 Pilot Phase', 3));
    const pilotRows: [string, string][] = [
      ['Target segment', terms.pilot_target_segment],
      ['Duration', terms.pilot_duration],
      ['Scope', terms.pilot_scope],
      ['Success measures', terms.pilot_success_measures],
      ['Decision gate', terms.pilot_decision_gate],
      ['Expansion criteria', terms.pilot_expansion_criteria],
    ].filter(([, v]) => v) as [string, string][];
    children.push(
      new Table({
        rows: [
          row([headerCell('Item'), headerCell('Details')]),
          ...pilotRows.map(([k, v]) => row([cell(k, { bold: true }), cell(esc(v))])),
        ],
      }),
    );
  }

  // 9.7 Exclusivity
  if (activeModuleTypes.has('exclusivity') && terms?.excl_scope) {
    children.push(heading('9.7 Exclusivity', 3));
    const exclRows: [string, string][] = [
      ['Scope', terms.excl_scope],
      ['Geography', terms.excl_geography],
      ['Product', terms.excl_product],
      ['Customer segment', terms.excl_customer_segment],
      ['Duration', terms.excl_duration],
      ['Performance conditions', terms.excl_performance_conditions],
      ['Conflict check', terms.excl_conflict_check],
    ].filter(([, v]) => v) as [string, string][];
    children.push(
      new Table({
        rows: [
          row([headerCell('Item'), headerCell('Details')]),
          ...exclRows.map(([k, v]) => row([cell(k, { bold: true }), cell(esc(v))])),
        ],
      }),
    );
  }

  // ─── 10. Approved Claims ───
  if (claims.length > 0) {
    children.push(heading('10. Product and Assurance Statements'));
    for (const c of claims) {
      children.push(bullet(esc(c.claim)));
    }
  }

  // ─── 11. Discussion Points ───
  const openDPs = discussionPoints.filter((d: any) => d.status !== 'resolved');
  if (openDPs.length > 0) {
    children.push(heading('11. Discussion Points'));
    for (const d of openDPs) {
      children.push(bullet(`${esc(d.category)}: ${esc(d.question)}`));
    }
  }

  // ─── 12. Next Steps ───
  children.push(heading('12. Proposed Next Steps'));
  const steps = [
    'Commercial alignment — confirm the proposed economic model and outstanding assumptions.',
    'Scope confirmation — confirm the initial partnership, customer and operating scope.',
    'Functional validation — close Product, Technology, Finance, Operations, Legal and Compliance dependencies.',
    'Implementation planning — agree implementation requirements, owners, milestones and success measures.',
    'Definitive agreements — translate the agreed commercial and operating model into the appropriate contractual documentation.',
  ];
  steps.forEach((s, i) => children.push(numbered(s, i + 1)));

  // ─── Closing ───
  children.push(
    new Paragraph({ spacing: { before: 400 }, children: [] }),
    para(`UTribe looks forward to working with ${esc(project.partner_name)} to refine the proposed model and determine the most appropriate path from commercial alignment to implementation.`),
    new Paragraph({
      children: [new TextRun({
        text: `Prepared by UTribe · ${new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })}`,
        size: 18, color: '6B7280',
      })],
      spacing: { before: 200 },
    }),
  );

  // ─── Build document ───
  const doc = new Document({
    styles: {
      default: {
        document: {
          run: { font: 'Calibri', size: 22, color: '1A1A2E' },
          paragraph: { spacing: { after: 80 } },
        },
      },
    },
    sections: [{
      properties: {
        page: {
          margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 }, // 1 inch
        },
      },
      children,
    }],
  });

  const buffer = await Packer.toBuffer(doc);

  return {
    buffer: Buffer.from(buffer),
    filename: `proposal-${esc(project.id)}.docx`,
    blocked: false,
  };
}

export default { generateProposalDocx };