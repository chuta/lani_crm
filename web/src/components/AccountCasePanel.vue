<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import {
  CASE_APPLY_ACCOUNT_FIELDS,
  CASE_SECTIONS,
  type Account,
  type CaseApplyAccountField,
  type CaseAsk,
  type CaseSectionId,
  type CommercialCase,
  type CommercialModel,
  type FeeBand,
} from '../lib/api'

const props = defineProps<{
  caseRecord: CommercialCase
  current?: Account | null
  busy?: boolean
  models: CommercialModel[]
  feeBands: FeeBand[]
  asks: CaseAsk[]
}>()

const emit = defineEmits<{
  apply: [payload: { accepted_sections: CaseSectionId[]; account_fields: CaseApplyAccountField[] }]
}>()

const accepted = ref<Set<string>>(new Set())
const writebacks = ref<Set<string>>(new Set())

watch(() => props.caseRecord.id, (id) => {
  const prior = props.caseRecord.status === 'applied' ? props.caseRecord.accepted_sections : []
  accepted.value = new Set(prior.map(String))
  writebacks.value = new Set()
}, { immediate: true })

function lookup(list: { id: string; name: string }[], id: string | null | undefined) {
  if (!id) return '—'
  return list.find((item) => item.id === id)?.name || id
}

function feeLabel(id: string | null) {
  if (!id) return '—'
  const band = props.feeBands.find((b) => b.id === id)
  if (!band) return id
  return `${band.id} — ${band.name} (${band.min_m}–${band.max_m}m ${band.currency})`
}

function askLabel(id: string | null) {
  if (!id) return '—'
  const ask = props.asks.find((a) => a.id === id)
  return ask ? `${ask.id} — ${ask.name}` : id
}

function lines(value: string[] | string | null | undefined) {
  if (Array.isArray(value)) return value.filter(Boolean)
  if (value) return [String(value)]
  return []
}

const draft = computed(() => props.caseRecord.payload)

const sectionBodies = computed(() => {
  const p = draft.value
  return {
    situation: [
      p.headline && `Headline: ${p.headline}`,
      p.situation,
      p.why_now && `Why now: ${p.why_now}`,
    ].filter(Boolean) as string[],
    why_lani: lines(p.why_lani),
    scope: p.scope_workstreams || [],
    commercial: [
      `Model: ${lookup(props.models, p.commercial_model)}`,
      `Fee band: ${feeLabel(p.fee_band_id)}`,
      p.fee_rationale && `Why this band: ${p.fee_rationale}`,
    ].filter(Boolean) as string[],
    consortium: [
      p.consortium_required ? 'Consortium required' : 'LANI can deliver alone',
      ...(p.consortium_roles || []).map((role) => `Role: ${role}`),
    ],
    risks: p.risks || [],
    ask: [
      `Ask: ${askLabel(p.ask_id)}`,
      p.ask_text,
    ].filter(Boolean) as string[],
    caveats: [
      ...(p.caveats || []),
      p.sources?.length ? `Sources: ${p.sources.join(' · ')}` : '',
    ].filter(Boolean),
  } as Record<CaseSectionId, string[]>
})

const WRITEBACK_META: Record<CaseApplyAccountField, { label: string; needs: CaseSectionId }> = {
  commercial_model: { label: 'Write commercial model onto the account', needs: 'commercial' },
  consortium_required: { label: 'Write consortium required onto the account', needs: 'consortium' },
  next_action: { label: 'Write the ask as next action', needs: 'ask' },
}

function toggleSection(id: string, on: boolean) {
  const next = new Set(accepted.value)
  if (on) next.add(id)
  else next.delete(id)
  accepted.value = next
  if (!on) {
    const wb = new Set(writebacks.value)
    for (const field of CASE_APPLY_ACCOUNT_FIELDS) {
      if (WRITEBACK_META[field].needs === id) wb.delete(field)
    }
    writebacks.value = wb
  }
}

function toggleWriteback(field: string, on: boolean) {
  const meta = WRITEBACK_META[field as CaseApplyAccountField]
  if (!meta || !accepted.value.has(meta.needs)) return
  const next = new Set(writebacks.value)
  if (on) next.add(field)
  else next.delete(field)
  writebacks.value = next
}

function acceptAll() {
  accepted.value = new Set(CASE_SECTIONS.map((s) => s.id))
}

function clearAccepted() {
  accepted.value = new Set()
  writebacks.value = new Set()
}

function submit() {
  emit('apply', {
    accepted_sections: [...accepted.value] as CaseSectionId[],
    account_fields: [...writebacks.value] as CaseApplyAccountField[],
  })
}

const applyBlocked = computed(() => accepted.value.size === 0)
</script>

<template>
  <div class="rounded-lg border border-deep-600 bg-deep-900/50 p-4 space-y-4">
    <div class="flex items-start justify-between gap-3">
      <div>
        <h4 class="font-medium text-white">Pursuit memo</h4>
        <p class="text-xs text-gray-500 mt-0.5">
          {{ caseRecord.model || 'model' }}
          <span v-if="caseRecord.status === 'applied'" class="ml-2 text-accent-teal">Applied</span>
          · Tick whole sections. Stage and estimated value never write back.
        </p>
      </div>
      <div class="flex gap-2 shrink-0">
        <button type="button" class="btn-secondary text-xs" @click="acceptAll">Accept all</button>
        <button type="button" class="btn-secondary text-xs" :disabled="!accepted.size" @click="clearAccepted">Clear</button>
      </div>
    </div>

    <div v-if="draft.dropped.length" class="text-xs text-gray-500">
      Dropped invented IDs or amounts: {{ draft.dropped.join(' · ') }}
    </div>

    <div class="space-y-2">
      <label
        v-for="section in CASE_SECTIONS"
        :key="section.id"
        class="flex items-start gap-3 rounded-lg bg-deep-800/80 px-3 py-2 cursor-pointer"
      >
        <input
          type="checkbox"
          class="mt-1 rounded border-deep-500"
          :checked="accepted.has(section.id)"
          @change="toggleSection(section.id, ($event.target as HTMLInputElement).checked)"
        />
        <div class="min-w-0 flex-1">
          <div class="text-xs text-gray-500">{{ section.name }}</div>
          <div class="text-sm text-white mt-0.5 space-y-1">
            <p v-for="(line, i) in sectionBodies[section.id]" :key="i" class="whitespace-pre-wrap">{{ line }}</p>
            <p v-if="!sectionBodies[section.id].length" class="text-gray-500">—</p>
          </div>
        </div>
      </label>
    </div>

    <div class="rounded-lg border border-deep-600 p-3 space-y-2">
      <p class="text-xs text-gray-500">Optional account write-back. Only these three fields. Leave unticked to keep the memo only.</p>
      <label
        v-for="field in CASE_APPLY_ACCOUNT_FIELDS"
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
          <span v-if="current && field === 'commercial_model'" class="block text-xs text-gray-500">Now: {{ lookup(models, current.commercial_model) }}</span>
          <span v-else-if="current && field === 'consortium_required'" class="block text-xs text-gray-500">Now: {{ current.consortium_required ? 'Yes' : 'No' }}</span>
          <span v-else-if="current && field === 'next_action'" class="block text-xs text-gray-500">Now: {{ current.next_action || '—' }}</span>
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
        {{ busy ? 'Applying…' : 'Apply accepted sections' }}
      </button>
    </div>
  </div>
</template>
