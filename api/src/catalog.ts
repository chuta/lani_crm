/** LANI Consulting commercial catalog — client archetypes, sectors, partner roles, geography. */

export const ARCHETYPE_IDS = ['A', 'B', 'C', 'D', 'E', 'F'] as const;
export type ArchetypeId = (typeof ARCHETYPE_IDS)[number];

export function isArchetypeId(value: unknown): value is ArchetypeId {
  return typeof value === 'string' && (ARCHETYPE_IDS as readonly string[]).includes(value);
}

export const GEOGRAPHIES = [
  { id: 'NG', name: 'Nigeria', hint: 'Default. Federal, state, and domestic private-sector work.' },
  { id: 'ECOWAS', name: 'ECOWAS (ex-Nigeria)', hint: 'West African programmes and regional institutions outside Nigeria.' },
  { id: 'GLOBAL', name: 'Global / international', hint: 'Headquarters, donor capitals, and cross-border mandates.' },
] as const;
export type GeographyId = (typeof GEOGRAPHIES)[number]['id'];
export const DEFAULT_GEOGRAPHY: GeographyId = 'NG';

export function isGeographyId(value: unknown): value is GeographyId {
  return typeof value === 'string' && GEOGRAPHIES.some((g) => g.id === value);
}

export const PARTNERSHIP_ROLES = [
  {
    id: 'end_client',
    name: 'End client',
    model: 'Direct advisory, implementation, training, or programme engagement.',
    examples: ['A ministry buying transformation support', 'A bank commissioning a digital programme', 'An NGO needing M&E'],
  },
  {
    id: 'channel',
    name: 'Channel partner',
    model: 'Referral agreement, joint proposal, co-delivery, or revenue sharing.',
    examples: ['Accounting and audit firms', 'Law firms', 'Banks', 'Industry associations', 'Chambers of commerce', 'Technology vendors', 'Business advisory firms'],
  },
  {
    id: 'delivery',
    name: 'Delivery partner',
    model: 'Consortium bids, subcontracting, joint delivery, and integrated solutions.',
    examples: ['Technology implementation companies', 'Research institutions', 'Universities', 'Engineering firms', 'Specialist training providers', 'M&E firms'],
  },
  {
    id: 'institutional',
    name: 'Institutional partner',
    model: 'Strategic MoU, programme partnership, capacity-building initiative, or framework agreement.',
    examples: ['Government agencies', 'Development finance institutions', 'Donor organisations', 'Professional bodies', 'Universities', 'Industry associations'],
  },
  {
    id: 'ecosystem',
    name: 'Ecosystem / innovation partner',
    model: 'Research, advisory, training, regulatory-readiness programmes, and joint market development.',
    examples: ['Fintech associations', 'Blockchain and digital-asset companies', 'AI and technology ecosystems', 'Startup accelerators', 'Innovation hubs', 'Digital infrastructure providers'],
  },
] as const;
export type PartnershipRoleId = (typeof PARTNERSHIP_ROLES)[number]['id'];
export const DEFAULT_PARTNERSHIP_ROLE: PartnershipRoleId = 'end_client';

export function isPartnershipRoleId(value: unknown): value is PartnershipRoleId {
  return typeof value === 'string' && PARTNERSHIP_ROLES.some((r) => r.id === value);
}

export const COMMERCIAL_MODELS = [
  { id: 'direct', name: 'Direct engagement', hint: 'LANI sells advisory or delivery to this organisation.', default_for: 'end_client' as const },
  { id: 'referral', name: 'Referral agreement', hint: 'They introduce clients; LANI delivers.', default_for: 'channel' as const },
  { id: 'consortium', name: 'Consortium bid', hint: 'Joint bid where LANI cannot deliver the whole scope alone.', default_for: 'delivery' as const },
  { id: 'joint_delivery', name: 'Joint delivery / subcontract', hint: 'Shared delivery or a specialist subcontract.', default_for: null },
  { id: 'mou', name: 'Strategic MoU / framework', hint: 'Institutional access, legitimacy, or a framework agreement.', default_for: 'institutional' as const },
  { id: 'programme', name: 'Programme partnership', hint: 'Funded programme, capacity-building, or localisation.', default_for: null },
  { id: 'joint_market', name: 'Joint market development', hint: 'Research, training, or emerging-market positioning.', default_for: 'ecosystem' as const },
] as const;
export type CommercialModelId = (typeof COMMERCIAL_MODELS)[number]['id'];

