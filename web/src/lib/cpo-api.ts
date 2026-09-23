/** CPO API bindings — extend the existing api object */

import type { ProposalDetail, DashboardData, ClaimRecord } from './cpo-types';
import { apiFetch } from './http';

const BASE = '/api/partnerships';

async function req<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await apiFetch(`${BASE}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options?.headers },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'unknown' }));
    throw new Error(err.message || err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

/** Extract proposal_id from nested route params for mergeParams routers */
function proposalPath(proposalId: string, sub: string) {
  return `/proposals/${proposalId}${sub}`;
}

export const cpoApi = {
  /* ─── Proposals ─── */
  listProposals: (params?: Record<string, string>) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return req<{ ok: boolean; proposals: any[]; total: number }>(`/proposals${qs}`);
  },
  getProposal: (id: string) => req<ProposalDetail>(`/proposals/${id}`),
  promoteDeal: (dealId: string, data?: any) =>
    req<{ ok: boolean; proposal: any }>(`/proposals/promote/${dealId}`, { method: 'POST', body: JSON.stringify(data || {}) }),
  promoteBd: (data: any) =>
    req<{ ok: boolean; proposal: any }>('/proposals/promote-bd', { method: 'POST', body: JSON.stringify(data) }),
  updateProposal: (id: string, data: any) =>
    req<{ ok: boolean; proposal: any }>(`/proposals/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  transitionProposal: (id: string, to: string, actor?: string, note?: string) =>
    req<{ ok: boolean; proposal: any; release_gate?: any }>(`/proposals/${id}/transition`, {
      method: 'POST', body: JSON.stringify({ to, actor, note }),
    }),
  archiveProposal: (id: string) =>
    req<{ ok: boolean }>(`/proposals/${id}`, { method: 'DELETE', body: JSON.stringify({}) }),
  generateDocument: async (id: string): Promise<{ ok: true; document?: string; version?: number } | { ok: false; error: string; blockers?: { name: string; detail: string }[] }> => {
    const res = await apiFetch(`${BASE}/proposals/${id}/generate`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
      return { ok: false, error: err.error || `HTTP ${res.status}`, blockers: err.blockers };
    }
    return { ok: true, ...(await res.json()) };
  },

  /* ─── Export DOCX ─── */
  exportDocx: async (id: string): Promise<{ ok: true; blob: Blob; filename: string } | { ok: false; error: string; blockers?: { name: string; detail: string }[] }> => {
    const res = await apiFetch(`${BASE}/proposals/${id}/export-docx`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
      return { ok: false, error: err.error || err.blockers?.join(', ') || `HTTP ${res.status}`, blockers: err.blockers };
    }
    const disposition = res.headers.get('Content-Disposition') || '';
    const match = disposition.match(/filename="?([^";]+)"?/);
    const filename = match ? match[1] : `proposal-${id}.docx`;
    return { ok: true, blob: await res.blob(), filename };
  },

  /* ─── Dashboard ─── */
  dashboard: () => req<{ ok: boolean } & DashboardData>('/proposals/dashboard/summary'),

  /* ─── Pre-Flight ─── */
  getPreflight: (id: string) => req<any>(`/proposals/${id}/preflight`),
  checkPreflight: (id: string, itemId: number, checked: boolean, checkedBy?: string) =>
    req<any>(`/proposals/${id}/preflight/${itemId}`, { method: 'PATCH', body: JSON.stringify({ is_checked: checked, checked_by: checkedBy }) }),

  /* ─── Assumptions ─── */
  getAssumptions: (id: string) => req<any>(`/proposals/${id}/assumptions`),
  addAssumption: (id: string, data: any) =>
    req<any>(`/proposals/${id}/assumptions`, { method: 'POST', body: JSON.stringify(data) }),
  updateAssumption: (id: string, assumptionId: number, data: any) =>
    req<any>(`/proposals/${id}/assumptions/${assumptionId}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteAssumption: (id: string, assumptionId: number) =>
    req<any>(`/proposals/${id}/assumptions/${assumptionId}`, { method: 'DELETE' }),

  /* ─── Risks ─── */
  getRisks: (id: string) => req<any>(`/proposals/${id}/risks`),
  addRisk: (id: string, data: any) =>
    req<any>(`/proposals/${id}/risks`, { method: 'POST', body: JSON.stringify(data) }),
  updateRisk: (id: string, riskId: number, data: any) =>
    req<any>(`/proposals/${id}/risks/${riskId}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteRisk: (id: string, riskId: number) =>
    req<any>(`/proposals/${id}/risks/${riskId}`, { method: 'DELETE' }),

  /* ─── Discussion Points ─── */
  getDiscussionPoints: (id: string) => req<any>(`/proposals/${id}/discussion-points`),
  addDiscussionPoint: (id: string, data: any) =>
    req<any>(`/proposals/${id}/discussion-points`, { method: 'POST', body: JSON.stringify(data) }),
  updateDiscussionPoint: (id: string, dpId: number, data: any) =>
    req<any>(`/proposals/${id}/discussion-points/${dpId}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteDiscussionPoint: (id: string, dpId: number) =>
    req<any>(`/proposals/${id}/discussion-points/${dpId}`, { method: 'DELETE' }),

  /* ─── Conditional Modules ─── */
  getModules: (id: string) => req<any>(`/proposals/${id}/modules`),
  toggleModule: (id: string, data: any) =>
    req<any>(`/proposals/${id}/modules`, { method: 'POST', body: JSON.stringify(data) }),
  addFee: (id: string, data: any) =>
    req<any>(`/proposals/${id}/fees`, { method: 'POST', body: JSON.stringify(data) }),
  addTier: (id: string, data: any) =>
    req<any>(`/proposals/${id}/tiers`, { method: 'POST', body: JSON.stringify(data) }),

  /* ─── Claims ─── */
  listClaims: () => req<{ ok: boolean; claims: ClaimRecord[] }>('/claims'),
  getClaim: (id: string) => req<{ ok: boolean; claim: ClaimRecord }>(`/claims/${id}`),
  updateClaim: (id: string, data: any) =>
    req<{ ok: boolean; claim: ClaimRecord }>(`/claims/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  seedClaims: () => req<{ ok: boolean; inserted: number; total: number }>('/claims/seed', { method: 'POST' }),
  proposalClaims: (proposalId: string) => req<any>(`/proposals/${proposalId}/claims`),
  attachClaim: (proposalId: string, claimId: string, section?: string) =>
    req<any>(`/proposals/${proposalId}/claims`, { method: 'POST', body: JSON.stringify({ claim_id: claimId, section }) }),
  detachClaim: (proposalId: string, claimId: string) =>
    req<any>(`/proposals/${proposalId}/claims/${claimId}`, { method: 'DELETE' }),

  /* ─── Approvals ─── */
  seedApprovals: (proposalId: string) => req<any>(proposalPath(proposalId, '/approvals/seed'), { method: 'POST' }),
  getApprovals: (proposalId: string) => req<any>(proposalPath(proposalId, '/approvals')),
  submitApproval: (proposalId: string, functionArea: string, data: any) =>
    req<any>(proposalPath(proposalId, `/approvals/${functionArea}`), { method: 'PATCH', body: JSON.stringify(data) }),

  /* ─── Economics ─── */
  saveEconomics: (proposalId: string, data: any) =>
    req<any>(proposalPath(proposalId, '/economics'), { method: 'POST', body: JSON.stringify(data) }),

  /* ─── Release Gate ─── */
  runRelease: (proposalId: string) =>
    req<any>(proposalPath(proposalId, '/release/run'), { method: 'POST', body: JSON.stringify({}) }),
  releaseStatus: (proposalId: string) =>
    req<any>(proposalPath(proposalId, '/release')),

  /* ─── Responsibilities (template §2.4/2.5 + §7.5) ─── */
  getResponsibilities: (proposalId: string) =>
    req<any>(proposalPath(proposalId, '/responsibilities')),
  addResponsibility: (proposalId: string, data: any) =>
    req<any>(proposalPath(proposalId, '/responsibilities'), { method: 'POST', body: JSON.stringify(data) }),
  updateResponsibility: (proposalId: string, respId: number, data: any) =>
    req<any>(proposalPath(proposalId, `/responsibilities/${respId}`), { method: 'PATCH', body: JSON.stringify(data) }),
  deleteResponsibility: (proposalId: string, respId: number) =>
    req<any>(proposalPath(proposalId, `/responsibilities/${respId}`), { method: 'DELETE', body: JSON.stringify({}) }),
  seedResponsibilities: (proposalId: string) =>
    req<any>(proposalPath(proposalId, '/responsibilities/seed'), { method: 'POST', body: JSON.stringify({}) }),

  /* ─── BD Prospecting Tracker ─── */
  listBDTargets: (params?: Record<string, string>) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return req<{ ok: boolean; targets: any[]; total: number; stages: any[] }>(`/bd-prospecting${qs}`);
  },
  getBDTarget: (id: string) => req<{ ok: boolean; target: any }>(`/bd-prospecting/${id}`),
  updateBDStatus: (id: string, status: number, note?: string) =>
    req<{ ok: boolean; target: any; created_deal?: any }>(`/bd-prospecting/${id}/status`, {
      method: 'PATCH', body: JSON.stringify({ status, note }),
    }),
  updateBDTarget: (id: string, data: any) =>
    req<{ ok: boolean; target: any }>(`/bd-prospecting/${id}`, {
      method: 'PATCH', body: JSON.stringify(data),
    }),
  createBDTarget: (data: any) =>
    req<{ ok: boolean; target: any }>('/bd-prospecting', {
      method: 'POST', body: JSON.stringify(data),
    }),
  archiveBDTarget: (id: string) =>
    req<{ ok: boolean }>(`/bd-prospecting/${id}`, { method: 'DELETE' }),
  linkBDToProposal: (id: string, proposal_id: string) =>
    req<{ ok: boolean; target: any }>(`/bd-prospecting/${id}/link-proposal`, {
      method: 'PATCH', body: JSON.stringify({ proposal_id }),
    }),
  seedBDTargets: () =>
    req<{ ok: boolean; seeded?: number; skipped?: boolean }>('/bd-prospecting/seed', { method: 'POST' }),

  /* ─── Commercial & Partnership Terms (template §9) ─── */
  getTerms: (proposalId: string) =>
    req<any>(proposalPath(proposalId, '/terms')),
  saveTerms: (proposalId: string, data: any) =>
    req<any>(proposalPath(proposalId, '/terms'), { method: 'PUT', body: JSON.stringify(data) }),
  addMetric: (proposalId: string, data: any) =>
    req<any>(proposalPath(proposalId, '/metrics'), { method: 'POST', body: JSON.stringify(data) }),
  updateMetric: (proposalId: string, metricId: number, data: any) =>
    req<any>(proposalPath(proposalId, `/metrics/${metricId}`), { method: 'PATCH', body: JSON.stringify(data) }),
  deleteMetric: (proposalId: string, metricId: number) =>
    req<any>(proposalPath(proposalId, `/metrics/${metricId}`), { method: 'DELETE', body: JSON.stringify({}) }),
};