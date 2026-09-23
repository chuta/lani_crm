<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import {
  APPLYABLE_BRIEF_FIELDS,
  type Account,
  type AccountBrief,
  type ApplyableBriefField,
  type Archetype,
  type CommercialLane,
  type CommercialModel,
  type Geography,
  type PartnershipRole,
  type SectorOverlay,
} from '../lib/api'

const props = defineProps<{
  brief: AccountBrief
  current?: Account | null
  mode: 'create' | 'apply'
  busy?: boolean
  archetypes: Archetype[]
  sectors: SectorOverlay[]
  roles: PartnershipRole[]
  geographies: Geography[]
  lanes: CommercialLane[]
  models: CommercialModel[]
}>()

const emit = defineEmits<{
  apply: [fields: ApplyableBriefField[]]
}>()

const accepted = ref<Set<string>>(new Set())

watch(() => props.brief.id, () => {
  accepted.value = new Set()
})

const FIELD_LABELS: Record<ApplyableBriefField, string> = {
  archetype: 'Client archetype',
  sector: 'Sector',
  partnership_role: 'Partnership role',
  geography: 'Geography',
  lane: 'Commercial lane',
  commercial_model: 'Commercial model',
  trigger_event: 'Trigger',
  strategic_problem: 'Strategic problem',
  lani_capability: 'LANI capability',
  decision_maker: 'Decision-maker',
  consortium_required: 'Consortium required',
  next_action: 'Suggested next action',
  score_strategic_fit: 'Strategic fit',
  score_access: 'Access',
  score_commercial: 'Commercial',
  score_urgency: 'Urgency',
  score_conversion: 'Conversion',
}

function lookup(list: { id: string; name: string }[], id: string | null | undefined) {
  if (!id) return '—'
  return list.find((item) => item.id === id)?.name || id
}

function draftValue(field: ApplyableBriefField): unknown {
  const p = props.brief.payload
  if (field === 'consortium_required') return p.consortium_required
  if (field.startsWith('score_')) {
    const key = field.replace('score_', '') as keyof typeof p.scores
    return p.scores[key]
  }
  return (p as any)[field]
}

function hasDraftValue(field: ApplyableBriefField) {
  const value = draftValue(field)
  if (field === 'consortium_required') return true
  return value !== undefined && value !== null && value !== ''
}

function formatDraft(field: ApplyableBriefField): string {
  const value = draftValue(field)
  if (field === 'consortium_required') return value ? 'Yes — consortium needed' : 'No — LANI can deliver'
  if (field === 'archetype') {
    const name = lookup(props.archetypes, String(value || ''))
    const conf = props.brief.payload.archetype_confidence
    return `${value} — ${name}${conf ? ` (${conf})` : ''}`
  }
  if (field === 'sector') return lookup(props.sectors, String(value || ''))
  if (field === 'partnership_role') return lookup(props.roles, String(value || ''))
  if (field === 'geography') return lookup(props.geographies, String(value || ''))
  if (field === 'lane') return lookup(props.lanes, String(value || ''))
  if (field === 'commercial_model') return lookup(props.models, String(value || ''))
  if (typeof value === 'number') return String(value)
  return String(value || '—')
}

function formatCurrent(field: ApplyableBriefField): string | null {
  const account = props.current
  if (!account) return null
  if (field === 'consortium_required') return account.consortium_required ? 'Yes' : 'No'
  if (field === 'archetype') return `${account.archetype} — ${lookup(props.archetypes, account.archetype)}`
  if (field === 'sector') return lookup(props.sectors, account.sector)
  if (field === 'partnership_role') return lookup(props.roles, account.partnership_role)
  if (field === 'geography') return lookup(props.geographies, account.geography)
  if (field === 'lane') return lookup(props.lanes, account.lane)
  if (field === 'commercial_model') return lookup(props.models, account.commercial_model)
  if (field.startsWith('score_')) return String((account as any)[field] ?? '—')
  const value = (account as any)[field]
  return value ? String(value) : '—'
}

function scoreReason(field: ApplyableBriefField) {
  if (!field.startsWith('score_')) return null
  const key = field.replace('score_', '') as keyof typeof props.brief.payload.score_reasons
  return props.brief.payload.score_reasons[key]
}

const rows = computed(() => APPLYABLE_BRIEF_FIELDS.filter(hasDraftValue))