export function isCommercialModelId(value: unknown): value is CommercialModelId {
  return typeof value === 'string' && COMMERCIAL_MODELS.some((m) => m.id === value);
}

export function defaultModelForRole(role: string | null | undefined): CommercialModelId {
  const found = COMMERCIAL_MODELS.find((m) => m.default_for === role);
  return found?.id || 'direct';
}

export function isWorkingStage(stage: number): boolean {
  return stage >= 2 && stage <= 5;
}

export function isProposalOrLater(stage: number): boolean {
  return stage >= 4 && stage <= 6;
}

export const SECTORS = [
  { id: 'agribusiness', name: 'Agribusiness operators', client_or_partner: 'Farms, processors, cooperatives', lani_offering: 'Agribusiness advisory, training, sustainability' },
  { id: 'food_hospitality', name: 'Food and hospitality', client_or_partner: 'Hotels, restaurants, caterers', lani_offering: 'Procurement, sourcing and operational advisory' },
  { id: 'education', name: 'Educational institutions', client_or_partner: 'Universities, colleges, training providers', lani_offering: 'Digital transformation, human capital, fintech research' },
  { id: 'technology', name: 'Technology companies', client_or_partner: 'Software firms, infrastructure providers', lani_offering: 'Strategy, partnerships, training, transformation' },
  { id: 'energy', name: 'Energy companies', client_or_partner: 'Renewable energy and industrial firms', lani_offering: 'Sustainability, strategy, capacity building' },
  { id: 'financial_tax', name: 'Financial and tax clients', client_or_partner: 'SMEs, corporates, institutions', lani_offering: 'Financial planning, tax and compliance advisory' },
  { id: 'public_health', name: 'Public-health programmes', client_or_partner: 'Government, NGOs, donors', lani_offering: 'Programme design, implementation, M&E' },
  { id: 'creative', name: 'Creative and cultural enterprises', client_or_partner: 'Artists, galleries, cultural organisations', lani_offering: 'Partnerships, commercialisation and market access' },
  { id: 'multi_sector', name: 'Multi-sector / general', client_or_partner: 'Organisations that span several LANI sectors', lani_offering: 'Classify the primary mandate, then add partners as needed' },
] as const;
export type SectorId = (typeof SECTORS)[number]['id'];

export function isSectorId(value: unknown): value is SectorId {
  return typeof value === 'string' && SECTORS.some((s) => s.id === value);
}

export interface ArchetypeCatalogEntry {
  id: ArchetypeId;
  name: string;
  one_line_test: string;
  typical_organisations: string[];
  problems: string[];
  lani_opportunity: string[];
  entry_point: string;
  commercial_trigger: string;
  description: string;
}

