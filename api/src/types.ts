/** LANI commercial operating types */

export {
  ARCHETYPE_IDS,
  isArchetypeId,
  type ArchetypeId,
  type GeographyId,
  type PartnershipRoleId,
  type SectorId,
} from './catalog.js';

import { CONVERSION_STAGES } from './catalog.js';

/** Consulting conversion path — Intelligence → Won / Lost / On hold. */
export const PIPELINE_STAGES = CONVERSION_STAGES.map((s) => ({
  id: s.id,
  name: s.label,
  owner: s.owner,
}));

export interface Deal {
  id: string;
  partner_name: string;
  sector: string | null;
  partnership_role: string | null;
  geography: string | null;
  account_id?: string | null;
  lane?: string | null;
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

export interface StageTransition {
  id: number;
  deal_id: string;
  from_stage: number | null;
  to_stage: number;
  triggered_by: string | null;
  note: string | null;
  created_at: string;
}

export interface IntakeInput {
  partner_name: string;
  organisation?: string;
  sector?: string;
  partnership_role?: string;
  geography?: string;
  lane?: string;
  deal_stage?: string;
  description?: string;
  archetype: string;
  is_repeat?: boolean;
  novelty_level?: number;
  revenue_potential?: number;
  strategic_fit?: number;
  score_strategic_fit?: number;
  score_access?: number;
  score_commercial?: number;
  score_urgency?: number;
  score_conversion?: number;
  urgency?: string;
  compliance_flags?: string;
  bd_owner?: string;
  decision_maker?: string;
  trigger_event?: string;
  lani_capability?: string;
  potential_partners?: string;
  next_action?: string;
  consortium_required?: boolean;
  commercial_model?: string;
  delivery_partner_account_id?: string;
  expected_decision_date?: string;
}
