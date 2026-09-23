/**
 * Catalog-grounded system prompt for Account Intelligence Brief.
 * Allowed values come only from catalog.ts — do not invent IDs here.
 */

import {
  ACCOUNT_STAGES,
  CLIENT_ARCHETYPES,
  COMMERCIAL_LANES,
  COMMERCIAL_MODELS,
  COMMERCIAL_TRIGGERS,
  GEOGRAPHIES,
  LANI_CAPABILITIES,
  PARTNERSHIP_ROLES,
  QUALIFICATION_DIMENSIONS,
  SECTORS,
} from '../catalog.js';

export const BRIEF_OUTPUT_SCHEMA = `{
  "summary": "string — 2–4 sentences on the organisation and why LANI might care",
  "archetype": "A|B|C|D|E|F",
  "archetype_confidence": "high|medium|low",
  "archetype_test_used": "string — the one-line test you applied",
  "sector": "catalog sector id or null",
  "partnership_role": "end_client|channel|delivery|institutional|ecosystem",
  "geography": "NG|ECOWAS|GLOBAL",
  "lane": "immediate|strategic|channel|emerging",
  "commercial_model": "direct|referral|consortium|joint_delivery|mou|programme|joint_market",
  "trigger_event": "exact trigger string from the catalog, or Unspecified",
  "trigger_id": "catalog trigger id or null",
  "strategic_problem": "string — what is changing, not a sales pitch",
  "lani_capability": "exact string from LANI capabilities, or null",
  "decision_maker": "title-level if the person is not known; never invent a named individual as fact",
  "consortium_required": false,
  "scores": {
    "strategic_fit": 1,
    "access": 1,
    "commercial": 1,
    "urgency": 1,
    "conversion": 1
  },
  "score_reasons": {
    "strategic_fit": "one line",
    "access": "one line",
    "commercial": "one line",
    "urgency": "one line",
    "conversion": "one line"
  },
  "next_action": "suggested first Intelligence step, or null",
  "caveats": ["string"],
  "sources": ["what you used: supplied fields, supplied URL excerpt, catalog only"]
}`;

function list(lines: string[]): string {
  return lines.map((line) => `- ${line}`).join('\n');
}

function catalogBlock(): string {
  const archetypes = CLIENT_ARCHETYPES.map((a) => {
    const caps = a.lani_opportunity.join('; ');
    return `${a.id} — ${a.name}\n  Test: ${a.one_line_test}\n  Trigger: ${a.commercial_trigger}\n  LANI opportunity: ${caps}`;
  }).join('\n');

  const sectors = SECTORS.map((s) => `${s.id} — ${s.name} (${s.lani_offering})`).join('\n');
  const roles = PARTNERSHIP_ROLES.map((r) => `${r.id} — ${r.name}. ${r.model}`).join('\n');
  const models = COMMERCIAL_MODELS.map((m) => {
    const def = m.default_for ? ` Default for ${m.default_for}.` : '';
    return `${m.id} — ${m.name}. ${m.hint}${def}`;
  }).join('\n');
  const geos = GEOGRAPHIES.map((g) => `${g.id} — ${g.name}. ${g.hint}`).join('\n');
  const lanes = COMMERCIAL_LANES.map((l) => `${l.id} — ${l.short} ${l.name} (${l.horizon}). ${l.description}`).join('\n');
  const triggers = COMMERCIAL_TRIGGERS.map((t) => `${t.id} — ${t.trigger} → ${t.likely_opportunity}`).join('\n');
  const scores = QUALIFICATION_DIMENSIONS.map((d) => `${d.id} — ${d.name}: ${d.question}`).join('\n');
  const stages = ACCOUNT_STAGES.map((s) => `${s.id} ${s.label}`).join(' → ');
  const capabilities = LANI_CAPABILITIES.map((c) => `- ${c}`).join('\n');

  return `CLIENT ARCHETYPES
${archetypes}

SECTORS
${sectors}

PARTNERSHIP ROLES
${roles}

COMMERCIAL MODELS
${models}

GEOGRAPHIES
${geos}

COMMERCIAL LANES
${lanes}

COMMERCIAL TRIGGERS
${triggers}

QUALIFICATION (score each 1–5; average is internal sort only)
${scores}

CONVERSION PATH (do not advance past Intelligence)
${stages}

LANI CAPABILITIES (pick one exact string, or null)
${capabilities}`;
}

export function buildBriefSystemPrompt(): string {
  return [
    'You are the Account Intelligence researcher for Lani Consulting (LANI).',
    'LANI is a Nigeria-first consulting and partnership engine. You draft a reviewable brief for a BD owner. You do not save accounts and you do not sell.',
    'Classify the organisation using ONLY the catalog below. Every id, trigger string, capability, lane, role, model, sector, and geography must be copied from this catalog or set to null / Unspecified.',
    '',
    catalogBlock(),
    '',
    'RULES',
    list([
      'Ask what is changing inside the organisation, not only whether LANI can sell something.',
      'Default geography is NG unless the mandate is clearly ECOWAS or GLOBAL.',
      'Do not map only end clients. Channel, delivery, institutional, and ecosystem roles are valid.',
      'Default commercial_model from the role unless the relationship is clearly different.',
      'Do not invent a named person as fact. Title-level is allowed (e.g. Permanent Secretary, Budget).',
      'Do not invent a funded programme amount or a probability of win.',
      'Do not set current_stage. The brief is Intelligence only.',
      'Scores are 1–5 integers. If evidence is thin, score 2–3 and say so in score_reasons.',
      'Access should stay low unless a real route to the decision-maker is in the supplied context.',
      'If LANI cannot credibly deliver the whole scope, set consortium_required true.',
      'next_action is a suggested first step, not a commitment.',
      'If you are guessing, put the guess in caveats.',
      'Return one JSON object only, no markdown, matching this shape:',
    ]),
    BRIEF_OUTPUT_SCHEMA,
  ].join('\n');
}

export function buildBriefUserPrompt(input: {
  organisation: string;
  geography?: string | null;
  partnership_role?: string | null;
  sector?: string | null;
  notes?: string | null;
  source_excerpt?: string | null;
  source_url?: string | null;
  existing?: Record<string, unknown> | null;
}): string {
  const lines = [
    `Organisation: ${input.organisation.trim()}`,
    `Geography (hint): ${input.geography || 'NG'}`,
    `Partnership role (hint): ${input.partnership_role || 'unspecified'}`,
    `Sector (hint): ${input.sector || 'unspecified'}`,
  ];
  if (input.notes?.trim()) lines.push(`Owner notes:\n${input.notes.trim()}`);
  if (input.source_url?.trim()) lines.push(`Source URL: ${input.source_url.trim()}`);
  if (input.source_excerpt?.trim()) lines.push(`Source excerpt:\n${input.source_excerpt.trim()}`);
  if (input.existing && Object.keys(input.existing).length) {
    lines.push(`Existing account fields (do not treat as ground truth):\n${JSON.stringify(input.existing)}`);
  }
  lines.push('Draft the Account Intelligence Brief JSON now.');
  return lines.join('\n\n');
}
