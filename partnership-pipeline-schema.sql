-- =============================================================================
-- Partnership Pipeline — Full Database Schema
-- Commercial Proposal Operating System (CPO) + BD Pipeline
-- Engine: SQLite 3 (WAL mode, foreign_keys ON)
-- =============================================================================

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- =============================================================================
-- SECTION 1 — BD Pipeline Tables
-- =============================================================================

-- 1.1 deals — Every partnership opportunity from intake through pipeline
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

CREATE INDEX IF NOT EXISTS idx_deals_queue ON deals(queue_position);
CREATE INDEX IF NOT EXISTS idx_deals_archetype ON deals(archetype);
CREATE INDEX IF NOT EXISTS idx_deals_stage ON deals(current_stage);
CREATE INDEX IF NOT EXISTS idx_deals_archived ON deals(is_archived);

-- 1.2 stage_transitions — Timeline of every stage advancement
CREATE TABLE IF NOT EXISTS stage_transitions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    deal_id TEXT NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
    from_stage INTEGER,
    to_stage INTEGER NOT NULL,
    triggered_by TEXT,
    note TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_transitions_deal ON stage_transitions(deal_id);

-- 1.3 archetype_library — 7 integration archetypes with precedent templates
CREATE TABLE IF NOT EXISTS archetype_library (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    one_line_test TEXT NOT NULL,
    effort_tier REAL NOT NULL,
    description TEXT,
    standard_components TEXT,       -- JSON array of component names
    precedent_name TEXT,
    precedent_template TEXT,         -- Full template text with {{mustache}} placeholders
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);


-- =============================================================================
-- SECTION 2 — CPO (Commercial Proposal Operating System) Tables
-- =============================================================================

