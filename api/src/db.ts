import Database from 'better-sqlite3';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.PIPELINE_DB_PATH || path.join(__dirname, '..', '..', 'data', 'partnership-pipeline.db');

// Ensure data directory exists
import fs from 'node:fs';
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export function initializeDatabase(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS deals (
      id TEXT PRIMARY KEY,
      partner_name TEXT NOT NULL,
      sector TEXT,
      deal_stage TEXT,
      description TEXT,
      archetype TEXT NOT NULL CHECK(archetype IN ('I','II','III','IV','V','VI','VII')),
      is_repeat INTEGER NOT NULL DEFAULT 0,
      novelty_level INTEGER NOT NULL DEFAULT 1,
      revenue_potential INTEGER NOT NULL CHECK(revenue_potential BETWEEN 1 AND 3),
      strategic_fit INTEGER NOT NULL CHECK(strategic_fit BETWEEN 1 AND 3),
      effort_tier REAL NOT NULL,
      novelty_penalty INTEGER NOT NULL DEFAULT 1,
      priority_score REAL,
      queue_position INTEGER,
      current_stage INTEGER NOT NULL DEFAULT 1,
      blocking_factor TEXT,
      bd_owner TEXT,
      tech_owner TEXT,
      urgency TEXT,
      compliance_flags TEXT,
      triage_classification_corrected TEXT CHECK(triage_classification_corrected IN ('I','II','III','IV','V','VI','VII')),
      triage_novelty_flag TEXT,
      triage_response_at TEXT,
      triage_responded_by TEXT,
      is_archived INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS stage_transitions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      deal_id TEXT NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
      from_stage INTEGER,
      to_stage INTEGER NOT NULL,
      triggered_by TEXT,
      note TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS archetype_library (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      one_line_test TEXT NOT NULL,
      effort_tier REAL NOT NULL,
      description TEXT,
      standard_components TEXT,
      precedent_name TEXT,
      precedent_template TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_deals_queue ON deals(queue_position);
    CREATE INDEX IF NOT EXISTS idx_deals_archetype ON deals(archetype);
    CREATE INDEX IF NOT EXISTS idx_deals_stage ON deals(current_stage);
    CREATE INDEX IF NOT EXISTS idx_deals_archived ON deals(is_archived);
    CREATE INDEX IF NOT EXISTS idx_transitions_deal ON stage_transitions(deal_id);
  `);
}

/** CPO — Commercial Proposal Operating System tables */
export function initializeCPOTables(): void {
  db.exec(`
    -- GW-00 Claims Library --
    CREATE TABLE IF NOT EXISTS proposal_claims_library (
      id TEXT PRIMARY KEY,
      category TEXT NOT NULL,
      claim TEXT NOT NULL,
      evidence_url TEXT,
      jurisdiction TEXT DEFAULT 'Global',
      status TEXT NOT NULL DEFAULT 'Pending' CHECK(status IN ('Pending','Approved','Deprecated')),
      version TEXT DEFAULT '1.0',
      effective_date TEXT,
      review_date TEXT,
      owner TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    -- Proposal Projects --
    CREATE TABLE IF NOT EXISTS proposal_projects (
      id TEXT PRIMARY KEY,
      deal_id TEXT NOT NULL REFERENCES deals(id),
      pipedrive_deal_url TEXT,
      partner_name TEXT NOT NULL,
      partner_contact TEXT,
      country TEXT,
      vertical TEXT,
      owner TEXT,
      partnership_route TEXT CHECK(partnership_route IN ('Distribution Partnership','Connected Customer Journey','Embedded / Co-branded','Strategic Institutional Partnership','Other')),
      commercial_model TEXT CHECK(commercial_model IN ('A','B','C','D')),
      current_state TEXT NOT NULL DEFAULT 'not_eligible' CHECK(current_state IN ('not_eligible','intake','pre_flight','business_case','eligible','drafting','functional_review','revision_required','approval_ready','release_gate','approved_external','delivered','negotiation','superseded','withdrawn')),
      priority TEXT,
      expected_revenue REAL,
      expected_aum REAL,
      expected_volume REAL,
      target_close_date TEXT,
      executive_summary TEXT,
      partner_value TEXT,
      utribe_value TEXT,
      implementation_route TEXT,
      technical_dependencies TEXT,
      third_party_dependencies TEXT,
      product_dependencies TEXT,
      implementation_timing TEXT,
      contract_term TEXT,
      governance_cadence TEXT,
      escalation_route TEXT,
      is_archived INTEGER DEFAULT 0,
      external_released_at TEXT,
      external_release_version INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    -- Proposal Versions --
    CREATE TABLE IF NOT EXISTS proposal_versions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      proposal_id TEXT NOT NULL REFERENCES proposal_projects(id),
      version INTEGER NOT NULL,
      state_snapshot TEXT NOT NULL,
      created_by TEXT,
      is_release INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- Commercial Economics --
    CREATE TABLE IF NOT EXISTS proposal_economics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      proposal_id TEXT NOT NULL REFERENCES proposal_projects(id),
      gross_commercial_value REAL,
      gross_confidence TEXT CHECK(gross_confidence IN ('C','E','P')),
      operating_cost REAL,
      operating_cost_confidence TEXT CHECK(operating_cost_confidence IN ('C','E','P')),
      residual_pool REAL,
      partner_allocation REAL,
      partner_allocation_pct REAL,
      utribe_allocation REAL,
      utribe_allocation_pct REAL,
      effective_partner_pct REAL,
      effective_utribe_pct REAL,
      partner_effective_economics REAL,
      utribe_effective_economics REAL,
      base_gross REAL,
      base_operating_cost REAL,
      downside_gross REAL,
      downside_operating_cost REAL,
      upside_gross REAL,
      upside_operating_cost REAL,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    -- Assumptions Register --
    CREATE TABLE IF NOT EXISTS proposal_assumptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      proposal_id TEXT NOT NULL REFERENCES proposal_projects(id),
      category TEXT CHECK(category IN ('Commercial','Customer/Volume','Product','Technology','Compliance/Legal','Partner')),
      description TEXT NOT NULL,
      confidence TEXT CHECK(confidence IN ('C','E','P')),
      owner TEXT,
      evidence TEXT,
      impact TEXT,
      status TEXT DEFAULT 'open' CHECK(status IN ('open','resolved','superseded')),
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- Proposal-to-Claims mapping --
    CREATE TABLE IF NOT EXISTS proposal_claims (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      proposal_id TEXT NOT NULL REFERENCES proposal_projects(id),
      claim_id TEXT NOT NULL REFERENCES proposal_claims_library(id),
      section TEXT,
      custom_wording TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- Approvals Matrix --
    CREATE TABLE IF NOT EXISTS proposal_approvals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      proposal_id TEXT NOT NULL REFERENCES proposal_projects(id),
      function_area TEXT CHECK(function_area IN ('BD','Finance_Model','Finance_Economics','Finance_Fees','Product_Scope','Product_Capability','Technology_Implementation','Operations','Legal_Claims','Legal_Regulatory','Legal_Risk','Marketing_Template','Marketing_Claims')),
      reviewer_name TEXT,
      status TEXT DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected','clarification')),
      decision TEXT,
      evidence_url TEXT,
      reviewed_at TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- Risk & Control Matrix --
    CREATE TABLE IF NOT EXISTS proposal_risks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      proposal_id TEXT NOT NULL REFERENCES proposal_projects(id),
      risk_type TEXT CHECK(risk_type IN ('Regulatory','Economics','Integration','Settlement','KYC/AML','Transaction Monitoring','Customer Communication','Complaints','Data Privacy','Cybersecurity','Reconciliation','Claims/Disclosures')),
      owner TEXT,
      severity TEXT CHECK(severity IN ('Low','Medium','High','Critical')),
      mitigation TEXT,
      status TEXT DEFAULT 'open' CHECK(status IN ('open','closed','mitigated')),
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- Responsibilities (roles §2.4/2.5 + risk & control §7.5) --
    CREATE TABLE IF NOT EXISTS proposal_responsibilities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      proposal_id TEXT NOT NULL REFERENCES proposal_projects(id),
      party TEXT NOT NULL CHECK(party IN ('UTribe','Partner','Joint','NA')),
      domain TEXT,
      description TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- Commercial & Partnership Terms (§9) --
    CREATE TABLE IF NOT EXISTS proposal_terms (
      proposal_id TEXT PRIMARY KEY REFERENCES proposal_projects(id),
      commercial_review TEXT,
      review_data_required TEXT,
      review_reconsideration TEXT,
      review_approval_process TEXT,
      recon_cadence TEXT,
      payment_cadence TEXT,
      dispute_window TEXT,
      settlement_mechanism TEXT,
      pilot_required INTEGER DEFAULT 0,
      pilot_target_segment TEXT,
      pilot_duration TEXT,
      pilot_scope TEXT,
      pilot_success_measures TEXT,
      pilot_decision_gate TEXT,
      pilot_expansion_criteria TEXT,
      exclusivity_requested INTEGER DEFAULT 0,
      excl_scope TEXT,
      excl_geography TEXT,
      excl_product TEXT,
      excl_customer_segment TEXT,
      excl_duration TEXT,
      excl_performance_conditions TEXT,
      excl_conflict_check TEXT,
      updated_at TEXT DEFAULT (datetime('now'))
    );

    -- Success Metrics (§9.4) --
    CREATE TABLE IF NOT EXISTS proposal_success_metrics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      proposal_id TEXT NOT NULL REFERENCES proposal_projects(id),
      metric TEXT NOT NULL,
      measurement_basis TEXT,
      target TEXT,
      linked_model TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- Discussion Points --
    CREATE TABLE IF NOT EXISTS proposal_discussion_points (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      proposal_id TEXT NOT NULL REFERENCES proposal_projects(id),
      category TEXT CHECK(category IN ('Commercial','Product/Customer Journey','Technology','Operations','Legal/Compliance','Strategic Roadmap')),
      question TEXT NOT NULL,
      owner TEXT,
      due_date TEXT,
      status TEXT DEFAULT 'open' CHECK(status IN ('open','resolved','deferred')),
      resolution TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- Conditional Modules --
    CREATE TABLE IF NOT EXISTS proposal_conditional_modules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      proposal_id TEXT NOT NULL REFERENCES proposal_projects(id),
      module_type TEXT CHECK(module_type IN ('extended_fees','integration_economics','growth_incentives','pilot','exclusivity')),
      is_active INTEGER DEFAULT 0,
      config TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    -- Extended Fees --
    CREATE TABLE IF NOT EXISTS proposal_extended_fees (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      proposal_id TEXT NOT NULL REFERENCES proposal_projects(id),
      fee_name TEXT NOT NULL,
      category TEXT CHECK(category IN ('Transaction-led','Relationship/retention-led','Operational/cost recovery')),
      basis TEXT,
      confidence TEXT CHECK(confidence IN ('C','E','P')),
      approval_status TEXT DEFAULT 'pending',
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- Growth Tiers --
    CREATE TABLE IF NOT EXISTS proposal_growth_tiers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      proposal_id TEXT NOT NULL REFERENCES proposal_projects(id),
      tier_name TEXT NOT NULL,
      measurement_threshold REAL,
      partner_economics TEXT,
      effective_date TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- Pre-Flight Checklist --
    CREATE TABLE IF NOT EXISTS proposal_preflight (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      proposal_id TEXT NOT NULL REFERENCES proposal_projects(id),
      check_item TEXT NOT NULL,
      category TEXT CHECK(category IN ('Qualification','Stakeholders','Functional','Commercial')),
      is_checked INTEGER DEFAULT 0,
      checked_by TEXT,
      checked_at TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- Audit Trail --
    CREATE TABLE IF NOT EXISTS proposal_audit_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      proposal_id TEXT NOT NULL REFERENCES proposal_projects(id),
      event_type TEXT NOT NULL,
      actor TEXT,
      description TEXT NOT NULL,
      metadata TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- Indexes --
    CREATE INDEX IF NOT EXISTS idx_proposal_deal ON proposal_projects(deal_id);
    CREATE INDEX IF NOT EXISTS idx_proposal_state ON proposal_projects(current_state);
    CREATE INDEX IF NOT EXISTS idx_proposal_versions_proposal ON proposal_versions(proposal_id);
    CREATE INDEX IF NOT EXISTS idx_proposal_approvals_proposal ON proposal_approvals(proposal_id);
    CREATE INDEX IF NOT EXISTS idx_proposal_assumptions_proposal ON proposal_assumptions(proposal_id);
    CREATE INDEX IF NOT EXISTS idx_proposal_audit_proposal ON proposal_audit_events(proposal_id);
    CREATE INDEX IF NOT EXISTS idx_proposal_claims_proposal ON proposal_claims(proposal_id);
    CREATE INDEX IF NOT EXISTS idx_claims_status ON proposal_claims_library(status);
  `);

  // ── Migration: add new columns to existing tables ──
  const migrations: [string, string, string][] = [
    ['proposal_projects', 'source', "TEXT NOT NULL DEFAULT 'manual' CHECK(source IN ('manual','pipedrive','bd_tracker'))"],
    ['proposal_projects', 'bd_tracker_deal_ref', 'TEXT'],
    ['proposal_projects', 'pipedrive_deal_id', 'TEXT'],
  ];
  for (const [table, column, def] of migrations) {
    const cols = db.prepare(`PRAGMA table_info(${table})`).all() as any[];
    if (!cols.some((c: any) => c.name === column)) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${def}`);
    }
  }

  // ── BD Prospecting Targets Table ──
  db.exec(`
    CREATE TABLE IF NOT EXISTS bd_prospecting_targets (
      id TEXT PRIMARY KEY,
      firm_name TEXT NOT NULL,
      tier INTEGER NOT NULL DEFAULT 2 CHECK(tier IN (1, 2)),
      category TEXT NOT NULL DEFAULT 'Screening Queue'
        CHECK(category IN ('Category A','Category B','Category C','Hold','Screening Queue')),
      why_this_fits TEXT,
      contact_email TEXT,
      notes TEXT,
      status INTEGER NOT NULL DEFAULT 1 CHECK(status BETWEEN 1 AND 10),
      special_flags TEXT,
      auto_promoted INTEGER NOT NULL DEFAULT 0,
      deal_id TEXT,
      proposal_id TEXT,
      bd_owner TEXT,
      last_contacted_at TEXT,
      next_action TEXT,
      is_archived INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_bdp_tier ON bd_prospecting_targets(tier);
    CREATE INDEX IF NOT EXISTS idx_bdp_status ON bd_prospecting_targets(status);
    CREATE INDEX IF NOT EXISTS idx_bdp_category ON bd_prospecting_targets(category);
  `);

  // ── Migration: add Legal_Commercial to the approvals CHECK constraint ──
  // SQLite cannot ALTER a CHECK constraint — rebuild the table when needed.
  const approvalsSql = (db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='proposal_approvals'").get() as any)?.sql || '';
  if (approvalsSql && !approvalsSql.includes('Legal_Commercial')) {
    db.exec(`
      PRAGMA foreign_keys = OFF;
      BEGIN;
      ALTER TABLE proposal_approvals RENAME TO proposal_approvals_old;
      CREATE TABLE proposal_approvals (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        proposal_id TEXT NOT NULL REFERENCES proposal_projects(id),
        function_area TEXT CHECK(function_area IN ('BD','Finance_Model','Finance_Economics','Finance_Fees','Product_Scope','Product_Capability','Technology_Implementation','Operations','Legal_Claims','Legal_Regulatory','Legal_Risk','Legal_Commercial','Marketing_Template','Marketing_Claims')),
        reviewer_name TEXT,
        status TEXT DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected','clarification')),
        decision TEXT,
        evidence_url TEXT,
        reviewed_at TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      );
      INSERT INTO proposal_approvals (id, proposal_id, function_area, reviewer_name, status, decision, evidence_url, reviewed_at, created_at)
        SELECT id, proposal_id, function_area, reviewer_name, status, decision, evidence_url, reviewed_at, created_at FROM proposal_approvals_old;
      DROP TABLE proposal_approvals_old;
      INSERT OR IGNORE INTO proposal_approvals (proposal_id, function_area) SELECT id, 'Legal_Commercial' FROM proposal_projects;
      COMMIT;
      PRAGMA foreign_keys = ON;
    `);
  }
}

export default db;