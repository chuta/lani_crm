/**
 * Account qualification uses five 1–5 scores. Internal priority is their average
 * and is sort-only — never shown as a single “the score”.
 * Deal rows still store a 1–3 band for the legacy CHECK constraint.
 */

import { CLIENT_ARCHETYPES, getArchetypeName as catalogName, type ArchetypeId } from '../catalog.js';

export function getArchetypeEffortTier(_archetype: ArchetypeId | string): number {
  return 1;
}

export function getArchetypeName(archetype: ArchetypeId | string): string {
  return catalogName(archetype as ArchetypeId);
}

export function getArchetypeDescription(archetype: ArchetypeId | string): string {
  return CLIENT_ARCHETYPES.find((a) => a.id === archetype)?.one_line_test || '';
}

export function getArchetypeOneLineTest(archetype: ArchetypeId | string): string {
  return getArchetypeDescription(archetype);
}

export function getNoveltyPenalty(_noveltyLevel: number): number {
  return 1;
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

export function computeInternalPriority(scores: {
  score_strategic_fit: number;
  score_access: number;
  score_commercial: number;
  score_urgency: number;
  score_conversion: number;
}): number {
  const vals = [
    scores.score_strategic_fit,
    scores.score_access,
    scores.score_commercial,
    scores.score_urgency,
    scores.score_conversion,
  ];
  const avg = vals.reduce((sum, n) => sum + Number(n || 0), 0) / 5;
  return Math.round(avg * 100) / 100;
}
