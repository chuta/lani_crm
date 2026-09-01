/** CPO — Commercial Proposal Operating System types */

export const PROPOSAL_STATES = [
  'not_eligible',
  'intake',
  'pre_flight',
  'business_case',
  'eligible',
  'drafting',
  'functional_review',
  'revision_required',
  'approval_ready',
  'release_gate',
  'approved_external',
  'delivered',
  'negotiation',
  'superseded',
  'withdrawn',
] as const;
export type ProposalState = (typeof PROPOSAL_STATES)[number];

export const PARTNERSHIP_ROUTES = [
  'Distribution Partnership',
  'Connected Customer Journey',
  'Embedded / Co-branded',
  'Strategic Institutional Partnership',
  'Other',
] as const;
export type PartnershipRoute = (typeof PARTNERSHIP_ROUTES)[number];

export const COMMERCIAL_MODELS = ['A', 'B', 'C', 'D'] as const;
export type CommercialModel = (typeof COMMERCIAL_MODELS)[number];

export const CONFIDENCE_TAGS = ['C', 'E', 'P'] as const;
export type ConfidenceTag = (typeof CONFIDENCE_TAGS)[number];

export const CLAIM_STATUSES = ['Pending', 'Approved', 'Deprecated'] as const;
export type ClaimStatus = (typeof CLAIM_STATUSES)[number];

export const APPROVAL_FUNCTIONS = [
  'BD',
  'Finance_Model',
  'Finance_Economics',
  'Finance_Fees',
  'Product_Scope',
  'Product_Capability',
  'Technology_Implementation',
  'Operations',
  'Legal_Claims',
  'Legal_Regulatory',
  'Legal_Risk',
  'Legal_Commercial',
  'Marketing_Template',
  'Marketing_Claims',
] as const;
export type ApprovalFunction = (typeof APPROVAL_FUNCTIONS)[number];

export const ASSUMPTION_CATEGORIES = [
  'Commercial',
  'Customer/Volume',
  'Product',
  'Technology',
  'Compliance/Legal',
  'Partner',
] as const;
export type AssumptionCategory = (typeof ASSUMPTION_CATEGORIES)[number];

export const RISK_TYPES = [
  'Regulatory', 'Economics', 'Integration', 'Settlement',
  'KYC/AML', 'Transaction Monitoring', 'Customer Communication',
  'Complaints', 'Data Privacy', 'Cybersecurity', 'Reconciliation',
  'Claims/Disclosures',
] as const;
export type RiskType = (typeof RISK_TYPES)[number];

export const DISCUSSION_CATEGORIES = [
  'Commercial', 'Product/Customer Journey', 'Technology',
  'Operations', 'Legal/Compliance', 'Strategic Roadmap',
] as const;
export type DiscussionCategory = (typeof DISCUSSION_CATEGORIES)[number];

export const CONDITIONAL_MODULES = [
  'extended_fees', 'integration_economics', 'growth_incentives', 'pilot', 'exclusivity',
] as const;
export type ConditionalModule = (typeof CONDITIONAL_MODULES)[number];

export const PREFLIGHT_CATEGORIES = ['Qualification', 'Stakeholders', 'Functional', 'Commercial'] as const;
export type PreflightCategory = (typeof PREFLIGHT_CATEGORIES)[number];

export const RESPONSIBILITY_PARTIES = ['UTribe', 'Partner', 'Joint', 'NA'] as const;
export type ResponsibilityParty = (typeof RESPONSIBILITY_PARTIES)[number];

export const CONTROL_DOMAINS = [
  'Custody',
  'Insurance',
  'Redemption',
  'Liquidity',
  'Settlement',
  'Reconciliation',
  'API / Technical Integration',
  'Customer Onboarding',
  'Customer Support',
  'Customer Communication',
  'Customer Complaints',
  'Operational Escalation',
  'KYC / AML',
  'Transaction Monitoring',
  'Data Privacy',
  'Cybersecurity',
  'Regulatory Engagement',
  'Controlled Claims & Disclosures',
  'Reporting',
] as const;
export type ControlDomain = (typeof CONTROL_DOMAINS)[number];

/* ─── Core interfaces ─── */