-- 2.1 proposal_projects — Every commercial proposal
CREATE TABLE IF NOT EXISTS proposal_projects (
    id TEXT PRIMARY KEY,
    deal_id TEXT NOT NULL REFERENCES deals(id),
    pipedrive_deal_url TEXT,
    partner_name TEXT NOT NULL,
    partner_contact TEXT,
    country TEXT,
    vertical TEXT,
    owner TEXT,
    partnership_route TEXT CHECK(partnership_route IN (
        'Distribution Partnership',
        'Connected Customer Journey',
        'Embedded / Co-branded',
        'Strategic Institutional Partnership',
        'Other'
    )),
    commercial_model TEXT CHECK(commercial_model IN ('A','B','C','D')),
    current_state TEXT NOT NULL DEFAULT 'not_eligible' CHECK(current_state IN (
        'not_eligible','intake','pre_flight','business_case','eligible',
        'drafting','functional_review','revision_required','approval_ready',
        'release_gate','approved_external','delivered','negotiation',
        'superseded','withdrawn'
    )),
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
    source TEXT NOT NULL DEFAULT 'manual' CHECK(source IN ('manual','pipedrive','bd_tracker')),
    bd_tracker_deal_ref TEXT,
    pipedrive_deal_id TEXT,
    external_released_at TEXT,
    external_release_version INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_proposal_deal ON proposal_projects(deal_id);
CREATE INDEX IF NOT EXISTS idx_proposal_state ON proposal_projects(current_state);

-- 2.2 proposal_versions — Versioned state snapshots (for release tracking)
CREATE TABLE IF NOT EXISTS proposal_versions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    proposal_id TEXT NOT NULL REFERENCES proposal_projects(id),
    version INTEGER NOT NULL,
    state_snapshot TEXT NOT NULL,    -- JSON snapshot of full proposal state
    created_by TEXT,
    is_release INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_proposal_versions_proposal ON proposal_versions(proposal_id);

-- 2.3 proposal_claims_library — GW-00 Central Claims & Evidence Register
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

CREATE INDEX IF NOT EXISTS idx_claims_status ON proposal_claims_library(status);

-- 2.4 proposal_claims — Mapping of library claims to proposals
CREATE TABLE IF NOT EXISTS proposal_claims (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    proposal_id TEXT NOT NULL REFERENCES proposal_projects(id),
    claim_id TEXT NOT NULL REFERENCES proposal_claims_library(id),
    section TEXT,
    custom_wording TEXT,
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_proposal_claims_proposal ON proposal_claims(proposal_id);

-- 2.5 proposal_economics — Commercial economics calculator
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

-- 2.6 proposal_assumptions — Assumptions Register
CREATE TABLE IF NOT EXISTS proposal_assumptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    proposal_id TEXT NOT NULL REFERENCES proposal_projects(id),
    category TEXT CHECK(category IN (
        'Commercial','Customer/Volume','Product','Technology',
        'Compliance/Legal','Partner'
    )),
    description TEXT NOT NULL,
    confidence TEXT CHECK(confidence IN ('C','E','P')),
    owner TEXT,
    evidence TEXT,
    impact TEXT,
    status TEXT DEFAULT 'open' CHECK(status IN ('open','resolved','superseded')),
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_proposal_assumptions_proposal ON proposal_assumptions(proposal_id);

-- 2.7 proposal_risks — Risk & Control Matrix
CREATE TABLE IF NOT EXISTS proposal_risks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    proposal_id TEXT NOT NULL REFERENCES proposal_projects(id),
    risk_type TEXT CHECK(risk_type IN (
        'Regulatory','Economics','Integration','Settlement','KYC/AML',
        'Transaction Monitoring','Customer Communication','Complaints',
        'Data Privacy','Cybersecurity','Reconciliation','Claims/Disclosures'
    )),
    owner TEXT,
    severity TEXT CHECK(severity IN ('Low','Medium','High','Critical')),
    mitigation TEXT,
    status TEXT DEFAULT 'open' CHECK(status IN ('open','closed','mitigated')),
    created_at TEXT DEFAULT (datetime('now'))
);

-- 2.8 proposal_approvals — Approvals Matrix (14 functional areas)
CREATE TABLE IF NOT EXISTS proposal_approvals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    proposal_id TEXT NOT NULL REFERENCES proposal_projects(id),
    function_area TEXT CHECK(function_area IN (
        'BD','Finance_Model','Finance_Economics','Finance_Fees',
        'Product_Scope','Product_Capability','Technology_Implementation',
        'Operations','Legal_Claims','Legal_Regulatory','Legal_Risk',
        'Legal_Commercial','Marketing_Template','Marketing_Claims'
    )),
    reviewer_name TEXT,
    status TEXT DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected','clarification')),
    decision TEXT,
    evidence_url TEXT,
    reviewed_at TEXT,
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_proposal_approvals_proposal ON proposal_approvals(proposal_id);

-- 2.9 proposal_responsibilities — Control domain responsibilities (§2.4/2.5, §7.5)
CREATE TABLE IF NOT EXISTS proposal_responsibilities (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    proposal_id TEXT NOT NULL REFERENCES proposal_projects(id),
    party TEXT NOT NULL CHECK(party IN ('UTribe','Partner','Joint','NA')),
    domain TEXT,
    description TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
);

-- 2.10 proposal_terms — Commercial & Partnership Terms (§9)
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

-- 2.11 proposal_success_metrics — KPIs (§9.4)
CREATE TABLE IF NOT EXISTS proposal_success_metrics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    proposal_id TEXT NOT NULL REFERENCES proposal_projects(id),
    metric TEXT NOT NULL,
    measurement_basis TEXT,
    target TEXT,
    linked_model TEXT,
    created_at TEXT DEFAULT (datetime('now'))
);

-- 2.12 proposal_discussion_points — Partner discussion points
CREATE TABLE IF NOT EXISTS proposal_discussion_points (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    proposal_id TEXT NOT NULL REFERENCES proposal_projects(id),
    category TEXT CHECK(category IN (
        'Commercial','Product/Customer Journey','Technology',
        'Operations','Legal/Compliance','Strategic Roadmap'
    )),
    question TEXT NOT NULL,
    owner TEXT,
    due_date TEXT,
    status TEXT DEFAULT 'open' CHECK(status IN ('open','resolved','deferred')),
    resolution TEXT,
    created_at TEXT DEFAULT (datetime('now'))
);

-- 2.13 proposal_conditional_modules — Toggleable modules
CREATE TABLE IF NOT EXISTS proposal_conditional_modules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    proposal_id TEXT NOT NULL REFERENCES proposal_projects(id),
    module_type TEXT CHECK(module_type IN (
        'extended_fees','integration_economics','growth_incentives',
        'pilot','exclusivity'
    )),
    is_active INTEGER DEFAULT 0,
    config TEXT,    -- JSON configuration
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

