<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import {
  COACH_APPLY_ACCOUNT_FIELDS,
  COACH_FIELDS,
  type Account,
  type CaseAsk,
  type CoachApplyAccountField,
  type CoachFieldId,
  type CoachStall,
  type ConversionAdvice,
} from '../lib/api'

const props = defineProps<{
  advice: ConversionAdvice
  current?: Account | null
  busy?: boolean
  stalls: CoachStall[]
  asks: CaseAsk[]
}>()

const emit = defineEmits<{
  apply: [payload: { accepted_fields: CoachFieldId[]; account_fields: CoachApplyAccountField[] }]
}>()

const accepted = ref<Set<string>>(new Set())
const writebacks = ref<Set<string>>(new Set())

watch(() => props.advice.id, () => {
  const prior = props.advice.status === 'applied' ? props.advice.accepted_fields : []
  accepted.value = new Set(prior.map(String))
  writebacks.value = new Set()
}, { immediate: true })

const draft = computed(() => props.advice.payload)
const stage = computed(() => Number(props.current?.current_stage || 1))
const dateWritebackAllowed = computed(() => stage.value >= 4 && stage.value <= 5)

function stallLabel(id: string | null | undefined) {
  if (!id) return 'No stall'
  const stall = props.stalls.find((s) => s.id === id)
  return stall ? stall.name : id
}

function stallSeverity(id: string | null | undefined) {
  if (!id) return ''
  return props.stalls.find((s) => s.id === id)?.severity || ''
}

function askLabel(id: string | null | undefined) {
  if (!id) return '—'
  const ask = props.asks.find((a) => a.id === id)
  return ask ? `${ask.name}` : id
}

const fieldBodies = computed(() => {
  const p = draft.value
  return {
    next_action: p.next_action || '',
    why: p.why || '',
    suggested_decision_date: p.suggested_decision_date || '',
  } as Record<CoachFieldId, string>
})

const visibleFields = computed(() =>
  COACH_FIELDS.filter((field) => field.id !== 'suggested_decision_date' || fieldBodies.value.suggested_decision_date)
)

const WRITEBACK_META: Record<CoachApplyAccountField, { label: string; needs: CoachFieldId }> = {
  next_action: { label: 'Write this next action onto the account', needs: 'next_action' },
  expected_decision_date: { label: 'Write the suggested date onto the account', needs: 'suggested_decision_date' },
}

const visibleWritebacks = computed(() =>
  COACH_APPLY_ACCOUNT_FIELDS.filter((field) => field !== 'expected_decision_date' || dateWritebackAllowed.value)
)

function toggleField(id: string, on: boolean) {
  const next = new Set(accepted.value)
  if (on) next.add(id)
  else next.delete(id)
  accepted.value = next
  if (!on) {
    const wb = new Set(writebacks.value)
    for (const field of COACH_APPLY_ACCOUNT_FIELDS) {
      if (WRITEBACK_META[field].needs === id) wb.delete(field)
    }
    writebacks.value = wb
  }
}

function toggleWriteback(field: string, on: boolean) {
  const meta = WRITEBACK_META[field as CoachApplyAccountField]
  if (!meta || !accepted.value.has(meta.needs)) return
  if (field === 'expected_decision_date' && !dateWritebackAllowed.value) return
  const next = new Set(writebacks.value)
  if (on) next.add(field)
  else next.delete(field)
  writebacks.value = next
}

function acceptAll() {
  accepted.value = new Set(visibleFields.value.map((f) => f.id))
}

function clearAccepted() {
  accepted.value = new Set()
  writebacks.value = new Set()
}

function submit() {
  emit('apply', {
    accepted_fields: [...accepted.value] as CoachFieldId[],
    account_fields: [...writebacks.value] as CoachApplyAccountField[],
  })
}

const applyBlocked = computed(() => accepted.value.size === 0)
const supporting = computed(() => (draft.value.supporting_reason_ids || []).map(stallLabel))
</script>