export interface ProposalProject {
  id: string;
  deal_id: string;
  pipedrive_deal_url: string | null;
  partner_name: string;
  partner_contact: string | null;
  country: string | null;
  vertical: string | null;
  owner: string | null;
  partnership_route: PartnershipRoute | null;
  commercial_model: CommercialModel | null;
  current_state: ProposalState;
  priority: string | null;
  expected_revenue: number | null;
  expected_aum: number | null;
  expected_volume: number | null;
  target_close_date: string | null;
  executive_summary: string | null;
  partner_value: string | null;
  utribe_value: string | null;
  implementation_route: string | null;
  technical_dependencies: string | null;
  third_party_dependencies: string | null;
  product_dependencies: string | null;
  implementation_timing: string | null;
  governance_cadence: string | null;
  escalation_route: string | null;
  is_archived: number;
  source: string;
  bd_tracker_deal_ref: string | null;
  pipedrive_deal_id: string | null;
  external_released_at: string | null;
  external_release_version: number;
  created_at: string;
  updated_at: string;
}

export interface ProposalEconomics {
  id: number;
  proposal_id: string;
  gross_commercial_value: number | null;
  gross_confidence: ConfidenceTag | null;
  operating_cost: number | null;
  operating_cost_confidence: ConfidenceTag | null;
  residual_pool: number | null;
  partner_allocation: number | null;
  partner_allocation_pct: number | null;
  utribe_allocation: number | null;
  utribe_allocation_pct: number | null;
  effective_partner_pct: number | null;
  effective_utribe_pct: number | null;
  partner_effective_economics: number | null;
  utribe_effective_economics: number | null;
  base_gross: number | null;
  base_operating_cost: number | null;
  downside_gross: number | null;
  downside_operating_cost: number | null;
  upside_gross: number | null;
  upside_operating_cost: number | null;
}

export interface EconomicsInput {
  gross_commercial_value: number;
  gross_confidence: ConfidenceTag;
  operating_cost: number;
  operating_cost_confidence: ConfidenceTag;
  partner_allocation_pct: number;
  utribe_allocation_pct: number;
}

export interface ClaimRecord {
  id: string;
  category: string;
  claim: string;
  evidence_url: string | null;
  jurisdiction: string;
  status: ClaimStatus;
  version: string;
  effective_date: string | null;
  review_date: string | null;
  owner: string | null;
  created_at: string;
  updated_at: string;
}

export interface ApprovalRecord {
  id: number;
  proposal_id: string;
  function_area: ApprovalFunction;
  reviewer_name: string | null;
  status: 'pending' | 'approved' | 'rejected' | 'clarification';
  decision: string | null;
  evidence_url: string | null;
  reviewed_at: string | null;
  created_at: string;
}

export interface AssumptionRecord {
  id: number;
  proposal_id: string;
  category: AssumptionCategory;
  description: string;
  confidence: ConfidenceTag;
  owner: string | null;
  evidence: string | null;
  impact: string | null;
  status: string;
}

export interface RiskRecord {
  id: number;
  proposal_id: string;
  risk_type: RiskType;
  owner: string | null;
  severity: string;
  mitigation: string | null;
  status: string;
}

export interface DiscussionPoint {
  id: number;
  proposal_id: string;
  category: DiscussionCategory;
  question: string;
  owner: string | null;
  due_date: string | null;
  status: string;
  resolution: string | null;
}

export interface ReleaseGateResult {
  passed: boolean;
  checks: ReleaseCheck[];
  score: number;
  timestamp: string;
}

export interface ReleaseCheck {
  name: string;
  passed: boolean;
  detail: string;
}

export interface PreflightItem {
  id: number;
  proposal_id: string;
  check_item: string;
  category: PreflightCategory;
  is_checked: number;
  checked_by: string | null;
  checked_at: string | null;
}

export interface ResponsibilityRecord {
  id: number;
  proposal_id: string;
  party: ResponsibilityParty;
  domain: string | null;
  description: string;
  created_at: string;
}

export interface ProposalTerms {
  proposal_id: string;
  commercial_review: string | null;
  review_data_required: string | null;
  review_reconsideration: string | null;
  review_approval_process: string | null;
  recon_cadence: string | null;
  payment_cadence: string | null;
  dispute_window: string | null;
  settlement_mechanism: string | null;
  pilot_required: number;
  pilot_target_segment: string | null;
  pilot_duration: string | null;
  pilot_scope: string | null;
  pilot_success_measures: string | null;
  pilot_decision_gate: string | null;
  pilot_expansion_criteria: string | null;
  exclusivity_requested: number;
  excl_scope: string | null;
  excl_geography: string | null;
  excl_product: string | null;
  excl_customer_segment: string | null;
  excl_duration: string | null;
  excl_performance_conditions: string | null;
  excl_conflict_check: string | null;
  updated_at: string | null;
}