export const CLIENT_ARCHETYPES: ArchetypeCatalogEntry[] = [
  {
    id: 'A',
    name: 'Government Ministries, Departments and Agencies',
    one_line_test: 'Is this a public institution with an active reform, funding allocation, or technology mandate?',
    typical_organisations: [
      'Federal ministries',
      'State ministries and agencies',
      'Regulatory institutions',
      'Government-owned enterprises',
      'Local government development programmes',
      'Public education and healthcare institutions',
    ],
    problems: [
      'Policy and institutional reform',
      'Digital transformation',
      'Capacity building',
      'Process redesign',
      'Public-sector performance improvement',
      'Programme implementation and monitoring',
      'Financial inclusion and technology adoption',
    ],
    lani_opportunity: [
      'Public-sector transformation consulting',
      'Policy and implementation advisory',
      'Digital literacy and technology programmes',
      'Institutional capacity development',
      'Monitoring and evaluation',
      'Strategic research',
    ],
    entry_point: 'Identify senior decision-makers, development programmes and agencies with active transformation mandates.',
    commercial_trigger: 'A new policy, reform programme, funding allocation, institutional restructuring or technology initiative.',
    description: 'Public institutions whose buying cycle follows mandate, budget and programme design rather than a private sales motion.',
  },
  {
    id: 'B',
    name: 'Financial Institutions and Fintech Companies',
    one_line_test: 'Is this a bank, fintech, insurer, or market infrastructure exploring products, regulation, or transformation?',
    typical_organisations: [
      'Commercial banks',
      'Microfinance banks',
      'Payment service providers',
      'Fintech companies',
      'Insurance companies',
      'Pension and investment institutions',
      'Financial market infrastructure providers',
    ],
    problems: [
      'Digital transformation',
      'Regulatory and compliance readiness',
      'Product innovation',
      'Customer experience improvement',
      'Financial inclusion',
      'Staff capability development',
      'Strategic research and partnerships',
    ],
    lani_opportunity: [
      'Fintech advisory',
      'Digital transformation programmes',
      'Regulatory and operational readiness',
      'Research and innovation partnerships',
      'Executive and technical training',
      'Financial and tax advisory',
    ],
    entry_point: 'Use fintech, blockchain and digital-assets ecosystem relationships to identify institutions exploring new products, infrastructure or market opportunities.',
    commercial_trigger: 'New product launches, regulatory changes, transformation programmes, expansion or technology adoption.',
    description: 'Separate LANI’s documented capabilities from specialist services that would require additional qualified professionals or partners.',
  },
  {
    id: 'C',
    name: 'Large Corporates and Conglomerates',
    one_line_test: 'Is this a large corporate going through growth, restructuring, succession, or operational modernisation?',
    typical_organisations: [
      'Manufacturing groups',
      'Telecommunications companies',
      'Energy companies',
      'Consumer goods businesses',
      'Logistics companies',
      'Large family-owned enterprises',
      'Multinational corporations',
    ],
    problems: [
      'Business transformation',
      'Operational inefficiencies',
      'Process documentation',
      'Internal controls',
      'Leadership development',
      'Sustainability strategy',
      'Technology adoption',
      'Market expansion',
    ],
    lani_opportunity: [
      'Management consulting',
      'Process optimisation',
      'Digital transformation',
      'Human capital development',
      'Sustainability advisory',
      'Strategic planning',
      'Executive training',
    ],
    entry_point: 'Target companies undergoing growth, restructuring, succession, expansion or operational modernisation.',
    commercial_trigger: 'New CEO, merger, expansion, declining performance, new market entry or major transformation initiative.',
    description: 'LANI Consulting covers finance, energy, technology, telecommunications and manufacturing in private-sector advisory work.',
  },
  {
    id: 'D',
    name: 'SMEs and Growth-Stage Businesses',
    one_line_test: 'Is this a scaling SME or founder-led business hitting strategy, finance, talent, or institutional readiness?',
    typical_organisations: [
      'Scaling startups',
      'Established SMEs',
      'Family businesses',
      'Emerging manufacturers',
      'Agribusinesses',
      'Export-oriented businesses',
      'Technology-enabled enterprises',
    ],
    problems: [
      'Business strategy',
      'Governance and process development',
      'Access to finance',
      'Talent development',
      'Technology adoption',
      'Market access',
      'Regulatory and tax readiness',
      'Institutional partnerships',
    ],
    lani_opportunity: [
      'Business advisory',
      'Growth strategy',
      'Process and governance consulting',
      'Financial and tax advisory',
      'Training',
      'Digital transformation',
      'Investor and institutional readiness',
    ],
    entry_point: 'Build referral partnerships with banks, accelerators, incubators, professional associations, investors and development programmes.',
    commercial_trigger: 'Fundraising, expansion, new contracts, rapid hiring, institutional procurement or founder transition.',
    description: 'Often reached through channel partners rather than cold outbound. Score access honestly.',
  },
  {
    id: 'E',
    name: 'International Development Agencies and Donor Organisations',
    one_line_test: 'Is this a donor, DFI, or implementing contractor with a funded programme that needs local delivery?',
    typical_organisations: [
      'Multilateral development institutions',
      'Bilateral donor agencies',
      'International NGOs',
      'Foundations',
      'Development finance institutions',
      'Programme implementation contractors',
    ],
    problems: [
      'Programme design',
      'Local implementation',
      'Capacity building',
      'Monitoring and evaluation',
      'Stakeholder coordination',
      'Research',
      'Institutional strengthening',
      'Socioeconomic development',
    ],
    lani_opportunity: [
      'Programme design and implementation',
      'Monitoring and evaluation',
      'Local partner mobilisation',
      'Capacity building',
      'Policy and institutional advisory',
      'Research and impact assessment',
    ],
    entry_point: 'Build relationships with programme officers, country representatives, procurement teams and local implementing partners.',
    commercial_trigger: 'New donor funding, request for proposals, programme expansion or localisation requirements.',
    description: 'LANI Consulting names development agencies and donors as a target audience, with programme implementation, M&E and institutional capacity building among its services.',
  },
  {
    id: 'F',
    name: 'NGOs, Foundations and Social Enterprises',
    one_line_test: 'Does this organisation have funding or a mandate but need local delivery, research, or institutional strengthening?',
    typical_organisations: [
      'Education-focused NGOs',
      'Healthcare organisations',
      'Livelihood programmes',
      'Youth-development organisations',
      'Women-focused enterprises',
      'Community development organisations',
      'Social-impact ventures',
    ],
    problems: [
      'Programme design',
      'Organisational development',
      'Funding readiness',
      'Monitoring and evaluation',
      'Digital inclusion',
      'Staff training',
      'Impact reporting',
    ],
    lani_opportunity: [
      'Programme development',
      'Capacity building',
      'Digital literacy',
      'Strategy and governance',
      'Monitoring and evaluation',
      'Partnership and grant-readiness support',
    ],
    entry_point: 'Connect with organisations that have funding but require local delivery capacity, research, implementation or institutional strengthening.',
    commercial_trigger: 'New grant awards, programme expansion, donor reporting requirements or organisational scaling.',
    description: 'Treat as both possible end clients and as institutional or channel partners into larger programmes.',
  },
];

