/** CPO — Frontend type definitions */

export interface ProposalProject {
  id: string;
  deal_id: string;
  pipedrive_deal_url: string | null;
  partner_name: string;
  partner_contact: string | null;
  country: string | null;
  vertical: string | null;
  owner: string | null;
  partnership_route: string | null;
  commercial_model: string | null;
  current_state: string;
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
  contract_term: string | null;
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
  gross_commercial_value: number | null;
  gross_confidence: string | null;
  operating_cost: number | null;
  operating_cost_confidence: string | null;
  residual_pool: number | null;
  partner_allocation: number | null;
  partner_allocation_pct: number | null;
  utribe_allocation: number | null;
  utribe_allocation_pct: number | null;
  effective_partner_pct: number | null;
  effective_utribe_pct: number | null;
  partner_effective_economics: number | null;
  utribe_effective_economics: number | null;
}

export interface ClaimRecord {
  id: string;
  category: string;
  claim: string;
  evidence_url: string | null;
  jurisdiction: string;
  status: string;
  version: string;
  effective_date: string | null;
  review_date: string | null;
  owner: string | null;
}

export interface ApprovalRecord {
  id: number;
  proposal_id: string;
  function_area: string;
  reviewer_name: string | null;
  status: string;
  decision: string | null;
  evidence_url: string | null;
  reviewed_at: string | null;
}

export interface AssumptionRecord {
  id: number;
  category: string;
  description: string;
  confidence: string;
  owner: string | null;
  evidence: string | null;
  impact: string | null;
  status: string;
}

export interface RiskRecord {
  id: number;
  risk_type: string;
  owner: string | null;
  severity: string;
  mitigation: string | null;
  status: string;
}

export interface DiscussionPoint {
  id: number;
  category: string;
  question: string;
  owner: string | null;
  due_date: string | null;
  status: string;
  resolution: string | null;
}

export interface PreflightItem {
  id: number;
  check_item: string;
  category: string;
  is_checked: number;
  checked_by: string | null;
  checked_at: string | null;
}

export interface ResponsibilityRecord {
  id: number;
  proposal_id: string;
  party: 'UTribe' | 'Partner' | 'Joint' | 'NA';
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

export const CONTROL_DOMAINS = [
  'Custody','Insurance','Redemption','Liquidity','Settlement','Reconciliation',
  'API / Technical Integration','Customer Onboarding','Customer Support',
  'Customer Communication','Customer Complaints','Operational Escalation',
  'KYC / AML','Transaction Monitoring','Data Privacy','Cybersecurity',
  'Regulatory Engagement','Controlled Claims & Disclosures','Reporting',
] as const;

export const ASSUMPTION_CATEGORIES = [
  'Market','Regulatory','Commercial','Operational','Technical','Partner','Pricing','Volume','Timeline','Legal',
] as const;

export const CONFIDENCE_LEVELS = [
  { id: 'C', label: 'C — Confirmed', color: 'text-accent-success' },
  { id: 'E', label: 'E — Estimated', color: 'text-yellow-400' },
  { id: 'P', label: 'P — Placeholder', color: 'text-red-400' },
] as const;

export const RISK_TYPES = [
  'KYC/AML','Transaction Monitoring','Customer Communication','Complaints',
  'Data Privacy','Cybersecurity','Settlement','Reconciliation','Regulatory',
  'Claims/Disclosures','Economics','Integration','Operational','Reputational',
  'Liquidity','Custody','Technology','Market',
] as const;

export const SEVERITY_LEVELS = ['Critical','High','Medium','Low'] as const;

export const DISCUSSION_CATEGORIES = [
  'Regulatory','Commercial','Operational','Technical','Legal',
  'Strategic','Timeline','Scope','Risk','Pricing',
] as const;

export interface ProposalDetail {
  ok: boolean;
  project: ProposalProject;
  economics: ProposalEconomics | null;
  approvals: ApprovalRecord[];
  preflight: PreflightItem[];
  assumptions: AssumptionRecord[];
  unresolved_p_count: number;
  risks: RiskRecord[];
  discussion_points: DiscussionPoint[];
  active_modules: string[];
  claims: any[];
  versions: any[];
  audit: any[];
  responsibilities: ResponsibilityRecord[];
  terms: ProposalTerms | null;
  success_metrics: SuccessMetricRecord[];
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
    state: string;
    count: number;
    total_revenue: number;
  }[];
}