export interface SuccessMetricRecord {
  id: number;
  proposal_id: string;
  metric: string;
  measurement_basis: string | null;
  target: string | null;
  linked_model: string | null;
  created_at: string;
}

/** Route → default responsibility matrix (template §2.4 control rule) */
export const ROUTE_RESPONSIBILITY_DEFAULTS: Record<string, { party: ResponsibilityParty; domain: string; description: string }[]> = {
  'Distribution Partnership': [
    { party: 'UTribe', domain: 'Custody', description: 'UTribe oversees custody of digital assets through approved regulated custodians.' },
    { party: 'UTribe', domain: 'Redemption', description: 'UTribe operates redemption processing.' },
    { party: 'UTribe', domain: 'Liquidity', description: 'UTribe manages liquidity provisioning arrangements.' },
    { party: 'UTribe', domain: 'Settlement', description: 'UTribe settles platform transactions.' },
    { party: 'UTribe', domain: 'Transaction Monitoring', description: 'UTribe operates transaction monitoring across its platform.' },
    { party: 'UTribe', domain: 'Controlled Claims & Disclosures', description: 'UTribe controls claims wording against the Approved Claims & Evidence Register.' },
    { party: 'UTribe', domain: 'Reporting', description: 'UTribe provides agreed operational and commercial reporting.' },
    { party: 'UTribe', domain: 'Insurance', description: 'UTribe confirms applicable insurance arrangements for safeguarded assets.' },
    { party: 'Partner', domain: 'Customer Onboarding', description: 'Partner conducts end-customer onboarding for its distribution channel.' },
    { party: 'Partner', domain: 'Customer Support', description: 'Partner provides first-line customer support.' },
    { party: 'Partner', domain: 'KYC / AML', description: 'Partner performs KYC/AML checks on customers it introduces.' },
    { party: 'Partner', domain: 'Customer Communication', description: 'Partner communicates product and service information to its customers.' },
    { party: 'Partner', domain: 'Customer Complaints', description: 'Partner handles customer complaints in the first instance.' },
    { party: 'Partner', domain: 'Regulatory Engagement', description: 'Partner engages its local regulators on distribution activity.' },
    { party: 'Joint', domain: 'API / Technical Integration', description: 'Both parties coordinate and validate the technical integration.' },
    { party: 'Joint', domain: 'Reconciliation', description: 'Both parties reconcile transaction and position records.' },
    { party: 'Joint', domain: 'Data Privacy', description: 'Both parties comply with applicable data protection obligations.' },
    { party: 'Joint', domain: 'Cybersecurity', description: 'Both parties maintain agreed security controls at their respective boundaries.' },
    { party: 'Joint', domain: 'Operational Escalation', description: 'Both parties operate an agreed escalation route for operational issues.' },
  ],
  'Connected Customer Journey': [
    { party: 'UTribe', domain: 'Custody', description: 'UTribe oversees custody of digital assets through approved regulated custodians.' },
    { party: 'UTribe', domain: 'Redemption', description: 'UTribe operates redemption processing.' },
    { party: 'UTribe', domain: 'Liquidity', description: 'UTribe manages liquidity provisioning arrangements.' },
    { party: 'UTribe', domain: 'Settlement', description: 'UTribe settles platform transactions.' },
    { party: 'UTribe', domain: 'Transaction Monitoring', description: 'UTribe operates transaction monitoring across its platform.' },
    { party: 'UTribe', domain: 'Controlled Claims & Disclosures', description: 'UTribe controls claims wording against the Approved Claims & Evidence Register.' },
    { party: 'UTribe', domain: 'Reporting', description: 'UTribe provides agreed operational and commercial reporting.' },
    { party: 'UTribe', domain: 'Insurance', description: 'UTribe confirms applicable insurance arrangements for safeguarded assets.' },
    { party: 'Partner', domain: 'Customer Onboarding', description: 'Partner conducts end-customer onboarding for the connected journey.' },
    { party: 'Partner', domain: 'Customer Support', description: 'Partner provides first-line customer support.' },
    { party: 'Partner', domain: 'KYC / AML', description: 'Partner performs KYC/AML checks on customers it introduces.' },
    { party: 'Partner', domain: 'Customer Communication', description: 'Partner communicates product and service information to its customers.' },
    { party: 'Partner', domain: 'Customer Complaints', description: 'Partner handles customer complaints in the first instance.' },
    { party: 'Joint', domain: 'API / Technical Integration', description: 'Both parties coordinate and validate the technical integration.' },
    { party: 'Joint', domain: 'Reconciliation', description: 'Both parties reconcile transaction and position records.' },
    { party: 'Joint', domain: 'Data Privacy', description: 'Both parties comply with applicable data protection obligations.' },
    { party: 'Joint', domain: 'Cybersecurity', description: 'Both parties maintain agreed security controls at their respective boundaries.' },
    { party: 'Joint', domain: 'Operational Escalation', description: 'Both parties operate an agreed escalation route for operational issues.' },
    { party: 'Partner', domain: 'Regulatory Engagement', description: 'Partner engages its local regulators on the connected customer journey.' },
  ],
  'Embedded / Co-branded': [
    { party: 'UTribe', domain: 'Custody', description: 'UTribe oversees custody of digital assets through approved regulated custodians.' },
    { party: 'UTribe', domain: 'Redemption', description: 'UTribe operates redemption processing.' },
    { party: 'UTribe', domain: 'Liquidity', description: 'UTribe manages liquidity provisioning arrangements.' },
    { party: 'UTribe', domain: 'Settlement', description: 'UTribe settles platform transactions.' },
    { party: 'UTribe', domain: 'Transaction Monitoring', description: 'UTribe operates transaction monitoring across its platform.' },
    { party: 'UTribe', domain: 'Controlled Claims & Disclosures', description: 'UTribe controls claims wording against the Approved Claims & Evidence Register.' },
    { party: 'UTribe', domain: 'Insurance', description: 'UTribe confirms applicable insurance arrangements for safeguarded assets.' },
    { party: 'UTribe', domain: 'API / Technical Integration', description: 'UTribe builds and maintains the embedded integration APIs.' },
    { party: 'UTribe', domain: 'Reporting', description: 'UTribe provides agreed operational and commercial reporting.' },
    { party: 'Partner', domain: 'Customer Onboarding', description: 'Partner conducts end-customer onboarding within the co-branded experience.' },
    { party: 'Partner', domain: 'Customer Support', description: 'Partner provides first-line customer support.' },
    { party: 'Partner', domain: 'KYC / AML', description: 'Partner performs KYC/AML checks on customers it introduces.' },
    { party: 'Partner', domain: 'Customer Communication', description: 'Partner communicates product and service information to its customers.' },
    { party: 'Partner', domain: 'Customer Complaints', description: 'Partner handles customer complaints in the first instance.' },
    { party: 'Partner', domain: 'Regulatory Engagement', description: 'Partner engages its local regulators on the co-branded offering.' },
    { party: 'Joint', domain: 'Reconciliation', description: 'Both parties reconcile transaction and position records.' },
    { party: 'Joint', domain: 'Data Privacy', description: 'Both parties comply with applicable data protection obligations.' },
    { party: 'Joint', domain: 'Cybersecurity', description: 'Both parties maintain agreed security controls at their respective boundaries.' },
    { party: 'Joint', domain: 'Operational Escalation', description: 'Both parties operate an agreed escalation route for operational issues.' },
  ],
  'Strategic Institutional Partnership': [
    { party: 'UTribe', domain: 'Custody', description: 'UTribe oversees custody of digital assets through approved regulated custodians.' },
    { party: 'UTribe', domain: 'Insurance', description: 'UTribe confirms applicable insurance arrangements for safeguarded assets.' },
    { party: 'UTribe', domain: 'Redemption', description: 'UTribe operates redemption processing.' },
    { party: 'UTribe', domain: 'Liquidity', description: 'UTribe manages liquidity provisioning arrangements.' },
    { party: 'UTribe', domain: 'Settlement', description: 'UTribe settles platform transactions.' },
    { party: 'UTribe', domain: 'Transaction Monitoring', description: 'UTribe operates transaction monitoring across its platform.' },
    { party: 'UTribe', domain: 'Controlled Claims & Disclosures', description: 'UTribe controls claims wording against the Approved Claims & Evidence Register.' },
    { party: 'UTribe', domain: 'Reporting', description: 'UTribe provides institutional reporting to the partner.' },
    { party: 'UTribe', domain: 'Regulatory Engagement', description: 'UTribe engages regulators on the institutional offering as applicable.' },
    { party: 'Partner', domain: 'Customer Onboarding', description: 'Partner conducts client onboarding for its institutional clients.' },
    { party: 'Partner', domain: 'Customer Support', description: 'Partner provides client relationship and support.' },
    { party: 'Partner', domain: 'KYC / AML', description: 'Partner performs KYC/AML checks on its institutional clients.' },
    { party: 'Partner', domain: 'Customer Communication', description: 'Partner communicates fund and product information to its clients.' },
    { party: 'Partner', domain: 'Customer Complaints', description: 'Partner handles client complaints in the first instance.' },
    { party: 'Partner', domain: 'API / Technical Integration', description: 'Partner coordinates NAV and reporting integrations with its administration.' },
    { party: 'Joint', domain: 'Reconciliation', description: 'Both parties reconcile positions, NAV and transactions.' },
    { party: 'Joint', domain: 'Data Privacy', description: 'Both parties comply with applicable data protection obligations.' },
    { party: 'Joint', domain: 'Cybersecurity', description: 'Both parties maintain agreed security controls at their respective boundaries.' },
    { party: 'Joint', domain: 'Operational Escalation', description: 'Both parties operate an agreed escalation route for operational issues.' },
  ],
  'Other': [
    { party: 'NA', domain: 'Custody', description: 'Not applicable — confirm during scoping.' },
    { party: 'NA', domain: 'Insurance', description: 'Not applicable — confirm during scoping.' },
    { party: 'NA', domain: 'Redemption', description: 'Not applicable — confirm during scoping.' },
    { party: 'NA', domain: 'Liquidity', description: 'Not applicable — confirm during scoping.' },
    { party: 'NA', domain: 'Settlement', description: 'Not applicable — confirm during scoping.' },
    { party: 'NA', domain: 'Reconciliation', description: 'Not applicable — confirm during scoping.' },
    { party: 'NA', domain: 'API / Technical Integration', description: 'Not applicable — confirm during scoping.' },
    { party: 'NA', domain: 'Customer Onboarding', description: 'Not applicable — confirm during scoping.' },
    { party: 'NA', domain: 'Customer Support', description: 'Not applicable — confirm during scoping.' },
    { party: 'NA', domain: 'Customer Communication', description: 'Not applicable — confirm during scoping.' },
    { party: 'NA', domain: 'Customer Complaints', description: 'Not applicable — confirm during scoping.' },
    { party: 'NA', domain: 'Operational Escalation', description: 'Not applicable — confirm during scoping.' },
    { party: 'NA', domain: 'KYC / AML', description: 'Not applicable — confirm during scoping.' },
    { party: 'NA', domain: 'Transaction Monitoring', description: 'Not applicable — confirm during scoping.' },
    { party: 'NA', domain: 'Data Privacy', description: 'Not applicable — confirm during scoping.' },
    { party: 'NA', domain: 'Cybersecurity', description: 'Not applicable — confirm during scoping.' },
    { party: 'NA', domain: 'Regulatory Engagement', description: 'Not applicable — confirm during scoping.' },
    { party: 'NA', domain: 'Controlled Claims & Disclosures', description: 'Not applicable — confirm during scoping.' },
    { party: 'NA', domain: 'Reporting', description: 'Not applicable — confirm during scoping.' },
  ],
};

/* ─── API response shapes ─── */

export interface ProposalWithSummary extends ProposalProject {
  economics: ProposalEconomics | null;
  approvals: ApprovalRecord[];
  preflight: PreflightItem[];
  assumption_count: number;
  unresolved_p_count: number;
  risks: RiskRecord[];
  discussion_points: DiscussionPoint[];
  active_modules: string[];
}

export interface ProposalDetailFull extends ProposalWithSummary {
  claims: { claim_id: string; claim: ClaimRecord }[];
  versions: { version: number; created_at: string; is_release: number }[];
  audit: { event_type: string; actor: string | null; description: string; created_at: string }[];
}

export interface DashboardData {
  summary: {
    total_active: number;
    blocked: number;
    in_draft: number;
    awaiting_review: number;
    release_ready: number;
  };
  attention_required: {
    proposal_id: string;
    partner: string;
    issue: string;
    function_area: string | null;
    detail: string;
    count: number;
    severity: string;
    target_tab: string;
  }[];
  pipeline: {
    stage: string;
    count: number;
    total_revenue: number;
  }[];
  readings_score?: number;
}