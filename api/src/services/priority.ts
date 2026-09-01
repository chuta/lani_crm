/**
 * Priority Score Engine
 * Implements Section 5.1 formula:
 * Priority Score = (Revenue Potential × Strategic Fit) ÷ (Effort Tier × Novelty Penalty)
 */

import type { ArchetypeId, Deal } from '../types.js';

const ARCHETYPE_EFFORT_TIERS: Record<ArchetypeId, number> = {
  I: 2.5,     // Medium-High
  II: 1.5,    // Low-Medium
  III: 3,     // High
  IV: 2,      // Medium
  V: 2.5,     // Medium-High
  VI: 1.5,    // Low-Medium (eng)
  VII: 0.5,   // None
};

const ARCHETYPE_NAMES: Record<ArchetypeId, string> = {
  I: 'Embedded Account / Dashboard',
  II: 'Institutional Custody / Fund Wrapper',
  III: 'Payment Rails / Infrastructure',
  IV: 'Card Acceptance / Payment Gateway',
  V: 'Card Issuance',
  VI: 'Exchange Listing / Liquidity',
  VII: 'Non-Technical / Zero-Integration',
};

const ARCHETYPE_DESCRIPTIONS: Record<ArchetypeId, string> = {
  I: 'Does the partner\'s own platform need to show individual customers their GIFT balance and let them transact?',
  II: 'Is the partner a licensed asset manager pooling client money into a fund that holds GIFT?',
  III: 'Does this partner move money for us, eg. mobile money, banking rails, OTC, treasury?',
  IV: 'Does this let $GIFT-funded customers pay merchants via card?',
  V: 'Does this partner issue a branded card to GIFT holders for spending?',
  VI: 'Does GIFT trade on this partner\'s own exchange?',
  VII: 'Is this a commercial, CSR, or advocacy relationship with no API or platform touchpoint at all?',
};

export function getArchetypeEffortTier(archetype: ArchetypeId): number {
  return ARCHETYPE_EFFORT_TIERS[archetype];
}

export function getArchetypeName(archetype: ArchetypeId): string {
  return ARCHETYPE_NAMES[archetype];
}

export function getArchetypeDescription(archetype: ArchetypeId): string {
  return ARCHETYPE_DESCRIPTIONS[archetype];
}

export function getArchetypeOneLineTest(archetype: ArchetypeId): string {
  return ARCHETYPE_DESCRIPTIONS[archetype];
}

export function getNoveltyPenalty(noveltyLevel: number): number {
  // noveltyLevel: 1 = matches existing archetype, 2 = moderate adaptation, 3 = genuinely new
  switch (noveltyLevel) {
    case 1: return 1;
    case 2: return 2;
    case 3: return 3;
    default: return 1;
  }
}

export function computePriorityScore(
  revenuePotential: number,
  strategicFit: number,
  effortTier: number,
  noveltyPenalty: number
): number {
  if (effortTier === 0 || noveltyPenalty === 0) return 0;
  return (revenuePotential * strategicFit) / (effortTier * noveltyPenalty);
}

export function computeQueuePosition(
  deals: { id: string; priority_score: number | null; is_archived: number }[]
): Map<string, number> {
  const positions = new Map<string, number>();
  
  const active = deals
    .filter(d => !d.is_archived)
    .sort((a, b) => ((b.priority_score ?? 0) - (a.priority_score ?? 0)));
  
  active.forEach((deal, index) => {
    positions.set(deal.id, index + 1);
  });
  
  return positions;
}

export { ARCHETYPE_EFFORT_TIERS, ARCHETYPE_NAMES, ARCHETYPE_DESCRIPTIONS };