export const COMMERCIAL_TRIGGERS = [
  { id: 'new_ceo', trigger: 'New CEO or leadership team', likely_opportunity: 'Strategy and transformation' },
  { id: 'new_market', trigger: 'Expansion into a new market', likely_opportunity: 'Market-entry advisory' },
  { id: 'new_regulation', trigger: 'New regulation', likely_opportunity: 'Compliance, training and process review' },
  { id: 'new_funding', trigger: 'New funding or grant', likely_opportunity: 'Programme implementation and M&E' },
  { id: 'merger', trigger: 'Merger or restructuring', likely_opportunity: 'Process and organisational advisory' },
  { id: 'new_technology', trigger: 'New technology investment', likely_opportunity: 'Digital transformation' },
  { id: 'rapid_hiring', trigger: 'Rapid recruitment', likely_opportunity: 'Human capital development' },
  { id: 'ops_inefficiency', trigger: 'Operational inefficiencies', likely_opportunity: 'Process optimisation' },
  { id: 'sustainability', trigger: 'Sustainability commitments', likely_opportunity: 'Sustainability advisory' },
  { id: 'public_programme', trigger: 'New public-sector programme', likely_opportunity: 'Implementation consortium' },
  { id: 'new_product', trigger: 'New product or service', likely_opportunity: 'Research, strategy and market positioning' },
] as const;

export const COMMERCIAL_LANES = [
  {
    id: 'immediate',
    name: 'Immediate Revenue',
    short: 'Lane 1',
    horizon: '30–90 days',
    description: 'Existing relationships and organisations with identifiable needs that could convert within 30–90 days.',
  },
  {
    id: 'strategic',
    name: 'Strategic Accounts',
    short: 'Lane 2',
    horizon: 'Longer cycle',
    description: 'Large institutions where the sales cycle may be longer but the potential engagement is substantial.',
  },
  {
    id: 'channel',
    name: 'Partnership Channels',
    short: 'Lane 3',
    horizon: 'Multiplier',
    description: 'Organisations capable of generating multiple referrals, consortium opportunities or recurring engagements.',
  },
  {
    id: 'emerging',
    name: 'Emerging Markets',
    short: 'Lane 4',
    horizon: 'New offerings',
    description: 'Fintech, digital assets, AI, technology infrastructure and other emerging sectors where LANI can develop new offerings.',
  },
] as const;
export type LaneId = (typeof COMMERCIAL_LANES)[number]['id'];
export const DEFAULT_LANE: LaneId = 'immediate';

