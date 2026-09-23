/**
 * Catalog-grounded prompts for the Commercial Case pursuit memo.
 * Allowed IDs come only from catalog.ts. No CPO / $GIFT / claims language.
 */

import {
  ACCOUNT_STAGES,
  CASE_ASKS,
  CASE_SECTIONS,
  CLIENT_ARCHETYPES,
  COMMERCIAL_MODELS,
  LANI_CAPABILITIES,
  LANI_FEE_BANDS,
  conversionStageLabel,
  defaultAskForStage,
  feeBandRangeLabel,
  type FeeBandCatalogEntry,
} from '../catalog.js';

export const CASE_OUTPUT_SCHEMA = `{
  "headline": "string — one-line pursuit thesis",
  "situation": "string — organisation, problem, trigger",
  "why_now": "string — why this window, from the trigger or mandate",
  "why_lani": "string — capability + archetype entry point + evidence you actually have",
  "scope_workstreams": ["string — hypothesis workstreams, not a signed SOW"],
  "commercial_model": "direct|referral|consortium|joint_delivery|mou|programme|joint_market",
  "fee_band_id": "diagnostic|advisory|training|implementation|programme|consortium",
  "fee_rationale": "string — why this band. Cite the catalog range only as a hypothesis.",
  "consortium_required": false,
  "consortium_roles": ["string — who else is required, or empty if LANI alone"],
  "risks": ["string"],
  "ask_id": "intro_or_diagnostic|confirm_problem_buyer|concept_or_proposal|close_conditions",
  "ask_text": "string — one move, matching ask_id and the current stage",
  "caveats": ["string"],
  "sources": ["account fields, applied brief, supplied URL excerpt, catalog"],
  "dropped": ["invented ids, amounts, or named people you refused"]
}`;

function list(lines: string[]): string {
  return lines.map((line) => `- ${line}`).join('\n');
}

function bandLine(band: Pick<FeeBandCatalogEntry, 'id' | 'name' | 'horizon' | 'typical_work' | 'min_m' | 'max_m' | 'currency' | 'when'>): string {
  return `${band.id} — ${band.name} · ${band.horizon} · ${feeBandRangeLabel(band)}. ${band.typical_work}. ${band.when}`;
}

export function buildCaseCatalogBlock(feeBands: readonly FeeBandCatalogEntry[] = LANI_FEE_BANDS): string {
  const archetypes = CLIENT_ARCHETYPES.map((a) => {
    return `${a.id} — ${a.name}\n  Test: ${a.one_line_test}\n  Entry: ${a.entry_point}`;
  }).join('\n');
  const models = COMMERCIAL_MODELS.map((m) => `${m.id} — ${m.name}. ${m.hint}`).join('\n');
  const bands = feeBands.map(bandLine).join('\n');
  const asks = CASE_ASKS.map((a) => {
    const stages = a.for_stages.map((id) => conversionStageLabel(id)).join(', ');
    return `${a.id} — ${a.name} (${stages}). ${a.ask}`;
  }).join('\n');
  const sections = CASE_SECTIONS.map((s) => `${s.id} — ${s.name}`).join('\n');
  const stages = ACCOUNT_STAGES.map((s) => `${s.id} ${s.label}`).join(' → ');
  const capabilities = LANI_CAPABILITIES.map((c) => `- ${c}`).join('\n');

  return `CLIENT ARCHETYPES
${archetypes}

COMMERCIAL MODELS
${models}

FEE BANDS (pick one id. Ranges are a hypothesis in millions of NGN — not a bid.)
${bands}

CASE ASKS (pick one id. Prefer the ask for the current stage.)
${asks}

MEMO SECTIONS (the owner will accept these as wholes)
${sections}

CONVERSION PATH (do not change current_stage)
${stages}

LANI CAPABILITIES (cite an exact string when you name a capability)
${capabilities}`;
}

