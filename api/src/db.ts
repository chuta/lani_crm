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

function tableSql(name: string): string {
  const row = db.prepare(`SELECT sql FROM sqlite_master WHERE type='table' AND name=?`).get(name) as { sql?: string } | undefined;
  return row?.sql || '';
}

/** Wipe the $GIFT integration book so local SQLite starts as a clean LANI commercial file. */
function resetGiftBookIfNeeded(): void {
  const dealsSql = tableSql('deals');
  const librarySql = tableSql('archetype_library');
  if (!dealsSql && !librarySql) return;

  const giftDeals = dealsSql.includes("'I','II'") || dealsSql.includes("'I', 'II'");
  const giftLibrary = librarySql.includes('effort_tier') || librarySql.includes('precedent_template');
  const missingLaniCols = dealsSql && (!dealsSql.includes('geography') || !dealsSql.includes('partnership_role'));
  const giftRows = librarySql
    ? db.prepare(`SELECT 1 FROM archetype_library WHERE id IN ('I','II','III') LIMIT 1`).get()
    : null;

  if (!giftDeals && !giftLibrary && !missingLaniCols && !giftRows) return;

  console.log('[db] Wiping $GIFT SQLite book and recreating a clean LANI commercial file');
  db.exec(`
    PRAGMA foreign_keys = OFF;
    DROP TABLE IF EXISTS proposal_audit_events;
    DROP TABLE IF EXISTS proposal_preflight;
    DROP TABLE IF EXISTS proposal_growth_tiers;
    DROP TABLE IF EXISTS proposal_extended_fees;
    DROP TABLE IF EXISTS proposal_conditional_modules;
    DROP TABLE IF EXISTS proposal_discussion_points;
    DROP TABLE IF EXISTS proposal_success_metrics;
    DROP TABLE IF EXISTS proposal_terms;
    DROP TABLE IF EXISTS proposal_responsibilities;
    DROP TABLE IF EXISTS proposal_risks;
    DROP TABLE IF EXISTS proposal_approvals;
    DROP TABLE IF EXISTS proposal_claims;
    DROP TABLE IF EXISTS proposal_assumptions;
    DROP TABLE IF EXISTS proposal_economics;
    DROP TABLE IF EXISTS proposal_versions;
    DROP TABLE IF EXISTS proposal_projects;
    DROP TABLE IF EXISTS proposal_claims_library;
    DROP TABLE IF EXISTS bd_prospecting_targets;
    DROP TABLE IF EXISTS stage_transitions;
    DROP TABLE IF EXISTS deals;
    DROP TABLE IF EXISTS archetype_library;
    PRAGMA foreign_keys = ON;
  `);
}

export function initializeDatabase(): void {
  resetGiftBookIfNeeded();
  db.exec(`
    CREATE TABLE IF NOT EXISTS deals (
      id TEXT PRIMARY KEY,
      partner_name TEXT NOT NULL,
      sector TEXT,
      partnership_role TEXT NOT NULL DEFAULT 'end_client'
        CHECK(partnership_role IN ('end_client','channel','delivery','institutional','ecosystem')),
      geography TEXT NOT NULL DEFAULT 'NG'
        CHECK(geography IN ('NG','ECOWAS','GLOBAL')),
      deal_stage TEXT,
      description TEXT,
      archetype TEXT NOT NULL CHECK(archetype IN ('A','B','C','D','E','F')),
      is_repeat INTEGER NOT NULL DEFAULT 0,
      novelty_level INTEGER NOT NULL DEFAULT 1,
      revenue_potential INTEGER NOT NULL CHECK(revenue_potential BETWEEN 1 AND 3),
      strategic_fit INTEGER NOT NULL CHECK(strategic_fit BETWEEN 1 AND 3),
      effort_tier REAL NOT NULL DEFAULT 1,
      novelty_penalty INTEGER NOT NULL DEFAULT 1,
      priority_score REAL,
      queue_position INTEGER,
      current_stage INTEGER NOT NULL DEFAULT 1,
      blocking_factor TEXT,
      bd_owner TEXT,
      tech_owner TEXT,
      urgency TEXT,
      compliance_flags TEXT,
      triage_classification_corrected TEXT,
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
      typical_organisations TEXT NOT NULL DEFAULT '[]',
      problems TEXT NOT NULL DEFAULT '[]',
      lani_opportunity TEXT NOT NULL DEFAULT '[]',
      entry_point TEXT,
      commercial_trigger TEXT,
      description TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_deals_queue ON deals(queue_position);
    CREATE INDEX IF NOT EXISTS idx_deals_archetype ON deals(archetype);
    CREATE INDEX IF NOT EXISTS idx_deals_stage ON deals(current_stage);
    CREATE INDEX IF NOT EXISTS idx_deals_archived ON deals(is_archived);
    CREATE INDEX IF NOT EXISTS idx_deals_geography ON deals(geography);
    CREATE INDEX IF NOT EXISTS idx_transitions_deal ON stage_transitions(deal_id);
  `);
  ensureAccountsSchema();
  ensureDigestSchema();
}

