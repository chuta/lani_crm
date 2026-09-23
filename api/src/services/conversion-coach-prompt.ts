/**
 * Catalog-grounded polish prompt for Conversion Coach.
 * Rewrites next_action + why only. Stall IDs and asks stay locked to the rules engine.
 */

import {
  CASE_ASKS,
  LANI_COACH_STALLS,
  conversionStageLabel,
} from '../catalog.js';

export const COACH_POLISH_SCHEMA = `{
  "next_action": "string — one concrete owner move, no currency, no new stall or ask id",
  "why": "string — one or two sentences grounded in the locked stall and evidence"
}`;

export function buildCoachPolishSystemPrompt(): string {
  const stalls = LANI_COACH_STALLS
    .filter((s) => s.id !== 'closed_or_hold')
    .map((s) => `${s.id} — ${s.name}. ${s.owner_move}`)
    .join('\n');
  const asks = CASE_ASKS.map((a) => {
    const stages = a.for_stages.map((id) => conversionStageLabel(id)).join(', ');
    return `${a.id} — ${a.name} (${stages}). ${a.ask}`;
  }).join('\n');

  return [
    'You rewrite Conversion Coach copy for Lani Consulting BD.',
    'The stall_reason_id and ask_id are already locked by the rules engine. Do not change them. Do not invent a stall or a fifth ask.',
    'Return JSON only, matching this shape:',
    COACH_POLISH_SCHEMA,
    'Do not emit naira, dollars, or any other currency. Do not invent a decision date, a named person as fact, or a funded amount.',
    'Do not mention $GIFT, CPO, claims, tokens, or a proposal pack.',
    'Do not change current_stage.',
    '',
    'STALL CATALOG (IDs frozen — do not pick a different one)',
    stalls,
    '',
    'CASE ASKS (IDs frozen — do not pick a different one)',
    asks,
  ].join('\n');
}

export function buildCoachPolishUserPrompt(input: {
  organisation: string;
  stage: number;
  rules: {
    stall_reason_id: string | null;
    ask_id: string | null;
    name_partner: boolean;
    evidence: string[];
    next_action: string | null;
    why: string | null;
  };
}): string {
  return [
    `Organisation: ${input.organisation}`,
    `Stage: ${input.stage} (${conversionStageLabel(input.stage)})`,
    `Locked stall_reason_id: ${input.rules.stall_reason_id || 'none'}`,
    `Locked ask_id: ${input.rules.ask_id || 'none'}`,
    `Name partner: ${input.rules.name_partner ? 'yes' : 'no'}`,
    `Evidence: ${(input.rules.evidence || []).join(' | ') || 'none'}`,
    `Current next_action: ${input.rules.next_action || ''}`,
    `Current why: ${input.rules.why || ''}`,
    'Rewrite next_action and why so a BD owner can act this week. Keep the locked stall and ask. JSON only.',
  ].join('\n');
}