export const PROPOSAL_STATES = [
  { id: 'not_eligible', label: 'Not Eligible', icon: '⏸️', color: 'text-gray-500' },
  { id: 'intake', label: 'Intake', icon: '📥', color: 'text-blue-400' },
  { id: 'pre_flight', label: 'Pre-Flight', icon: '🔍', color: 'text-blue-400' },
  { id: 'business_case', label: 'Business Case', icon: '💼', color: 'text-blue-400' },
  { id: 'eligible', label: 'Eligible', icon: '✅', color: 'text-green-400' },
  { id: 'drafting', label: 'Drafting', icon: '✏️', color: 'text-yellow-400' },
  { id: 'functional_review', label: 'Functional Review', icon: '👥', color: 'text-purple-400' },
  { id: 'revision_required', label: 'Revision Required', icon: '🔄', color: 'text-orange-400' },
  { id: 'approval_ready', label: 'Approval Ready', icon: '📋', color: 'text-green-400' },
  { id: 'release_gate', label: 'Release Gate', icon: '🚪', color: 'text-cyan-400' },
  { id: 'approved_external', label: 'Approved External', icon: '📤', color: 'text-green-400' },
  { id: 'delivered', label: 'Delivered', icon: '📨', color: 'text-green-500' },
  { id: 'negotiation', label: 'Negotiation', icon: '🤝', color: 'text-blue-400' },
  { id: 'superseded', label: 'Superseded', icon: '📄', color: 'text-gray-500' },
  { id: 'withdrawn', label: 'Withdrawn', icon: '🗑️', color: 'text-red-400' },
];

export const STATE_COLORS: Record<string, string> = {
  not_eligible: 'bg-gray-500', intake: 'bg-blue-500', pre_flight: 'bg-blue-700',
  business_case: 'bg-blue-600', eligible: 'bg-green-500', drafting: 'bg-yellow-500',
  functional_review: 'bg-purple-500', revision_required: 'bg-orange-500',
  approval_ready: 'bg-green-600', release_gate: 'bg-cyan-500',
  approved_external: 'bg-teal-500', delivered: 'bg-green-700',
  negotiation: 'bg-indigo-500', superseded: 'bg-gray-500', withdrawn: 'bg-red-500',
};

export const STATE_META: Record<string, { group: string; groupOrder: number }> = {
  not_eligible: { group: 'Pre-Proposal', groupOrder: 0 },
  intake: { group: 'Pre-Proposal', groupOrder: 1 },
  pre_flight: { group: 'Pre-Proposal', groupOrder: 2 },
  business_case: { group: 'Pre-Proposal', groupOrder: 3 },
  eligible: { group: 'Pre-Proposal', groupOrder: 4 },
  drafting: { group: 'Drafting & Review', groupOrder: 5 },
  functional_review: { group: 'Drafting & Review', groupOrder: 6 },
  revision_required: { group: 'Drafting & Review', groupOrder: 7 },
  approval_ready: { group: 'Drafting & Review', groupOrder: 8 },
  release_gate: { group: 'Release', groupOrder: 9 },
  approved_external: { group: 'Release', groupOrder: 10 },
  delivered: { group: 'Post-Release', groupOrder: 11 },
  negotiation: { group: 'Post-Release', groupOrder: 12 },
  superseded: { group: 'Post-Release', groupOrder: 13 },
  withdrawn: { group: 'Post-Release', groupOrder: 14 },
};

export const VALID_TRANSITIONS_MAP: Record<string, string[]> = {
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