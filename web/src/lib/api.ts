const BASE = '/api/partnerships';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'unknown' }));
    throw new Error(err.message || err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

export interface Archetype {
  id: string;
  name: string;
  one_line_test: string;
  effort_tier: number;
  description: string;
  standard_components: string;
  precedent_name: string;
  precedent_template: string;
}

export interface Deal {
  id: string;
  partner_name: string;
  sector: string | null;
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
  priority_breakdown: any;
}

export interface ExecutiveData {
  queue: any[];
  funnel: any[];
  archetype_distribution: any[];
  priority_distribution: any[];
  bottlenecks: any[];
  summary: {
    total_active_deals: number;
    awaiting_triage: number;
    high_priority: number;
    blocked_deals: number;
  };
}

export const api = {
  // Intake
  submitIntake: (data: any) =>
    request<IntakeResult>('/intake', { method: 'POST', body: JSON.stringify(data) }),

  // Deals
  listDeals: (params?: Record<string, string>) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return request<{ ok: boolean; deals: Deal[]; total: number }>(`/deals${qs}`);
  },
  getDeal: (id: string) =>
    request<{ ok: boolean; deal: Deal; transitions: any[] }>(`/deals/${id}`),
  advanceStage: (id: string, stage: number, triggered_by?: string, note?: string) =>
    request<{ ok: boolean; deal: Deal }>(`/deals/${id}/stage`, {
      method: 'PATCH',
      body: JSON.stringify({ stage, triggered_by, note }),
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
    request<{ ok: boolean; archetypes: Archetype[] }>('/archetypes'),
  getArchetype: (id: string) =>
    request<{ ok: boolean; archetype: Archetype; active_deals: any[] }>(`/archetypes/${id}`),
};