function columnExists(table: string, column: string): boolean {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  return cols.some((c) => c.name === column);
}

export function ensureAccountsSchema(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS accounts (
      id TEXT PRIMARY KEY,
      organisation TEXT NOT NULL,
      archetype TEXT NOT NULL CHECK(archetype IN ('A','B','C','D','E','F')),
      sector TEXT,
      partnership_role TEXT NOT NULL DEFAULT 'end_client'
        CHECK(partnership_role IN ('end_client','channel','delivery','institutional','ecosystem')),
      geography TEXT NOT NULL DEFAULT 'NG'
        CHECK(geography IN ('NG','ECOWAS','GLOBAL')),
      lane TEXT NOT NULL DEFAULT 'immediate'
        CHECK(lane IN ('immediate','strategic','channel','emerging')),
      current_stage INTEGER NOT NULL DEFAULT 1 CHECK(current_stage BETWEEN 1 AND 8),
      decision_maker TEXT,
      contact_email TEXT,
      relationship_owner TEXT,
      strategic_problem TEXT,
      trigger_event TEXT,
      lani_capability TEXT,
      potential_partners TEXT,
      estimated_value REAL,
      probability INTEGER CHECK(probability IS NULL OR (probability BETWEEN 0 AND 100)),
      expected_decision_date TEXT,
      revenue_originated REAL NOT NULL DEFAULT 0,
      revenue_influenced REAL NOT NULL DEFAULT 0,
      next_action TEXT,
      notes TEXT,
      consortium_required INTEGER NOT NULL DEFAULT 0,
      score_strategic_fit INTEGER NOT NULL DEFAULT 3 CHECK(score_strategic_fit BETWEEN 1 AND 5),
      score_access INTEGER NOT NULL DEFAULT 3 CHECK(score_access BETWEEN 1 AND 5),
      score_commercial INTEGER NOT NULL DEFAULT 3 CHECK(score_commercial BETWEEN 1 AND 5),
      score_urgency INTEGER NOT NULL DEFAULT 3 CHECK(score_urgency BETWEEN 1 AND 5),
      score_conversion INTEGER NOT NULL DEFAULT 3 CHECK(score_conversion BETWEEN 1 AND 5),
      internal_priority REAL,
      is_archived INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_accounts_lane ON accounts(lane);
    CREATE INDEX IF NOT EXISTS idx_accounts_archetype ON accounts(archetype);
    CREATE INDEX IF NOT EXISTS idx_accounts_archived ON accounts(is_archived);
    CREATE INDEX IF NOT EXISTS idx_accounts_priority ON accounts(internal_priority);
  `);

  if (tableSql('deals') && !columnExists('deals', 'account_id')) {
    db.exec('ALTER TABLE deals ADD COLUMN account_id TEXT');
    db.exec('CREATE INDEX IF NOT EXISTS idx_deals_account ON deals(account_id)');
  }

  if (tableSql('deals') && !columnExists('deals', 'lane')) {
    db.exec(`ALTER TABLE deals ADD COLUMN lane TEXT NOT NULL DEFAULT 'immediate'`);
    db.exec('CREATE INDEX IF NOT EXISTS idx_deals_lane ON deals(lane)');
    db.exec(`
      UPDATE deals SET lane = (
        SELECT accounts.lane FROM accounts WHERE accounts.id = deals.account_id
      )
      WHERE account_id IS NOT NULL
        AND EXISTS (SELECT 1 FROM accounts WHERE accounts.id = deals.account_id)
    `);
  }

  remapLegacyDealStages();
  ensureEcosystemSchema();
  ensureAccountBriefsSchema();
  ensureFeeBandsSchema();
  ensureCoachStallsSchema();
  ensureCommercialCasesSchema();
  ensureConversionAdviceSchema();
}

function ensureDigestSchema(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS pipeline_digest_sends (
      slot TEXT NOT NULL,
      lagos_date TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (slot, lagos_date)
    );
  `);
}