export function buildCaseSystemPrompt(feeBands: readonly FeeBandCatalogEntry[] = LANI_FEE_BANDS): string {
  return [
    'You are the Commercial Case writer for Lani Consulting (LANI).',
    'LANI is a Nigeria-first consulting and partnership engine. You draft a reviewable pursuit memo for a BD owner. You do not save the account, you do not send the memo to a client, and you do not sell.',
    'This is not a proposal pack, not a Word/PDF template, and not the frozen CPO / $GIFT / claims stack. Do not mention token economics, claims libraries, or precedent templates.',
    'Use ONLY the catalog below. Every commercial_model, fee_band_id, ask_id, and named LANI capability must be copied from this catalog or omitted.',
    '',
    buildCaseCatalogBlock(feeBands),
    '',
    'RULES',
    list([
      'The account is already Qualified or later. Write a pursuit memo, not an Intelligence brief.',
      'Treat current account fields as the owner-approved CRM. Treat the latest applied brief as accepted research. If they conflict, prefer the account and note the conflict in caveats.',
      'Ask what is changing and why LANI can credibly pursue it. Do not write a brochure.',
      'Scope is a hypothesis. Workstreams, not a signed SOW.',
      'Pick one fee_band_id. You may cite that band’s catalog range as a hypothesis. Do not invent any other naira, dollar, or numeric fee. There is no fee, amount, price, budget, or estimated_value field.',
      'Never quote a donor envelope as LANI revenue. Use consortium when LANI cannot deliver the whole build, and pick fee_band_id consortium for LANI’s slice.',
      'Pick one ask_id. Default to the ask for the current stage unless another catalog ask is clearly better. ask_text is one move, not a task list.',
      'Do not invent a named person as fact. Title-level is allowed.',
      'Do not invent a funded programme amount or a win probability.',
      'Do not set or suggest current_stage. Applying this memo must not advance the pipeline.',
      'If evidence is thin, say so in caveats and risks. Put refused inventions in dropped.',
      'Return one JSON object only, no markdown, matching this shape:',
    ]),
    CASE_OUTPUT_SCHEMA,
  ].join('\n');
}

export interface CasePromptAccount {
  id?: string;
  organisation?: string | null;
  current_stage?: number | null;
  archetype?: string | null;
  sector?: string | null;
  partnership_role?: string | null;
  geography?: string | null;
  lane?: string | null;
  commercial_model?: string | null;
  consortium_required?: boolean | null;
  decision_maker?: string | null;
  strategic_problem?: string | null;
  trigger_event?: string | null;
  lani_capability?: string | null;
  potential_partners?: string | null;
  next_action?: string | null;
  notes?: string | null;
  scores?: Record<string, number> | null;
}

export interface CasePromptBrief {
  id?: string;
  applied_at?: string | null;
  payload?: Record<string, unknown> | null;
}

export function buildCaseUserPrompt(input: {
  account: CasePromptAccount;
  applied_brief?: CasePromptBrief | null;
  source_url?: string | null;
  source_excerpt?: string | null;
  notes?: string | null;
}): string {
  const stage = Number(input.account.current_stage);
  const stageLabel = Number.isFinite(stage) ? conversionStageLabel(stage) : 'unknown';
  const suggestedAsk = Number.isFinite(stage) ? defaultAskForStage(stage) : 'intro_or_diagnostic';

  const accountSnapshot = {
    organisation: input.account.organisation || '',
    current_stage: Number.isFinite(stage) ? stage : null,
    stage_label: stageLabel,
    archetype: input.account.archetype || null,
    sector: input.account.sector || null,
    partnership_role: input.account.partnership_role || null,
    geography: input.account.geography || null,
    lane: input.account.lane || null,
    commercial_model: input.account.commercial_model || null,
    consortium_required: Boolean(input.account.consortium_required),
    decision_maker: input.account.decision_maker || null,
    strategic_problem: input.account.strategic_problem || null,
    trigger_event: input.account.trigger_event || null,
    lani_capability: input.account.lani_capability || null,
    potential_partners: input.account.potential_partners || null,
    next_action: input.account.next_action || null,
    notes: input.account.notes || null,
    scores: input.account.scores || null,
  };

  const lines = [
    `Draft a Commercial Case for ${accountSnapshot.organisation || 'this account'}.`,
    `Current stage: ${stage} ${stageLabel}. Suggested ask_id: ${suggestedAsk}.`,
    `Account (owner-approved CRM — do not include estimated_value or invent money):\n${JSON.stringify(accountSnapshot, null, 2)}`,
  ];

  if (input.applied_brief?.payload) {
    const appliedAt = input.applied_brief.applied_at || 'unknown';
    lines.push(
      `Latest applied Account Intelligence Brief (${input.applied_brief.id || 'unknown'}, applied ${appliedAt}). Do not contradict accepted fields unless the account already differs — then prefer the account and caveat.\n${JSON.stringify(input.applied_brief.payload, null, 2)}`
    );
  } else {
    lines.push('No applied Account Intelligence Brief. Use the account fields only. Do not invent research the brief would have supplied.');
  }

  if (input.notes?.trim()) lines.push(`Owner notes:\n${input.notes.trim()}`);
  if (input.source_url?.trim()) lines.push(`Source URL: ${input.source_url.trim()}`);
  if (input.source_excerpt?.trim()) lines.push(`Source excerpt:\n${input.source_excerpt.trim()}`);
  else if (input.source_url?.trim()) lines.push('Source excerpt: unavailable. Do not invent page contents.');

  lines.push('Draft the Commercial Case JSON now.');
  return lines.join('\n\n');
}