export function isLaneId(value: unknown): value is LaneId {
  return typeof value === 'string' && COMMERCIAL_LANES.some((l) => l.id === value);
}

export const QUALIFICATION_DIMENSIONS = [
  { id: 'strategic_fit', name: 'Strategic fit', question: 'Does the organisation need a capability LANI can credibly deliver?' },
  { id: 'access', name: 'Access', question: 'Do we have a realistic route to the decision-maker?' },
  { id: 'commercial', name: 'Commercial potential', question: 'Is there a meaningful budget or funded programme?' },
  { id: 'urgency', name: 'Urgency', question: 'Is there a current trigger or defined business problem?' },
  { id: 'conversion', name: 'Conversion pathway', question: 'Can we identify the next step toward a proposal or engagement?' },
] as const;

export const ACCOUNT_STAGES = [
  { id: 1, label: 'Intelligence', owner: 'BD' },
  { id: 2, label: 'Qualified', owner: 'BD' },
  { id: 3, label: 'In conversation', owner: 'BD' },
  { id: 4, label: 'Proposal', owner: 'BD' },
  { id: 5, label: 'Verbal / commit', owner: 'Joint' },
  { id: 6, label: 'Won', owner: 'Joint' },
  { id: 7, label: 'Lost / no fit', owner: 'BD' },
  { id: 8, label: 'On hold', owner: 'BD' },
] as const;

/** Same conversion path for accounts and opportunities — one pipeline. */
export const CONVERSION_STAGES = ACCOUNT_STAGES;
export type ConversionStageId = (typeof CONVERSION_STAGES)[number]['id'];

export function isConversionStage(value: unknown): value is ConversionStageId {
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 && n <= 8;
}

export function conversionStageLabel(id: number): string {
  return CONVERSION_STAGES.find((s) => s.id === id)?.label || `Stage ${id}`;
}

export const LANI_CAPABILITIES: string[] = Array.from(
  new Set(CLIENT_ARCHETYPES.flatMap((a) => a.lani_opportunity)),
);

export function isTriggerId(value: unknown): boolean {
  return typeof value === 'string' && COMMERCIAL_TRIGGERS.some((t) => t.id === value);
}

export function isScore(value: unknown): value is number {
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 && n <= 5;
}

export function getArchetypeName(id: ArchetypeId): string {
  return CLIENT_ARCHETYPES.find((a) => a.id === id)?.name || id;
}

/** Frozen IDs for Commercial Case fee bands. Edit labels and ranges; do not rename IDs. */
export const FEE_BAND_IDS = [
  'diagnostic',
  'advisory',
  'training',
  'implementation',
  'programme',
  'consortium',
] as const;
export type FeeBandId = (typeof FEE_BAND_IDS)[number];

export function isFeeBandId(value: unknown): value is FeeBandId {
  return typeof value === 'string' && (FEE_BAND_IDS as readonly string[]).includes(value);
}

export interface FeeBandCatalogEntry {
  id: FeeBandId;
  name: string;
  horizon: string;
  typical_work: string;
  currency: 'NGN';
  min_m: number;
  max_m: number;
  when: string;
}

/**
 * Starter LANI fee bands. Ranges are a Nigeria mid-market hypothesis in millions of NGN —
 * not published LANI rates. The Case generator picks a band ID and must not invent naira
 * outside the catalog. Library edits persist in SQLite; this array is the seed + restore default.
 */
