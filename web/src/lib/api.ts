import { apiFetch } from './http'

const BASE = '/api/partnerships';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await apiFetch(`${BASE}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options?.headers },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'unknown' }));
    const details = Array.isArray(err.details) ? err.details.join('; ') : '';
    throw new Error(err.message || details || err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

export interface Archetype {
  id: string;
  name: string;
  one_line_test: string;
  typical_organisations: string[];
  problems: string[];
  lani_opportunity: string[];
  entry_point: string;
  commercial_trigger: string;
  description: string;
}

export interface SectorOverlay {
  id: string;
  name: string;
  client_or_partner: string;
  lani_offering: string;
}

export interface PartnershipRole {
  id: string;
  name: string;
  model: string;
  examples: string[];
}

export interface Geography {
  id: string;
  name: string;
  hint: string;
}

export interface CommercialTrigger {
  id: string;
  trigger: string;
  likely_opportunity: string;
}

export interface CommercialLane {
  id: string;
  name: string;
  short: string;
  horizon: string;
  description: string;
}

export interface QualificationDimension {
  id: string;
  name: string;
  question: string;
}

export interface AccountStage {
  id: number;
  label: string;
}

export interface CommercialModel {
  id: string;
  name: string;
  hint: string;
  default_for: string | null;
}

export interface FeeBand {
  id: string;
  name: string;
  horizon: string;
  typical_work: string;
  currency: 'NGN';
  min_m: number;
  max_m: number;
  when: string;
  archived: boolean;
  updated_at?: string | null;
  updated_by?: string | null;
  catalog_default: {
    name: string;
    horizon: string;
    typical_work: string;
    currency: 'NGN';
    min_m: number;
    max_m: number;
    when: string;
  };
}

export type FeeBandPatch = Partial<
  Pick<FeeBand, 'name' | 'horizon' | 'typical_work' | 'min_m' | 'max_m' | 'when' | 'archived'>
> & { restore?: boolean };

export interface CoachStall {
  id: string;
  name: string;
  when: string;
  owner_move: string;
  for_stages: number[];
  severity: 'block' | 'advice' | 'off';
  archived: boolean;
  updated_at?: string | null;
  updated_by?: string | null;
  catalog_default: {
    name: string;
    when: string;
    owner_move: string;
  };
}

export type CoachStallPatch = Partial<
  Pick<CoachStall, 'name' | 'when' | 'owner_move' | 'archived'>
> & { restore?: boolean };

export interface CaseAsk {
  id: string;
  name: string;
  for_stages: number[];
  ask: string;
}

export interface CaseLocks {
  min_stage: number;
  sections: { id: string; name: string; fields: string[] }[];
  apply_account_fields: string[];
  forbidden_account_fields: string[];
}

export const COACH_FIELDS = [
  { id: 'next_action', name: 'Next action' },
  { id: 'suggested_decision_date', name: 'Suggested decision date' },
  { id: 'why', name: 'Why' },
] as const;

export type CoachFieldId = (typeof COACH_FIELDS)[number]['id'];

export const COACH_APPLY_ACCOUNT_FIELDS = [
  'next_action',
  'expected_decision_date',
] as const;

export type CoachApplyAccountField = (typeof COACH_APPLY_ACCOUNT_FIELDS)[number];

export interface CoachLocks {
  scope: 'account';
  min_stage: number;
  max_stage: number;
  date_min_stage: number;
  fields: { id: string; name: string }[];
  apply_account_fields: string[];
  forbidden_account_fields: string[];
  draft_keys: string[];
  rules_require_ai: boolean;
  polish_requires_ai: boolean;
}

export interface CoachDraft {
  stall_reason_id: string | null;
  supporting_reason_ids: string[];
  next_action: string | null;
  ask_id: string | null;
  name_partner: boolean;
  suggested_decision_date: string | null;
  why: string | null;
  evidence: string[];
  caveats: string[];
  sources: string[];
  dropped: string[];
  polished: boolean;
}

export interface ConversionAdvice {
  id: string;
  account_id: string;
  status: 'draft' | 'applied' | 'discarded';
  payload: CoachDraft;
  accepted_fields: CoachFieldId[] | string[];
  model: string | null;
  provider: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  applied_at: string | null;
}

export interface CoachResponse {
  ok: boolean;
  advice: ConversionAdvice;
  fields: typeof COACH_FIELDS | { id: string; name: string }[];
  apply_account_fields: readonly string[];
  ai?: { configured: boolean; provider: string; model?: string };
}

export const CONVERSION_GAP_LABELS: Record<string, string> = {
  next_action: 'Set a next action',
  expected_decision_date: 'Set an expected decision date',
  delivery_partner: 'Name the delivery partner — consortium is required',
};

export interface AccountScores {
  strategic_fit: number;
  access: number;
  commercial: number;
  urgency: number;
  conversion: number;
}

export interface Account {
  id: string;
  organisation: string;
  archetype: string;
  sector: string | null;
  partnership_role: string;
  geography: string;
  lane: string;
  current_stage: number;
  decision_maker: string | null;
  contact_email: string | null;
  relationship_owner: string | null;
  strategic_problem: string | null;
  trigger_event: string | null;
  lani_capability: string | null;
  potential_partners: string | null;
  estimated_value: number | null;
  probability: number | null;
  expected_decision_date: string | null;
  revenue_originated: number;
  revenue_influenced: number;
  next_action: string | null;
  notes: string | null;
  consortium_required: boolean;
  commercial_model?: string | null;
  delivery_partner_account_id?: string | null;
  delivery_partner_name?: string | null;
  conversion_gaps?: string[];
  opportunity_count?: number;
  score_strategic_fit: number;
  score_access: number;
  score_commercial: number;
  score_urgency: number;
  score_conversion: number;
  internal_priority: number | null;
  scores: AccountScores;
  is_archived: number;
  created_at: string;
  updated_at: string;
}

export const APPLYABLE_BRIEF_FIELDS = [
  'archetype',
  'sector',
  'partnership_role',
  'geography',
  'lane',
  'commercial_model',
  'trigger_event',
  'strategic_problem',
  'lani_capability',
  'decision_maker',
  'consortium_required',
  'next_action',
  'score_strategic_fit',
  'score_access',
  'score_commercial',
  'score_urgency',
  'score_conversion',
] as const;

export type ApplyableBriefField = (typeof APPLYABLE_BRIEF_FIELDS)[number];

export interface BriefScores {
  strategic_fit: number | null;
  access: number | null;
  commercial: number | null;
  urgency: number | null;
  conversion: number | null;
}

export interface BriefDraft {
  summary: string | null;
  archetype: string | null;
  archetype_confidence: 'high' | 'medium' | 'low' | null;
  archetype_test_used: string | null;
  sector: string | null;
  partnership_role: string | null;
  geography: string | null;
  lane: string | null;
  commercial_model: string | null;
  trigger_event: string | null;
  trigger_id: string | null;
  strategic_problem: string | null;
  lani_capability: string | null;
  decision_maker: string | null;
  consortium_required: boolean;
  scores: BriefScores;
  score_reasons: Record<keyof BriefScores, string | null>;
  next_action: string | null;
  caveats: string[];
  sources: string[];
  dropped: string[];
}

export interface AccountBrief {
  id: string;
  account_id: string | null;
  organisation: string | null;
  status: 'draft' | 'applied' | 'discarded';
  payload: BriefDraft;
  model: string | null;
  provider: string | null;
  source_url: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  applied_at: string | null;
}

export interface BriefResponse {
  ok: boolean;
  brief: AccountBrief;
  applyable_fields: readonly string[];
  ai?: { configured: boolean; provider: string; model?: string };
}

export const CASE_SECTIONS = [
  { id: 'situation', name: 'Situation', fields: ['headline', 'situation', 'why_now'] },
  { id: 'why_lani', name: 'Why LANI', fields: ['why_lani'] },
  { id: 'scope', name: 'Scope hypothesis', fields: ['scope_workstreams'] },
  { id: 'commercial', name: 'Commercial', fields: ['commercial_model', 'fee_band_id', 'fee_rationale'] },
  { id: 'consortium', name: 'Consortium', fields: ['consortium_required', 'consortium_roles'] },
  { id: 'risks', name: 'Risks and unknowns', fields: ['risks'] },
  { id: 'ask', name: 'The ask', fields: ['ask_id', 'ask_text'] },
  { id: 'caveats', name: 'Caveats and sources', fields: ['caveats', 'sources'] },
] as const;

export type CaseSectionId = (typeof CASE_SECTIONS)[number]['id'];

export const CASE_APPLY_ACCOUNT_FIELDS = [
  'commercial_model',
  'consortium_required',
  'next_action',
] as const;

export type CaseApplyAccountField = (typeof CASE_APPLY_ACCOUNT_FIELDS)[number];

export interface CaseDraft {
  headline: string | null;
  situation: string | null;
  why_now: string | null;
  why_lani: string | null;
  scope_workstreams: string[];
  commercial_model: string | null;
  fee_band_id: string | null;
  fee_rationale: string | null;
  consortium_required: boolean;
  consortium_roles: string[];
  risks: string[];
  ask_id: string | null;
  ask_text: string | null;
  caveats: string[];
  sources: string[];
  dropped: string[];
}

export interface CommercialCase {
  id: string;
  account_id: string;
  status: 'draft' | 'applied' | 'discarded';
  payload: CaseDraft;
  accepted_sections: CaseSectionId[] | string[];
  model: string | null;
  provider: string | null;
  source_url: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  applied_at: string | null;
}

export interface CaseResponse {
  ok: boolean;
  case: CommercialCase;
  sections: typeof CASE_SECTIONS | { id: string; name: string; fields: string[] }[];
  apply_account_fields: readonly string[];
  ai?: { configured: boolean; provider: string; model?: string };
}

export interface Deal {
  id: string;
  partner_name: string;
  sector: string | null;
  partnership_role: string | null;
  geography: string | null;
  account_id?: string | null;
  lane?: string | null;
  trigger_event?: string | null;
  decision_maker?: string | null;
  account_next_action?: string | null;
  account_internal_priority?: number | null;
  consortium_required?: boolean;
  commercial_model?: string | null;
  delivery_partner_account_id?: string | null;
  delivery_partner_name?: string | null;
  next_action?: string | null;
  expected_decision_date?: string | null;
  conversion_gaps?: string[];
  account_organisation?: string | null;
  deal_stage: string | null;
  description: string | null;
  archetype: string;
  is_repeat: number;
  novelty_level: number;
  revenue_potential: number;
  strategic_fit: number;
  effort_tier: number;
  novelty_penalty: number;
  priority_score: number | null;
  queue_position: number | null;
  current_stage: number;
  blocking_factor: string | null;
  bd_owner: string | null;
  tech_owner: string | null;
  urgency: string | null;
  compliance_flags: string | null;
  triage_classification_corrected: string | null;
  triage_novelty_flag: string | null;
  triage_response_at: string | null;
  triage_responded_by: string | null;
  is_archived: number;
  created_at: string;
  updated_at: string;
}

export interface IntakeResult {
  ok: boolean;
  deal: Deal;
  account?: Account;
  scores?: AccountScores;
  priority_breakdown: any;
}

export interface ExecutiveData {
  queue: any[];
  funnel: any[];
  lanes?: { id: string; name: string; short: string; horizon: string; count: number }[];
  archetype_distribution: any[];
  trigger_distribution?: { trigger_event: string; count: number }[];
  priority_distribution: any[];
  bottlenecks: any[];
  summary: {
    total_active_deals: number;
    working?: number;
    in_conversation?: number;
    at_proposal?: number;
    won?: number;
    high_priority: number;
    stalled?: number;
    awaiting_triage: number;
    blocked_deals: number;
    missing_next_action?: number;
    unnamed_consortium?: number;
    ecosystem_partners?: number;
  };
}

export const api = {
  // Intake
  submitIntake: (data: any) =>
    request<IntakeResult>('/intake', { method: 'POST', body: JSON.stringify(data) }),

  // Deals
  listDeals: (params?: Record<string, string>) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return request<{ ok: boolean; deals: Deal[]; total: number; lane_counts?: Record<string, number> }>(`/deals${qs}`);
  },
  getDeal: (id: string) =>
    request<{ ok: boolean; deal: Deal; transitions: any[] }>(`/deals/${id}`),
  advanceStage: (id: string, stage: number, triggered_by?: string, note?: string, extra?: {
    next_action?: string | null;
    expected_decision_date?: string | null;
    delivery_partner_account_id?: string | null;
  }) =>
    request<{ ok: boolean; deal: Deal }>(`/deals/${id}/stage`, {
      method: 'PATCH',
      body: JSON.stringify({ stage, triggered_by, note, ...extra }),
    }),
  updateBlocker: (id: string, blocking_factor: string) =>
    request<{ ok: boolean; deal: Deal }>(`/deals/${id}/blocker`, {
      method: 'PATCH',
      body: JSON.stringify({ blocking_factor }),
    }),
  updateOwners: (id: string, owners: { bd_owner?: string; tech_owner?: string }) =>
    request<{ ok: boolean; deal: Deal }>(`/deals/${id}/owner`, {
      method: 'PATCH',
      body: JSON.stringify(owners),
    }),
  rescorePriority: (id: string, data: any) =>
    request<{ ok: boolean; deal: Deal }>(`/deals/${id}/priority`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
  archiveDeal: (id: string) =>
    request<{ ok: boolean }>(`/deals/${id}`, { method: 'DELETE' }),
  updateDeal: (id: string, data: any) =>
    request<{ ok: boolean; deal: Deal }>(`/deals/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  // Triage
  submitTriage: (id: string, data: any) =>
    request<{ ok: boolean; deal: Deal }>(`/triage/${id}/triage`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
  sendTriageReminder: (id: string) =>
    request<{ ok: boolean }>(`/triage/remind/${id}`, { method: 'POST' }),

  // Executive
  getExecutive: () => request<ExecutiveData>('/executive'),

  // Metrics
  getMetrics: () => request<any>('/metrics'),

  // Archetypes
  listArchetypes: () =>
    request<{
      ok: boolean;
      archetypes: Archetype[];
      sectors: SectorOverlay[];
      partnership_roles: PartnershipRole[];
      geographies: Geography[];
      commercial_triggers: CommercialTrigger[];
      lanes: CommercialLane[];
      qualification_dimensions: QualificationDimension[];
      account_stages: AccountStage[];
      lani_capabilities: string[];
      commercial_models?: CommercialModel[];
      conversion_gap_labels?: Record<string, string>;
      fee_bands?: FeeBand[];
      coach_stalls?: CoachStall[];
      case_asks?: CaseAsk[];
      case_locks?: CaseLocks;
      coach_locks?: CoachLocks;
    }>('/archetypes'),
  getArchetype: (id: string) =>
    request<{ ok: boolean; archetype: Archetype; active_deals: any[] }>(`/archetypes/${id}`),
  updateFeeBand: (id: string, data: FeeBandPatch) =>
    request<{ ok: boolean; fee_band: FeeBand }>(`/archetypes/fee-bands/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
  updateCoachStall: (id: string, data: CoachStallPatch) =>
    request<{ ok: boolean; stall: CoachStall }>(`/archetypes/stalls/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  listAccounts: (params?: Record<string, string>) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return request<{
      ok: boolean;
      accounts: Account[];
      total: number;
      lane_counts: Record<string, number>;
      role_counts?: Record<string, number>;
      missing_discipline?: number;
    }>(`/accounts${qs}`);
  },
  getAccount: (id: string) =>
    request<{
      ok: boolean;
      account: Account;
      opportunities: Deal[];
      delivery_partner?: Account | null;
      spawned?: Deal[];
    }>(`/accounts/${id}`),
  createAccount: (data: any) =>
    request<{ ok: boolean; account: Account }>('/accounts', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  updateAccount: (id: string, data: any) =>
    request<{ ok: boolean; account: Account }>(`/accounts/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
  archiveAccount: (id: string) =>
    request<{ ok: boolean }>(`/accounts/${id}`, { method: 'DELETE' }),
  getAiStatus: () =>
    request<{ ok: boolean; ai: { configured: boolean; provider: string; model?: string } }>('/accounts/ai-status'),
  researchBrief: (data: {
    organisation: string;
    source_url?: string;
    notes?: string;
    geography?: string;
    partnership_role?: string;
    sector?: string;
  }) =>
    request<BriefResponse>('/accounts/brief', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  researchAccountBrief: (id: string, data?: { source_url?: string; notes?: string }) =>
    request<BriefResponse>(`/accounts/${id}/brief`, {
      method: 'POST',
      body: JSON.stringify(data || {}),
    }),
  getBrief: (briefId: string) =>
    request<BriefResponse>(`/accounts/briefs/${briefId}`),
  getLatestBrief: (accountId: string) =>
    request<BriefResponse>(`/accounts/${accountId}/brief`),
  applyBrief: (accountId: string, briefId: string, accepted_fields: ApplyableBriefField[] | string[]) =>
    request<{
      ok: boolean;
      brief: AccountBrief;
      applied: string[];
      account: Account;
    }>(`/accounts/${accountId}/brief/${briefId}/apply`, {
      method: 'POST',
      body: JSON.stringify({ accepted_fields }),
    }),
  generateCase: (accountId: string, data?: { source_url?: string; notes?: string }) =>
    request<CaseResponse>(`/accounts/${accountId}/case`, {
      method: 'POST',
      body: JSON.stringify(data || {}),
    }),
  getLatestCase: (accountId: string) =>
    request<CaseResponse>(`/accounts/${accountId}/case`),
  applyCase: (
    accountId: string,
    caseId: string,
    data: {
      accepted_sections: CaseSectionId[] | string[];
      account_fields?: CaseApplyAccountField[] | string[];
    }
  ) =>
    request<{
      ok: boolean;
      case: CommercialCase;
      accepted_sections: string[];
      applied_account_fields: string[];
      account: Account;
    }>(`/accounts/${accountId}/case/${caseId}/apply`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  generateCoach: (accountId: string, data?: { polish?: boolean }) =>
    request<CoachResponse>(`/accounts/${accountId}/coach`, {
      method: 'POST',
      body: JSON.stringify(data || {}),
    }),
  getLatestCoach: (accountId: string) =>
    request<CoachResponse>(`/accounts/${accountId}/coach`),
  applyCoach: (
    accountId: string,
    adviceId: string,
    data: {
      accepted_fields: CoachFieldId[] | string[];
      account_fields?: CoachApplyAccountField[] | string[];
    }
  ) =>
    request<{
      ok: boolean;
      advice: ConversionAdvice;
      accepted_fields: string[];
      applied_account_fields: string[];
      account: Account;
    }>(`/accounts/${accountId}/coach/${adviceId}/apply`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  createAccountFromBrief: (
    briefId: string,
    data: { accepted_fields: ApplyableBriefField[] | string[]; organisation?: string; relationship_owner?: string }
  ) =>
    request<{
      ok: boolean;
      brief: AccountBrief;
      applied: string[];
      account: Account;
    }>(`/accounts/brief/${briefId}/create`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
};