-- 2.14 proposal_extended_fees — Fee line items
CREATE TABLE IF NOT EXISTS proposal_extended_fees (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    proposal_id TEXT NOT NULL REFERENCES proposal_projects(id),
    fee_name TEXT NOT NULL,
    category TEXT CHECK(category IN (
        'Transaction-led','Relationship/retention-led','Operational/cost recovery'
    )),
    basis TEXT,
    confidence TEXT CHECK(confidence IN ('C','E','P')),
    approval_status TEXT DEFAULT 'pending',
    created_at TEXT DEFAULT (datetime('now'))
);

-- 2.15 proposal_growth_tiers — Growth incentive tiers
CREATE TABLE IF NOT EXISTS proposal_growth_tiers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    proposal_id TEXT NOT NULL REFERENCES proposal_projects(id),
    tier_name TEXT NOT NULL,
    measurement_threshold REAL,
    partner_economics TEXT,
    effective_date TEXT,
    created_at TEXT DEFAULT (datetime('now'))
);

-- 2.16 proposal_preflight — Pre-Flight Checklist
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

-- 2.17 proposal_audit_events — Full audit trail
CREATE TABLE IF NOT EXISTS proposal_audit_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    proposal_id TEXT NOT NULL REFERENCES proposal_projects(id),
    event_type TEXT NOT NULL,
    actor TEXT,
    description TEXT NOT NULL,
    metadata TEXT,    -- JSON payload
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_proposal_audit_proposal ON proposal_audit_events(proposal_id);


-- =============================================================================
-- SECTION 3 — BD Prospecting Tables
-- =============================================================================

-- 3.1 bd_prospecting_targets — BD prospecting tracker targets
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


-- =============================================================================
-- SECTION 4 — Seed Data: 7 Archetype Library
-- =============================================================================

-- Idempotent: only inserts if archetype_library is empty
INSERT OR IGNORE INTO archetype_library (id, name, one_line_test, effort_tier, description, standard_components, precedent_name, precedent_template) VALUES