export const LANI_FEE_BANDS: FeeBandCatalogEntry[] = [
  {
    id: 'diagnostic',
    name: 'Diagnostic / scoping',
    horizon: '2–6 weeks',
    typical_work: 'Problem framing, stakeholder map, recommended scope',
    currency: 'NGN',
    min_m: 2,
    max_m: 8,
    when: 'First paid step after Qualified. Do not quote a transformation here.',
  },
  {
    id: 'advisory',
    name: 'Advisory / strategy',
    horizon: '6–16 weeks',
    typical_work: 'Policy, strategy, research, tax or finance advisory',
    currency: 'NGN',
    min_m: 8,
    max_m: 25,
    when: 'A time-boxed workstream LANI can deliver without a build partner.',
  },
  {
    id: 'training',
    name: 'Training / capacity building',
    horizon: 'Days to 8 weeks',
    typical_work: 'Executive or cohort programmes, digital literacy, HCD',
    currency: 'NGN',
    min_m: 3,
    max_m: 15,
    when: 'Price the cohort, not a per-head rate, in the pursuit memo.',
  },
  {
    id: 'implementation',
    name: 'Implementation / transformation',
    horizon: '3–9 months',
    typical_work: 'Process, digital, or institutional delivery',
    currency: 'NGN',
    min_m: 20,
    max_m: 80,
    when: 'Multi-month. Set consortium_required if LANI cannot deliver the whole build.',
  },
  {
    id: 'programme',
    name: 'Programme / M&E',
    horizon: '6–24 months',
    typical_work: 'Design, local implementation, M&E on a funded mandate',
    currency: 'NGN',
    min_m: 50,
    max_m: 250,
    when: 'LANI’s engagement size — not the donor’s full envelope.',
  },
  {
    id: 'consortium',
    name: 'Consortium share',
    horizon: 'Bid-dependent',
    typical_work: 'LANI’s slice of a joint bid or subcontract',
    currency: 'NGN',
    min_m: 15,
    max_m: 100,
    when: 'Use when consortium is required. Never quote the whole envelope as LANI revenue.',
  },
];

export function feeBandRangeLabel(band: Pick<FeeBandCatalogEntry, 'min_m' | 'max_m' | 'currency'>): string {
  return `${band.min_m}–${band.max_m}m ${band.currency}`;
}

/**
 * Commercial Case locks. Generate / validate / apply must import these.
 * Qualified+ only. Accept sections, not auto-save. Fee band is a catalog ID.
 * No invented naira. No stage advance. No CPO / $GIFT / claims pack.
 */
export const CASE_MIN_STAGE = 2;