<template>
  <div class="rounded-lg border border-deep-600 bg-deep-900/50 p-4 space-y-4">
    <div class="flex items-start justify-between gap-3">
      <div>
        <h4 class="font-medium text-white">Advice</h4>
        <p class="text-xs text-gray-500 mt-0.5">
          {{ advice.payload.polished ? (advice.model || 'polished') : 'Rules engine' }}
          <span v-if="advice.status === 'applied'" class="ml-2 text-accent-teal">Applied</span>
          · Tick fields. Stage and estimated value never write back.
        </p>
      </div>
      <div class="flex gap-2 shrink-0">
        <button type="button" class="btn-secondary text-xs" @click="acceptAll">Accept all</button>
        <button type="button" class="btn-secondary text-xs" :disabled="!accepted.size" @click="clearAccepted">Clear</button>
      </div>
    </div>

    <div class="rounded-lg bg-deep-800/80 px-3 py-2">
      <div class="text-xs text-gray-500">Stall</div>
      <div class="text-sm text-white mt-0.5">{{ stallLabel(draft.stall_reason_id) }}</div>
      <p v-if="stallSeverity(draft.stall_reason_id)" class="text-xs text-gray-500 mt-1 capitalize">{{ stallSeverity(draft.stall_reason_id) }}</p>
      <p v-if="supporting.length" class="text-xs text-gray-400 mt-2">Also: {{ supporting.join(' · ') }}</p>
      <p v-if="draft.ask_id" class="text-xs text-gray-400 mt-2">Ask: {{ askLabel(draft.ask_id) }}</p>
      <p v-if="draft.name_partner" class="text-xs text-accent-gold mt-2">Name the delivery partner</p>
    </div>

    <div v-if="draft.dropped?.length" class="text-xs text-gray-500">
      Dropped invented IDs or amounts: {{ draft.dropped.join(' · ') }}
    </div>

    <div class="space-y-2">
      <label
        v-for="field in visibleFields"
        :key="field.id"
        class="flex items-start gap-3 rounded-lg bg-deep-800/80 px-3 py-2 cursor-pointer"
      >
        <input
          type="checkbox"
          class="mt-1 rounded border-deep-500"
          :checked="accepted.has(field.id)"
          @change="toggleField(field.id, ($event.target as HTMLInputElement).checked)"
        />
        <div class="min-w-0 flex-1">
          <div class="text-xs text-gray-500">{{ field.name }}</div>
          <p class="text-sm text-white mt-0.5 whitespace-pre-wrap">{{ fieldBodies[field.id] || '—' }}</p>
        </div>
      </label>
    </div>

    <div v-if="draft.evidence?.length" class="text-xs text-gray-500">
      Evidence: {{ draft.evidence.join(' · ') }}
    </div>
    <div v-if="draft.caveats?.length" class="text-xs text-gray-500">
      {{ draft.caveats.join(' · ') }}
    </div>

    <div class="rounded-lg border border-deep-600 p-3 space-y-2">
      <p class="text-xs text-gray-500">Optional account write-back. Leave unticked to keep the advice only.</p>
      <label
        v-for="field in visibleWritebacks"
        :key="field"
        class="flex items-start gap-3 text-sm"
        :class="accepted.has(WRITEBACK_META[field].needs) ? 'text-gray-200 cursor-pointer' : 'text-gray-600'"
      >
        <input
          type="checkbox"
          class="mt-1 rounded border-deep-500"
          :disabled="!accepted.has(WRITEBACK_META[field].needs)"
          :checked="writebacks.has(field)"
          @change="toggleWriteback(field, ($event.target as HTMLInputElement).checked)"
        />
        <span>
          {{ WRITEBACK_META[field].label }}
          <span v-if="current && field === 'next_action'" class="block text-xs text-gray-500">Now: {{ current.next_action || '—' }}</span>
          <span v-else-if="current && field === 'expected_decision_date'" class="block text-xs text-gray-500">Now: {{ current.expected_decision_date || '—' }}</span>
        </span>
      </label>
    </div>

    <div class="flex items-center justify-end">
      <button
        type="button"
        class="btn-primary text-sm"
        :disabled="busy || applyBlocked"
        @click="submit"
      >
        {{ busy ? 'Applying…' : 'Apply accepted fields' }}
      </button>
    </div>
  </div>
</template>
