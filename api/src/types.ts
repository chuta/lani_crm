/** Partnership Integration Framework — shared types */

export const ARCHETYPES = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'] as const;
export type ArchetypeId = (typeof ARCHETYPES)[number];

export const PIPELINE_STAGES = [
  { id: 1, name: 'Lead', owner: 'BD' },
  { id: 2, name: 'Intake & Classification', owner: 'BD' },
  { id: 3, name: 'Tech Triage', owner: 'Product & Tech' },
  { id: 4, name: 'Prioritization', owner: 'Strategic Technical Bridge' },
  { id: 5, name: 'Business Case / Proposal', owner: 'BD' },
  { id: 6, name: 'Build', owner: 'Product & Tech' },
  { id: 7, name: 'Pilot', owner: 'Joint' },
  { id: 8, name: 'Launch', owner: 'Joint' },
  { id: 9, name: 'Post-Launch Review', owner: 'Strategic Technical Bridge' },
] as const;

export interface ArchetypeRecord {
  id: ArchetypeId;
  name: string;
  one_line_test: string;
  effort_tier: number;
  description: string;
  standard_components: string[];
  precedent_name: string;
  precedent_template: string;
  created_at: string;
  updated_at: string;
}

export interface Deal {
  id: string;
  partner_name: string;
  sector: string | null;
  deal_stage: string | null;
  description: string | null;
  archetype: ArchetypeId;
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
  triage_classification_corrected: ArchetypeId | null;
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
  sector?: string;
  deal_stage?: string;
  description?: string;
  archetype: ArchetypeId;
  is_repeat: boolean;
  novelty_level: number;
  revenue_potential: number;
  strategic_fit: number;
  urgency?: string;
  compliance_flags?: string;
  bd_owner?: string;
}

export interface TriageInput {
  classification_corrected: ArchetypeId;
  novelty_flag: 'confirmed_repeat' | 'moderate_adaptation' | 'genuinely_new';
  responded_by: string;
}