function addColumn(table: string, column: string, def: string): void {
  if (!tableSql(table) || columnExists(table, column)) return;
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${def}`);
}

function ensureEcosystemSchema(): void {
  const needModelBackfill = Boolean(tableSql('accounts') && !columnExists('accounts', 'commercial_model'));
  addColumn('accounts', 'commercial_model', "TEXT NOT NULL DEFAULT 'direct'");
  addColumn('accounts', 'delivery_partner_account_id', 'TEXT');
  addColumn('deals', 'delivery_partner_account_id', 'TEXT');
  addColumn('deals', 'next_action', 'TEXT');
  addColumn('deals', 'expected_decision_date', 'TEXT');
  db.exec('CREATE INDEX IF NOT EXISTS idx_accounts_role ON accounts(partnership_role)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_accounts_delivery_partner ON accounts(delivery_partner_account_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_deals_delivery_partner ON deals(delivery_partner_account_id)');

  if (needModelBackfill) {
    db.exec(`
      UPDATE accounts SET commercial_model = CASE partnership_role
        WHEN 'channel' THEN 'referral'
        WHEN 'delivery' THEN 'consortium'
        WHEN 'institutional' THEN 'mou'
        WHEN 'ecosystem' THEN 'joint_market'
        ELSE 'direct'
      END
    `);
  }
}

function ensureFeeBandsSchema(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS fee_bands (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      horizon TEXT NOT NULL,
      typical_work TEXT NOT NULL,
      currency TEXT NOT NULL DEFAULT 'NGN',
      min_m REAL NOT NULL,
      max_m REAL NOT NULL,
      when_to_use TEXT NOT NULL,
      archived INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_by TEXT
    );
  `);
}

function ensureCoachStallsSchema(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS coach_stalls (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      when_to_use TEXT NOT NULL,
      owner_move TEXT NOT NULL,
      archived INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_by TEXT
    );
  `);
}

function ensureCommercialCasesSchema(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS commercial_cases (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'draft'
        CHECK(status IN ('draft','applied','discarded')),
      payload TEXT NOT NULL DEFAULT '{}',
      model TEXT,
      provider TEXT,
      source_url TEXT,
      created_by TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      applied_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_commercial_cases_account ON commercial_cases(account_id);
    CREATE INDEX IF NOT EXISTS idx_commercial_cases_status ON commercial_cases(status);
    CREATE INDEX IF NOT EXISTS idx_commercial_cases_created ON commercial_cases(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_commercial_cases_account_created ON commercial_cases(account_id, created_at DESC);
  `);
  addColumn('commercial_cases', 'accepted_sections', "TEXT NOT NULL DEFAULT '[]'");
}

function ensureConversionAdviceSchema(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS conversion_advice (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'draft'
        CHECK(status IN ('draft','applied','discarded')),
      payload TEXT NOT NULL DEFAULT '{}',
      model TEXT,
      provider TEXT,
      created_by TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      applied_at TEXT,
      accepted_fields TEXT NOT NULL DEFAULT '[]'
    );
    CREATE INDEX IF NOT EXISTS idx_conversion_advice_account ON conversion_advice(account_id);
    CREATE INDEX IF NOT EXISTS idx_conversion_advice_status ON conversion_advice(status);
    CREATE INDEX IF NOT EXISTS idx_conversion_advice_created ON conversion_advice(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_conversion_advice_account_created ON conversion_advice(account_id, created_at DESC);
  `);
}

function ensureAccountBriefsSchema(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS account_briefs (
      id TEXT PRIMARY KEY,
      account_id TEXT REFERENCES accounts(id) ON DELETE SET NULL,
      organisation TEXT,
      status TEXT NOT NULL DEFAULT 'draft'
        CHECK(status IN ('draft','applied','discarded')),
      payload TEXT NOT NULL DEFAULT '{}',
      model TEXT,
      provider TEXT,
      source_url TEXT,
      created_by TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      applied_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_account_briefs_account ON account_briefs(account_id);
    CREATE INDEX IF NOT EXISTS idx_account_briefs_status ON account_briefs(status);
    CREATE INDEX IF NOT EXISTS idx_account_briefs_created ON account_briefs(created_at DESC);
  `);
}

/** One-time map of the old 9-stage GIFT path onto the 8-stage consulting conversion path. */
function remapLegacyDealStages(): void {
  if (!tableSql('deals')) return;
  const max = db.prepare('SELECT MAX(current_stage) as m FROM deals').get() as { m: number | null };
  if (!max?.m || max.m <= 8) return;
  console.log('[db] Remapping legacy 9-stage deals onto the consulting conversion path');
  db.exec(`
    UPDATE deals SET current_stage = CASE current_stage
      WHEN 3 THEN 2
      WHEN 4 THEN 3
      WHEN 5 THEN 4
      WHEN 6 THEN 4
      WHEN 7 THEN 5
      WHEN 8 THEN 6
      WHEN 9 THEN 6
      ELSE current_stage
    END
    WHERE current_stage >= 3;
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