('I',
 'Embedded Account / Dashboard',
 'Does the partner''s own platform need to show individual customers their GIFT balance and let them transact?',
 2.5,
 'SSO federation, individual KYC, live balance/transaction API. Medium-High effort.',
 '["OAuth2 / SSO session federation with the partner''s existing login","KYC verification API, with consented data pre-fill from the partner to reduce duplicate onboarding","Balance API plus webhook for near-real-time updates","Live pricing feed API (USD-equivalent)","Transaction API for Receive and Send requests","Notification integration for transaction and KYC status"]',
 'Ubuntu Tribe × Lifestyle Hub $GIFT Integration Proposal',
 '# Archetype I — Embedded Account / Dashboard Integration Template
## Partner Overview
- **Partner Name:** {{partner_name}}
- **Sector:** {{sector}}
- **Deal Stage:** {{deal_stage}}

## Integration Scope
This integration enables {{partner_name}}''s platform to display individual customer GIFT balances and facilitate transactions, embedded within their existing user experience.

## Standard Components (pre-designed, no engineering design required)
### 1. SSO Federation
- OAuth2 / OpenID Connect flow with {{partner_name}}''s existing login system
- Session lifetime configurable per partner policy
### 2. KYC Verification
- Ubuntu Tribe KYC API integration for end-customer verification
- Optional: consented pre-fill from {{partner_name}}''s existing KYC data
### 3. Balance & Transactions
- REST API for real-time GIFT balance queries
- Webhook subscriptions for balance changes (send/receive events)
- Transaction API (Receive GIFT, Send GIFT) with confirmation callbacks
### 4. Pricing
- Live pricing feed (USD-equivalent) via Ubuntu Tribe Price API

## Delivery Milestones
1. SSO integration (staging)
2. KYC API connection + data pre-fill
3. Balance API + webhooks
4. Transaction API (receive only → full send/receive)
5. UAT with {{partner_name}}''s selected user cohort
6. Production go-live

## Risk Notes
- KYC data sharing requires BSILC sign-off before any data moves between systems
- SSO session timeout configuration must comply with Ubuntu Tribe security policy
- Transaction limits apply per standard Ubuntu Tribe risk policies
'),

('II',
 'Institutional Custody / Fund Wrapper',
 'Is the partner a licensed asset manager pooling client money into a fund that holds GIFT?',
 1.5,
 'Single institutional custody account. Partner runs its own client-facing layer. Low-Medium effort.',
 '["Single institutional custody account (the partner''s fund, not per-client accounts)","NAV / reporting API for the fund''s own administration to consume","No consumer-facing UI build required","Trustee / Registrar coordination sits with the partner","BSILC compliance review for institutional fund structure"]',
 'Institutional Commercial Playbook v1.0; UBA Asset Management GIFT Commercial Proposal',
 '# Archetype II — Institutional Custody / Fund Wrapper Template
## Partner Overview
- **Partner Name:** {{partner_name}}
- **License/Regulator:** {{regulator}}
- **Fund Structure:** {{fund_structure}} (e.g. CIS, mutual fund, closed-end)

## Integration Scope
Single institutional custody account holding GIFT on behalf of the partner''s pooled fund. The partner manages all client-facing relationships through their existing fund administration. Ubuntu Tribe provides NAV reporting and redemption/issuance APIs.

## Standard Components
### 1. Institutional Custody Account
- One account, not per-client accounts
- The partner''s fund is the sole beneficial owner on Ubuntu Tribe''s records
### 2. NAV / Reporting API
- Daily NAV snapshot for the fund''s administration to reconcile
- Transaction history for audit trail
### 3. Redemption & Issuance
- Partner submits fund-level subscription/redemption orders
- Settlement within Ubuntu Tribe''s standard T+1 cycle
### 4. Compliance
- BSILC review of fund structure and investor eligibility
- Trustee/Registrar coordination handled by partner
- Regulatory filings per CIS structure (partner''s responsibility)

## Delivery Approach
- Single-phase delivery (no phasing needed — archetype''s scope is narrow)
- UAT: partner''s fund admin team tests NAV reporting and order flow

## Risk Notes
- Confirm partner holds valid asset management license before scoping
- Trustee relationship must be documented in the commercial agreement
- Fund documentation must specify GIFT as a permissible asset class
'),

('III',
 'Payment Rails / Infrastructure',
 'Does this partner move money for us, eg. mobile money, banking rails, OTC, treasury?',
 3.0,
 'The broadest, most bespoke build. Multiple rails, phased delivery. High effort.',
 '["Mobile money integration (e.g. M-Pesa, Airtel Money)","Banking rail integration (e.g. Pesalink, RTGS, SWIFT)","OTC functionality via API","FX conversion and treasury/liquidity management, with counterparty limits","Phased delivery against UAT milestones"]',
 'Swypt MSA, Schedule 1 Part B (Delivery Milestones and UAT)',
 '# Archetype III — Payment Rails / Infrastructure Template
## Partner Overview
- **Partner Name:** {{partner_name}}
- **Payment Method:** {{payment_method}} (mobile money / banking / OTC / multi-rail)
- **Geographies:** {{geographies}}

## Integration Scope
Connection to {{partner_name}}''s payment infrastructure so end-users can fund and withdraw from their GIFT wallet via local payment methods.

## Standard Components (design required per-rail)
### 1. Mobile Money Integration
- API connection to {{partner_name}}''s mobile money gateway (STK Push, USSD, or API)
- Transaction status webhooks
- Settlement reconciliation
### 2. Banking Rail Integration
- Bank account link for large-value transactions
- Real-time vs. batch settlement model
### 3. OTC / Treasury
- Large trade API for institutional users
- Counterparty limits and liquidity management
- Daily reconciliation

## Delivery Phasing (use Swypt Schedule 1 Part B pattern)
Phase 1: Mobile money in → GIFT wallet (inbound only)
Phase 2: GIFT wallet → Mobile money out (full cycle)
Phase 3: Banking rails + OTC
Phase 4: Treasury/liquidity automation

## Risk Notes
- Each phase has its own UAT milestone; no single go-live event
- Counterparty credit limits require treasury sign-off
- FX conversion requires real-time rate feed integration
- Regulatory approval needed per jurisdiction for payment services
'),

('IV',
 'Card Acceptance / Payment Gateway',
 'Does this let $GIFT-funded customers pay merchants via card?',
 2.0,
 'Gateway/acquiring integration so GIFT-funded value can pay merchants. Medium effort.',
 '["Card acquiring / gateway API integration","PCI-DSS compliance scoping","Merchant category code configuration","Sponsor-bank relationship verification"]',
 'Gladys Technologies Business Case',
 '# Archetype IV — Card Acceptance / Payment Gateway Template
## Partner Overview
- **Partner Name:** {{partner_name}}
- **Acquiring Model:** (direct / sponsor-bank / gateway)
- **Geographies:** {{geographies}}

## Integration Scope
Enable merchants to accept card payments funded by GIFT wallets, with settlement in fiat or GIFT.

## Standard Components
### 1. Gateway/Acquiring API Integration
- Partner''s gateway API for merchant transaction processing
- Settlement file processing (batch or real-time)
### 2. PCI-DSS
- Scope assessment: who handles card data, how
- SAQ or QSA audit requirements per merchant volume
### 3. Sponsor Bank
- **CRITICAL: Confirm sponsorship status before scoping**
- Single point of failure risk — if the sponsor bank relationship changes, the integration breaks

## Delivery Approach
- Single-phase delivery after sponsor bank confirmation
- UAT with 3-5 test merchants before full rollout

## Risk Notes
- Sponsor bank relationship is the #1 risk factor
- PCI-DSS scope must be established BEFORE any integration work
- Merchant category codes (MCC) affect interchange rates — confirm with acquirer
'),

('V',
 'Card Issuance',
 'Does this partner issue a branded card to GIFT holders for spending?',
 2.5,
 'Opposite direction from Archetype IV — the partner issues cards, not accepts them. Medium-High effort.',
 '["BIN sponsorship coordination with a named issuing bank","Card issuance API (virtual and/or physical)","Wallet infrastructure for the issued card","Cardholder KYC/AML responsibility assignment"]',
 'BananaTech Business Case (pending diligence clearance)',
 '# Archetype V — Card Issuance Template
## Partner Overview
- **Partner Name:** {{partner_name}}
- **Card Type:** (virtual / physical / both)
- **BIN Sponsor:** {{bin_sponsor}}
- **Program Manager:** {{program_manager}}

## Integration Scope
Issue branded cards (virtual and/or physical) to GIFT wallet holders, enabling spend at any merchant that accepts the card network.

## Standard Components
### 1. BIN Sponsorship
- Issuing bank agreement (confirm sponsor before scoping)
- BIN allocation for the card program
### 2. Card Issuance API
- Virtual card creation (instant)
- Physical card production and shipping
### 3. Wallet Integration
- Card linked to the GIFT wallet as the funding source
- Real-time balance checks at POS/ATM
### 4. KYC/AML
- Confirm who owns KYC (issuing bank, program manager, or Ubuntu Tribe/BSILC)
- This must be resolved BEFORE scoping

## Delivery Approach
- Phase 1: Virtual card issuance (faster go-live)
- Phase 2: Physical card + wallet integration

## Risk Notes
- BIN sponsorship is the critical dependency
- KYC ownership ambiguity can block launch
'),

('VI',
 'Exchange Listing / Liquidity',
 'Does GIFT trade on this partner''s own exchange?',
 1.5,
 'Minimal ongoing API embed. Real weight sits in listing diligence and treasury risk. Low-Medium (eng) / High (legal-treasury).',
 '["Listing diligence pack (regulator-grade scrutiny)","Treasury counterparty limits, hard caps, tenor limits, daily reconciliation","Market surveillance coordination with the exchange","Competitive firewall protocol (where exchange is also a partial competitor)"]',
 'Yellow Card Business Case, Appendices B-D',
 '# Archetype VI — Exchange Listing / Liquidity Template
## Partner Overview
- **Exchange:** {{partner_name}}
- **Jurisdiction:** {{jurisdiction}}
- **Regulatory Status:** {{regulatory_status}}
- **Trading Pair:** {{trading_pair}} (e.g. GIFT/USDT)

## Integration Scope
List GIFT on {{partner_name}}''s exchange for trading. Engineering work is minimal; the heavy lift is listing diligence and treasury risk management.

## Standard Components
### 1. Listing Diligence Pack
- Tokenomics summary
- Smart contract audit reports
- Team and legal entity docs
- Market-making plan
- Compliance assessment for exchange''s jurisdiction
### 2. Treasury & Counterparty Risk
- Hard cap on deposit balance at the exchange
- Tenor limits on open positions
- Daily reconciliation of on-chain vs. exchange balances
### 3. Market Surveillance
- Coordinate with exchange''s surveillance team
- Flag suspicious trading patterns
- Price manipulation detection thresholds
### 4. Competitive Firewall
- If the exchange also offers competing token products
- Information barriers between Ubuntu Tribe and exchange''s listing team

## Risk Notes
- Treasury limits are the primary risk control — set before first deposit
- Listing diligence is a rehearsal for regulator-grade scrutiny — treat it seriously
- Daily reconciliation is mandatory, not optional
- Competitive firewalls must be documented in the listing agreement
'),

('VII',
 'Non-Technical / Zero-Integration',
 'Is this a commercial, CSR, or advocacy relationship with no API or platform touchpoint at all?',
 0.5,
 'No technical components. BD closes independently. No Tech queue entry needed.',
 '["No technical components — this is the point","BD closes independently without Tech/Product sign-off"]',
 'She''s Included CSR Strategy & Letter Template',
 '# Archetype VII — Non-Technical / Zero-Integration Template
## Partner Overview
- **Partner Name:** {{partner_name}}
- **Partnership Type:** (CSR / advocacy / commercial / media / sponsorship)

## No Integration Required
This partnership has no API or platform touchpoint. It is closed entirely by BD without Product & Technology involvement.

## BD Checklist
- [ ] Partnership agreement signed
- [ ] Brand guidelines shared (if co-branded materials)
- [ ] Communications schedule confirmed
- [ ] No technical resources required from Tech/Product

## Why This Matters
Archetype VII exists deliberately. Recognising "no integration needed" is a triage win — it keeps the Tech queue clean for deals that genuinely need engineering time.
');


-- =============================================================================
-- SECTION 5 — Optional: Sample Seed Data for Local Development
-- =============================================================================

-- 5.1 Sample claims library entries (idempotent)
INSERT OR IGNORE INTO proposal_claims_library (id, category, claim, status) VALUES
('CLM-001', 'Value Proposition', 'GIFT is fully gold-backed at 1:1 ratio with allocated gold reserves.', 'Approved'),
('CLM-002', 'Regulatory', 'Ubuntu Tribe holds a VASP license in compliance with local regulations.', 'Approved'),
('CLM-003', 'Security', 'Customer assets are held in regulated custodial wallets with multi-signature protection.', 'Approved'),
('CLM-004', 'Performance', 'Transaction settlement occurs within T+1 for standard transactions.', 'Pending'),
('CLM-005', 'Market', 'GIFT is listed on multiple exchanges providing deep liquidity for holders.', 'Pending');

-- 5.2 Sample BD prospecting targets (idempotent)
INSERT OR IGNORE INTO bd_prospecting_targets (id, firm_name, tier, category, why_this_fits, status, bd_owner) VALUES
('BDP-001', 'Example Bank Ltd', 1, 'Category A', 'Large retail banking network in East Africa with 5M+ customers', 3, 'Chimezie Chuta'),
('BDP-002', 'Sample Payments Co', 2, 'Category B', 'Mobile money provider with existing agent network across 3 countries', 5, 'Chimezie Chuta'),
('BDP-003', 'Test Asset Management', 1, 'Screening Queue', 'Fund manager exploring tokenised gold products for institutional clients', 1, 'Chimezie Chuta');

-- 5.3 Sample deal (idempotent)
INSERT OR IGNORE INTO deals (id, partner_name, sector, archetype, is_repeat, novelty_level, revenue_potential, strategic_fit, effort_tier, novelty_penalty, priority_score, queue_position, current_stage, bd_owner, description)
VALUES ('DEMO-DEV-001', 'Demo Partner Ltd', 'Asset Management', 'II', 1, 1, 3, 3, 1.5, 1, 6.0, 1, 5,
        'Chimezie Chuta',
        'Demo deal for local development and testing of the partnership pipeline.');


-- =============================================================================
-- Done. The database is ready for use.
-- =============================================================================