const suggestedCount = computed(() => rows.value.length)
const acceptedCount = computed(() => accepted.value.size)

function toggle(field: string, on: boolean) {
  const next = new Set(accepted.value)
  if (on) next.add(field)
  else next.delete(field)
  accepted.value = next
}

function acceptSuggested() {
  accepted.value = new Set(rows.value)
}

function clearAccepted() {
  accepted.value = new Set()
}

function submit() {
  emit('apply', [...accepted.value] as ApplyableBriefField[])
}

const createBlocked = computed(() => props.mode === 'create' && !accepted.value.has('archetype'))
const applyBlocked = computed(() => accepted.value.size === 0)
</script>

<template>
  <div class="rounded-lg border border-deep-600 bg-deep-900/50 p-4 space-y-4">
    <div class="flex items-start justify-between gap-3">
      <div>
        <h4 class="font-medium text-white">Intelligence brief</h4>
        <p class="text-xs text-gray-500 mt-0.5">
          {{ brief.model || 'model' }}
          <span v-if="brief.status === 'applied'" class="ml-2 text-accent-teal">Applied</span>
          · Tick fields to {{ mode === 'create' ? 'create at Intelligence' : 'write back' }}. Nothing saves until you accept.
        </p>
      </div>
      <div class="flex gap-2 shrink-0">
        <button type="button" class="btn-secondary text-xs" @click="acceptSuggested">Accept suggested ({{ suggestedCount }})</button>
        <button type="button" class="btn-secondary text-xs" :disabled="!acceptedCount" @click="clearAccepted">Clear</button>
      </div>
    </div>

    <p v-if="brief.payload.summary" class="text-sm text-gray-200 whitespace-pre-wrap">{{ brief.payload.summary }}</p>
    <p v-if="brief.payload.archetype_test_used" class="text-xs text-gray-500">Test used: {{ brief.payload.archetype_test_used }}</p>

    <div v-if="brief.payload.caveats.length" class="rounded-lg border border-accent-gold/30 bg-accent-gold/10 p-3 text-xs text-accent-gold space-y-1">
      <div class="font-medium">Caveats</div>
      <p v-for="(caveat, i) in brief.payload.caveats" :key="i">{{ caveat }}</p>
    </div>
    <div v-if="brief.payload.dropped.length" class="text-xs text-gray-500">
      Dropped invented catalog IDs: {{ brief.payload.dropped.join(' · ') }}
    </div>

    <div class="space-y-2">
      <label
        v-for="field in rows"
        :key="field"
        class="flex items-start gap-3 rounded-lg bg-deep-800/80 px-3 py-2 cursor-pointer"
      >
        <input
          type="checkbox"
          class="mt-1 rounded border-deep-500"
          :checked="accepted.has(field)"
          @change="toggle(field, ($event.target as HTMLInputElement).checked)"
        />
        <div class="min-w-0 flex-1">
          <div class="text-xs text-gray-500">
            {{ FIELD_LABELS[field] }}
            <span v-if="field === 'next_action'" class="text-gray-600"> · suggested, not required at Intelligence</span>
          </div>
          <div class="text-sm text-white mt-0.5 whitespace-pre-wrap">{{ formatDraft(field) }}</div>
          <div v-if="scoreReason(field)" class="text-xs text-gray-500 mt-0.5">{{ scoreReason(field) }}</div>
          <div v-if="current" class="text-xs text-gray-500 mt-0.5">Now: {{ formatCurrent(field) }}</div>
        </div>
      </label>
    </div>

    <p v-if="brief.payload.sources.length" class="text-xs text-gray-500">
      Sources: {{ brief.payload.sources.join(' · ') }}
    </p>

    <div class="flex items-center justify-end gap-3">
      <p v-if="createBlocked" class="text-xs text-accent-gold mr-auto">Accept a client archetype to create the account.</p>
      <button
        type="button"
        class="btn-primary text-sm"
        :disabled="busy || applyBlocked || createBlocked"
        @click="submit"
      >
        <template v-if="mode === 'create'">{{ busy ? 'Creating…' : 'Create at Intelligence' }}</template>
        <template v-else>{{ busy ? 'Applying…' : 'Apply accepted fields' }}</template>
      </button>
    </div>
  </div>
</template>