export function canGenerateCommercialCase(stage: unknown): boolean {
  return isConversionStage(stage) && Number(stage) >= CASE_MIN_STAGE;
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

export function isCaseSectionId(value: unknown): value is CaseSectionId {
  return typeof value === 'string' && CASE_SECTIONS.some((s) => s.id === value);
}

/** Optional account write-back after accepted sections. Never stage or money. */
export const CASE_APPLY_ACCOUNT_FIELDS = [
  'commercial_model',
  'consortium_required',
  'next_action',
] as const;
export type CaseApplyAccountField = (typeof CASE_APPLY_ACCOUNT_FIELDS)[number];

export function isCaseApplyAccountField(value: unknown): value is CaseApplyAccountField {
  return typeof value === 'string' && (CASE_APPLY_ACCOUNT_FIELDS as readonly string[]).includes(value);
}

export const CASE_FORBIDDEN_ACCOUNT_FIELDS = [
  'current_stage',
  'estimated_value',
  'revenue_originated',
  'revenue_influenced',
] as const;

/** Allowed draft keys. Anything else — including raw currency — is dropped. */
export const CASE_DRAFT_KEYS = [
  'headline',
  'situation',
  'why_now',
  'why_lani',
  'scope_workstreams',
  'commercial_model',
  'fee_band_id',
  'fee_rationale',
  'consortium_required',
  'consortium_roles',
  'risks',
  'ask_id',
  'ask_text',
  'caveats',
  'sources',
  'dropped',
] as const;

export const CASE_ASK_IDS = [
  'intro_or_diagnostic',
  'confirm_problem_buyer',
  'concept_or_proposal',
  'close_conditions',
] as const;
export type CaseAskId = (typeof CASE_ASK_IDS)[number];

export function isCaseAskId(value: unknown): value is CaseAskId {
  return typeof value === 'string' && (CASE_ASK_IDS as readonly string[]).includes(value);
}

export interface CaseAskCatalogEntry {
  id: CaseAskId;
  name: string;
  for_stages: readonly number[];
  ask: string;
}

export const CASE_ASKS: CaseAskCatalogEntry[] = [
  {
    id: 'intro_or_diagnostic',
    name: 'Intro or diagnostic conversation',
    for_stages: [2],
    ask: 'Secure a first working conversation or a paid diagnostic. Do not table a transformation.',
  },
  {
    id: 'confirm_problem_buyer',
    name: 'Confirm problem and buyer',
    for_stages: [3],
    ask: 'Confirm the problem statement and name the buyer who can commission work.',
  },
  {
    id: 'concept_or_proposal',
    name: 'Concept note or scoped proposal',
    for_stages: [4],
    ask: 'Agree a concept note or a scoped proposal — not a signed SOW.',
  },
  {
    id: 'close_conditions',
    name: 'Close conditions and partner names',
    for_stages: [5],
    ask: 'Lock close conditions and name any required delivery partners.',
  },
];

export function defaultAskForStage(stage: number): CaseAskId {
  if (stage <= 2) return 'intro_or_diagnostic';
  if (stage === 3) return 'confirm_problem_buyer';
  if (stage === 4) return 'concept_or_proposal';
  return 'close_conditions';
}

/**
 * Frozen IDs for Conversion Coach stall reasons. Edit labels and owner copy;
 * do not rename IDs. Predicates (for_stages, severity) stay in this catalog.
 */
export const COACH_STALL_IDS = [
  'no_brief',
  'no_trigger',
  'no_buyer',
  'no_next_action',
  'stale_ask',
  'no_case',
  'consortium_unnamed',
  'no_decision_date',
  'closed_or_hold',
] as const;
export type CoachStallId = (typeof COACH_STALL_IDS)[number];

export function isCoachStallId(value: unknown): value is CoachStallId {
  return typeof value === 'string' && (COACH_STALL_IDS as readonly string[]).includes(value);
}

export type CoachStallSeverity = 'block' | 'advice' | 'off';

export interface CoachStallCatalogEntry {
  id: CoachStallId;
  name: string;
  when: string;
  owner_move: string;
  for_stages: readonly number[];
  severity: CoachStallSeverity;
}

/**
 * Starter LANI stall reasons. Coach picks a stall ID; it must not invent a
 * free-text reason. Library edits persist in SQLite; this array is the seed
 * + restore default. for_stages and severity are never editable.
 */
export const LANI_COACH_STALLS: CoachStallCatalogEntry[] = [
  {
    id: 'no_brief',
    name: 'Apply an Intelligence Brief',
    when: 'Stage 1 and no applied brief',
    owner_move: 'Run Research, accept the brief fields, and stay at Intelligence until the problem and trigger are named.',
    for_stages: [1],
    severity: 'block',
  },
  {
    id: 'no_trigger',
    name: 'Name the commercial trigger',
    when: 'Trigger is empty or urgency is 2 or below',
    owner_move: 'Ask what is changing inside the organisation. Pick a catalog trigger. Do not invent a mandate.',
    for_stages: [1, 2, 3, 4, 5],
    severity: 'block',
  },
  {
    id: 'no_buyer',
    name: 'Name the decision-maker',
    when: 'Stage 2 or later and decision-maker is empty, or Access is 2 or below',
    owner_move: 'Name the person who can commission work. If Access is weak, find a path through a channel or institutional partner.',
    for_stages: [2, 3, 4, 5],
    severity: 'block',
  },
  {
    id: 'no_next_action',
    name: 'Set a next action',
    when: 'Working stage (Qualified through Verbal) and next action is empty',
    owner_move: 'Write one concrete next step tied to the stage ask. Working stages cannot sit without a next action.',
    for_stages: [2, 3, 4, 5],
    severity: 'block',
  },
  {
    id: 'stale_ask',
    name: 'Refresh the ask for this stage',
    when: 'A next action exists but it does not match the catalog ask for the current stage',
    owner_move: 'Replace the leftover ask with the stage-matched catalog ask. Do not keep a diagnostic conversation once you are at Proposal.',
    for_stages: [2, 3, 4, 5],
    severity: 'advice',
  },
  {
    id: 'no_case',
    name: 'Write a Commercial Case',
    when: 'Stage 2 or later and no applied Commercial Case',
    owner_move: 'Generate a pursuit memo after Qualified. Advice only — Coach still offers a next action without a Case.',
    for_stages: [2, 3, 4, 5],
    severity: 'advice',
  },
  {
    id: 'consortium_unnamed',
    name: 'Name the delivery partner',
    when: 'Proposal or later, consortium required, and no delivery partner named',
    owner_move: 'Name the delivery partner on the account. Consortium without a named partner is not a proposal.',
    for_stages: [4, 5],
    severity: 'block',
  },
  {
    id: 'no_decision_date',
    name: 'Set an expected decision date',
    when: 'Proposal or later and expected decision date is empty',
    owner_move: 'Put a date on when a buyer can commission or decline. Do not leave Proposal open-ended.',
    for_stages: [4, 5],
    severity: 'block',
  },
  {
    id: 'closed_or_hold',
    name: 'Coach is off',
    when: 'Won, Lost, or On hold',
    owner_move: 'Do not generate Conversion Coach. Move the account back to a working stage if you need a next action.',
    for_stages: [6, 7, 8],
    severity: 'off',
  },
];

export const COACH_OFF_STAGES = [6, 7, 8] as const;

/**
 * Conversion Coach locks. Generate / validate / apply must import these.
 * Account-first (never deal-level). Stages 1–5. Deterministic rules always.
 * Optional model polish. Field accept, not memo sections. next_action always;
 * expected_decision_date only at Proposal+. No stage/money/CPO. Missing
 * OPENAI_API_KEY is not a 503 unless polish is requested.
 */
export const COACH_MIN_STAGE = 1;
export const COACH_MAX_STAGE = 5;
export const COACH_DATE_MIN_STAGE = 4;
export const COACH_SCOPE = 'account' as const;
export const COACH_RULES_REQUIRE_AI = false;
export const COACH_POLISH_REQUIRES_AI = true;

export function canGenerateCoach(stage: unknown): boolean {
  const n = Number(stage);
  return isConversionStage(n) && n >= COACH_MIN_STAGE && n <= COACH_MAX_STAGE;
}

export function canApplyCoachDecisionDate(stage: unknown): boolean {
  return canGenerateCoach(stage) && isProposalOrLater(Number(stage));
}

/** True only when the caller asked for polish. Rules generate never requires a key. */
export function coachRequiresAi(polish: unknown): boolean {
  return polish === true;
}

export function stallAppliesToStage(stall: Pick<CoachStallCatalogEntry, 'for_stages'>, stage: number): boolean {
  return stall.for_stages.includes(stage);
}

/** Fields the owner ticks on the Coach card. Not Case sections. */
export const COACH_FIELDS = [
  { id: 'next_action', name: 'Next action' },
  { id: 'suggested_decision_date', name: 'Suggested decision date' },
  { id: 'why', name: 'Why' },
] as const;
export type CoachFieldId = (typeof COACH_FIELDS)[number]['id'];

export function isCoachFieldId(value: unknown): value is CoachFieldId {
  return typeof value === 'string' && COACH_FIELDS.some((f) => f.id === value);
}

/** Optional account write-back after accepted fields. Date only at Proposal+. */
export const COACH_APPLY_ACCOUNT_FIELDS = [
  'next_action',
  'expected_decision_date',
] as const;
export type CoachApplyAccountField = (typeof COACH_APPLY_ACCOUNT_FIELDS)[number];

export function isCoachApplyAccountField(value: unknown): value is CoachApplyAccountField {
  return typeof value === 'string' && (COACH_APPLY_ACCOUNT_FIELDS as readonly string[]).includes(value);
}

export function allowedCoachApplyFields(stage: unknown): CoachApplyAccountField[] {
  const fields: CoachApplyAccountField[] = ['next_action'];
  if (canApplyCoachDecisionDate(stage)) fields.push('expected_decision_date');
  return fields;
}

export const COACH_FORBIDDEN_ACCOUNT_FIELDS = [
  'current_stage',
  'estimated_value',
  'revenue_originated',
  'revenue_influenced',
  'commercial_model',
  'consortium_required',
  'delivery_partner_account_id',
] as const;

/** Allowed draft keys. No stage, no currency, no CPO / $GIFT fields. */
export const COACH_DRAFT_KEYS = [
  'stall_reason_id',
  'supporting_reason_ids',
  'next_action',
  'ask_id',
  'name_partner',
  'suggested_decision_date',
  'why',
  'evidence',
  'caveats',
  'sources',
  'dropped',
  'polished',
] as const;
export type CoachDraftKey = (typeof COACH_DRAFT_KEYS)[number];

export function isCoachDraftKey(value: unknown): value is CoachDraftKey {
  return typeof value === 'string' && (COACH_DRAFT_KEYS as readonly string[]).includes(value);
}
