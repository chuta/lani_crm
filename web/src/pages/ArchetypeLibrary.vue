<script setup lang="ts">
import { computed, reactive, ref, onMounted } from 'vue'
import {
  api,
  type Archetype,
  type SectorOverlay,
  type PartnershipRole,
  type Geography,
  type CommercialTrigger,
  type CommercialModel,
  type FeeBand,
  type CaseAsk,
  type CoachStall,
} from '../lib/api'

type LibraryTab = 'clients' | 'sectors' | 'partners' | 'triggers' | 'fees' | 'stalls'

const tab = ref<LibraryTab>('clients')
const archetypes = ref<Archetype[]>([])
const sectors = ref<SectorOverlay[]>([])
const roles = ref<PartnershipRole[]>([])
const geographies = ref<Geography[]>([])
const triggers = ref<CommercialTrigger[]>([])
const models = ref<CommercialModel[]>([])
const feeBands = ref<FeeBand[]>([])
const coachStalls = ref<CoachStall[]>([])
const caseAsks = ref<CaseAsk[]>([])
const expanded = ref<string | null>('A')
const loading = ref(true)
const loadError = ref('')

const selectedFeeId = ref('diagnostic')
const feeForm = reactive({
  name: '',
  horizon: '',
  typical_work: '',
  min_m: 0,
  max_m: 0,
  when: '',
  archived: false,
})
const feeSaving = ref(false)
const feeRestoring = ref(false)
const feeError = ref('')
const feeSaved = ref('')

const selectedFee = computed(() => feeBands.value.find((b) => b.id === selectedFeeId.value) || feeBands.value[0])

const ASK_STAGE_LABELS: Record<number, string> = {
  2: 'Qualified',
  3: 'In conversation',
  4: 'Proposal',
  5: 'Verbal / commit',
}

const STALL_STAGE_LABELS: Record<number, string> = {
  1: 'Intelligence',
  2: 'Qualified',
  3: 'In conversation',
  4: 'Proposal',
  5: 'Verbal / commit',
  6: 'Won',
  7: 'Lost / no fit',
  8: 'On hold',
}

const STALL_SEVERITY_LABELS: Record<CoachStall['severity'], string> = {
  block: 'Block',
  advice: 'Advice',
  off: 'Coach off',
}

const selectedStallId = ref('no_brief')
const stallForm = reactive({
  name: '',
  when: '',
  owner_move: '',
  archived: false,
})
const stallSaving = ref(false)
const stallRestoring = ref(false)
const stallError = ref('')
const stallSaved = ref('')

const selectedStall = computed(() => coachStalls.value.find((s) => s.id === selectedStallId.value) || coachStalls.value[0])

function rangeLabel(band: { min_m: number; max_m: number; currency?: string }) {
  return `${band.min_m}–${band.max_m}m ${band.currency || 'NGN'}`
}

function askStageLabel(stages: number[]) {
  return stages.map((s) => ASK_STAGE_LABELS[s] || `Stage ${s}`).join(', ')
}

function stallStageLabel(stages: number[]) {
  return stages.map((s) => STALL_STAGE_LABELS[s] || `Stage ${s}`).join(', ')
}

function hydrateStallForm(stall: CoachStall | undefined) {
  if (!stall) return
  stallForm.name = stall.name
  stallForm.when = stall.when
  stallForm.owner_move = stall.owner_move
  stallForm.archived = stall.archived
  stallError.value = ''
  stallSaved.value = ''
}

function selectStall(id: string) {
  selectedStallId.value = id
  hydrateStallForm(coachStalls.value.find((s) => s.id === id))
}

function applyStall(updated: CoachStall) {
  coachStalls.value = coachStalls.value.map((s) => (s.id === updated.id ? updated : s))
  if (selectedStallId.value === updated.id) hydrateStallForm(updated)
}

async function saveStall() {
  const stall = selectedStall.value
  if (!stall) return
  stallSaving.value = true
  stallError.value = ''
  stallSaved.value = ''
  try {
    const res = await api.updateCoachStall(stall.id, {
      name: stallForm.name,
      when: stallForm.when,
      owner_move: stallForm.owner_move,
      archived: stallForm.archived,
    })
    applyStall(res.stall)
    stallSaved.value = 'Saved. Conversion Coach will use this copy.'
  } catch (e: any) {
    stallError.value = e.message || 'Could not save stall reason'
  } finally {
    stallSaving.value = false
  }
}

async function restoreStall() {
  const stall = selectedStall.value
  if (!stall) return
  stallRestoring.value = true
  stallError.value = ''
  stallSaved.value = ''
  try {
    const res = await api.updateCoachStall(stall.id, { restore: true })
    applyStall(res.stall)
    stallSaved.value = 'Restored catalog default.'
  } catch (e: any) {
    stallError.value = e.message || 'Could not restore stall reason'
  } finally {
    stallRestoring.value = false
  }
}

function hydrateFeeForm(band: FeeBand | undefined) {
  if (!band) return
  feeForm.name = band.name
  feeForm.horizon = band.horizon
  feeForm.typical_work = band.typical_work
  feeForm.min_m = band.min_m
  feeForm.max_m = band.max_m
  feeForm.when = band.when
  feeForm.archived = band.archived
  feeError.value = ''
  feeSaved.value = ''
}

function selectFee(id: string) {
  selectedFeeId.value = id
  hydrateFeeForm(feeBands.value.find((b) => b.id === id))
}

function applyFee(updated: FeeBand) {
  feeBands.value = feeBands.value.map((b) => (b.id === updated.id ? updated : b))
  if (selectedFeeId.value === updated.id) hydrateFeeForm(updated)
}

async function saveFee() {
  const band = selectedFee.value
  if (!band) return
  feeSaving.value = true
  feeError.value = ''
  feeSaved.value = ''
  try {
    const res = await api.updateFeeBand(band.id, {
      name: feeForm.name,
      horizon: feeForm.horizon,
      typical_work: feeForm.typical_work,
      min_m: Number(feeForm.min_m),
      max_m: Number(feeForm.max_m),
      when: feeForm.when,
      archived: feeForm.archived,
    })
    applyFee(res.fee_band)
    feeSaved.value = 'Saved. The Case generator will use this range.'
  } catch (e: any) {
    feeError.value = e.message || 'Could not save fee band'
  } finally {
    feeSaving.value = false
  }
}

async function restoreFee() {
  const band = selectedFee.value
  if (!band) return
  feeRestoring.value = true
  feeError.value = ''
  feeSaved.value = ''
  try {
    const res = await api.updateFeeBand(band.id, { restore: true })
    applyFee(res.fee_band)
    feeSaved.value = 'Restored catalog default.'
  } catch (e: any) {
    feeError.value = e.message || 'Could not restore fee band'
  } finally {
    feeRestoring.value = false
  }
}

onMounted(async () => {
  try {
    const res = await api.listArchetypes()
    archetypes.value = res.archetypes
    sectors.value = res.sectors
    roles.value = res.partnership_roles
    geographies.value = res.geographies
    triggers.value = res.commercial_triggers
    models.value = res.commercial_models || []
    feeBands.value = res.fee_bands || []
    coachStalls.value = res.coach_stalls || []
    caseAsks.value = res.case_asks || []
    hydrateFeeForm(selectedFee.value)
    hydrateStallForm(selectedStall.value)
  } catch (e: any) {
    loadError.value = e.message || 'Failed to load library'
    console.error('Failed to load library:', e)
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <div>
    <div class="mb-8">
      <h2 class="text-2xl font-display font-bold text-white">📚 LANI Commercial Library</h2>
      <p class="text-gray-400 mt-1">
        Organisations with a strategic, operational, technological, regulatory, institutional or growth challenge that LANI can solve through advisory, implementation, training, partnership or consortium delivery.
      </p>
    </div>

    <div class="flex flex-wrap gap-2 mb-6">
      <button
        v-for="item in [
          { id: 'clients', label: 'Client archetypes' },
          { id: 'sectors', label: 'Sector overlays' },
          { id: 'partners', label: 'Partnership roles' },
          { id: 'triggers', label: 'Commercial triggers' },
          { id: 'fees', label: 'Fee bands' },
          { id: 'stalls', label: 'Stall reasons' },
        ]"
        :key="item.id"
        class="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        :class="tab === item.id ? 'bg-primary-500/20 text-primary-400' : 'bg-deep-800 text-gray-400 hover:text-white'"
        @click="tab = item.id as typeof tab"
      >
        {{ item.label }}
      </button>
    </div>

    <div v-if="loading" class="text-center py-12 text-gray-500">Loading library…</div>
    <div v-else-if="loadError" class="p-3 bg-red-900/20 border border-red-800/30 rounded-lg text-red-400 text-sm">{{ loadError }}</div>

    <div v-else-if="tab === 'clients'" class="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div
        v-for="a in archetypes"
        :key="a.id"
        class="card cursor-pointer transition-all hover:border-primary-500/40"
        :class="expanded === a.id ? 'border-primary-500/50' : ''"
        @click="expanded = expanded === a.id ? null : a.id"
      >
        <div class="flex items-start justify-between mb-3">
          <div>
            <span class="badge-archetype">Archetype {{ a.id }}</span>
            <h3 class="font-display font-semibold text-white mt-2">{{ a.name }}</h3>
          </div>
        </div>
        <p class="text-sm text-gray-400">{{ a.one_line_test }}</p>
        <p class="text-xs text-gray-500 mt-3"><span class="text-gray-400 font-medium">Trigger:</span> {{ a.commercial_trigger }}</p>

        <div v-if="expanded === a.id" class="mt-4 pt-4 border-t border-deep-600 space-y-4">
          <div>
            <h4 class="text-sm font-medium text-gray-300 mb-2">Typical organisations</h4>
            <ul class="space-y-1">
              <li v-for="item in a.typical_organisations" :key="item" class="flex items-start gap-2 text-sm text-gray-400">
                <span class="text-primary-400 mt-0.5 shrink-0">▸</span>{{ item }}
              </li>
            </ul>
          </div>
          <div>
            <h4 class="text-sm font-medium text-gray-300 mb-2">Problems they may need solved</h4>
            <ul class="space-y-1">
              <li v-for="item in a.problems" :key="item" class="flex items-start gap-2 text-sm text-gray-400">
                <span class="text-primary-400 mt-0.5 shrink-0">▸</span>{{ item }}
              </li>
            </ul>
          </div>
          <div>
            <h4 class="text-sm font-medium text-gray-300 mb-2">LANI opportunity</h4>
            <ul class="space-y-1">
              <li v-for="item in a.lani_opportunity" :key="item" class="flex items-start gap-2 text-sm text-gray-400">
                <span class="text-primary-400 mt-0.5 shrink-0">▸</span>{{ item }}
              </li>
            </ul>
          </div>
          <div>
            <h4 class="text-sm font-medium text-gray-300 mb-2">Partnership entry point</h4>
            <p class="text-sm text-gray-400">{{ a.entry_point }}</p>
          </div>
          <p v-if="a.description" class="text-xs text-gray-500 italic">{{ a.description }}</p>
        </div>
      </div>
    </div>

    <div v-else-if="tab === 'sectors'" class="space-y-3">
      <p class="text-sm text-gray-400 mb-2">Sector overlays connect a client archetype to LANI Group’s broader portfolio. Use with A–F, not instead of it.</p>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div v-for="s in sectors" :key="s.id" class="card">
          <h3 class="font-display font-semibold text-white">{{ s.name }}</h3>
          <p class="text-sm text-gray-400 mt-2"><span class="text-gray-500">Typical:</span> {{ s.client_or_partner }}</p>
          <p class="text-sm text-gray-300 mt-2"><span class="text-gray-500">LANI offering:</span> {{ s.lani_offering }}</p>
        </div>
      </div>
    </div>

    <div v-else-if="tab === 'partners'" class="space-y-4">
      <p class="text-sm text-gray-400">Do not map only end clients. Channel, delivery, institutional and ecosystem partners generate multiple opportunities.</p>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div v-for="r in roles" :key="r.id" class="card">
          <h3 class="font-display font-semibold text-white">{{ r.name }}</h3>
          <p class="text-sm text-gray-400 mt-2">{{ r.model }}</p>
          <ul class="mt-3 space-y-1">
            <li v-for="ex in r.examples" :key="ex" class="text-sm text-gray-500">▸ {{ ex }}</li>
          </ul>
        </div>
      </div>
      <div class="card">
        <h3 class="font-display font-semibold text-white mb-2">Geography</h3>
        <p class="text-sm text-gray-400 mb-3">Nigeria-first, with optional ECOWAS and global coverage.</p>
        <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div v-for="g in geographies" :key="g.id" class="rounded-xl bg-deep-700 p-4">
            <div class="text-sm font-medium text-white">{{ g.name }}</div>
            <p class="text-xs text-gray-400 mt-1">{{ g.hint }}</p>
          </div>
        </div>
      </div>
      <div class="card">
        <h3 class="font-display font-semibold text-white mb-2">Commercial models</h3>
        <p class="text-sm text-gray-400 mb-3">Each partner gets a role and a model. Default follows the role; change it when the relationship is different.</p>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div v-for="m in models" :key="m.id" class="rounded-xl bg-deep-700 p-4">
            <div class="text-sm font-medium text-white">{{ m.name }}</div>
            <p class="text-xs text-gray-400 mt-1">{{ m.hint }}</p>
            <p v-if="m.default_for" class="text-xs text-gray-500 mt-2">Default for {{ roles.find((r) => r.id === m.default_for)?.name || m.default_for }}</p>
          </div>
        </div>
      </div>
    </div>

    <div v-else-if="tab === 'triggers'" class="card p-0 overflow-x-auto">
      <p class="text-sm text-gray-400 p-4">Ask what is changing inside the organisation, not only whether LANI can sell something.</p>
      <table class="w-full text-sm">
        <thead>
          <tr class="border-b border-deep-600 text-left">
            <th class="py-3 px-4 text-gray-400 font-medium">Trigger</th>
            <th class="py-3 px-4 text-gray-400 font-medium">Likely opportunity</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="t in triggers" :key="t.id" class="border-b border-deep-700">
            <td class="py-3 px-4 text-white">{{ t.trigger }}</td>
            <td class="py-3 px-4 text-gray-400">{{ t.likely_opportunity }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-else-if="tab === 'fees'" class="space-y-6">
      <p class="text-sm text-gray-400">
        IDs are frozen so Commercial Cases stay valid. Edit names, horizons, and ranges.
        Archive a band instead of deleting it. Ranges are a working hypothesis in millions of naira — not a client quote.
      </p>

      <div class="card p-0 overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b border-deep-600 text-left">
              <th class="py-3 px-4 text-gray-400 font-medium">ID</th>
              <th class="py-3 px-4 text-gray-400 font-medium">Name</th>
              <th class="py-3 px-4 text-gray-400 font-medium">Horizon</th>
              <th class="py-3 px-4 text-gray-400 font-medium text-right">Range</th>
              <th class="py-3 px-4 text-gray-400 font-medium">Use when</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="b in feeBands"
              :key="b.id"
              class="border-b border-deep-700 cursor-pointer"
              :class="selectedFeeId === b.id ? 'bg-primary-500/10' : 'hover:bg-deep-700/60'"
              @click="selectFee(b.id)"
            >
              <td class="py-3 px-4 font-mono text-xs text-primary-400">{{ b.id }}</td>
              <td class="py-3 px-4 text-white">
                {{ b.name }}
                <span v-if="b.archived" class="ml-2 text-[11px] uppercase tracking-wide text-amber-400">Archived</span>
              </td>
              <td class="py-3 px-4 text-gray-400">{{ b.horizon }}</td>
              <td class="py-3 px-4 text-gray-200 text-right">{{ rangeLabel(b) }}</td>
              <td class="py-3 px-4 text-gray-500">{{ b.when }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div v-if="selectedFee" class="card">
        <div class="flex items-start justify-between gap-4 mb-4">
          <div>
            <p class="text-xs uppercase tracking-wide text-gray-500">Locked ID</p>
            <h3 class="font-display font-semibold text-white mt-1">{{ selectedFee.id }}</h3>
          </div>
          <span class="badge-archetype">{{ rangeLabel(feeForm) }}</span>
        </div>

        <div v-if="feeError" class="mb-4 p-3 bg-red-900/20 border border-red-800/30 rounded-lg text-red-400 text-sm">{{ feeError }}</div>
        <div v-if="feeSaved" class="mb-4 p-3 bg-emerald-900/20 border border-emerald-800/30 rounded-lg text-emerald-400 text-sm">{{ feeSaved }}</div>

        <form class="space-y-4" @submit.prevent="saveFee">
          <div>
            <label class="label">Display name</label>
            <input v-model="feeForm.name" class="input-field" maxlength="120" />
          </div>
          <div>
            <label class="label">Horizon</label>
            <input v-model="feeForm.horizon" class="input-field" maxlength="80" />
          </div>
          <div>
            <label class="label">Typical work</label>
            <input v-model="feeForm.typical_work" class="input-field" maxlength="240" />
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label class="label">Min (million NGN)</label>
              <input v-model.number="feeForm.min_m" type="number" min="0" step="0.5" class="input-field" />
            </div>
            <div>
              <label class="label">Max (million NGN)</label>
              <input v-model.number="feeForm.max_m" type="number" min="0" step="0.5" class="input-field" />
            </div>
          </div>
          <div>
            <label class="label">Use when</label>
            <textarea v-model="feeForm.when" rows="3" maxlength="280" class="input-field"></textarea>
          </div>
          <label class="flex items-center gap-2 text-sm text-gray-300">
            <input v-model="feeForm.archived" type="checkbox" class="rounded border-deep-500 bg-deep-700 text-primary-500" />
            Archive this band (do not offer it on new cases)
          </label>
          <div class="flex flex-wrap gap-3 pt-2">
            <button type="submit" class="btn-primary" :disabled="feeSaving || feeRestoring">
              {{ feeSaving ? 'Saving…' : 'Save band' }}
            </button>
            <button type="button" class="btn-secondary" :disabled="feeSaving || feeRestoring" @click="restoreFee">
              {{ feeRestoring ? 'Restoring…' : 'Restore catalog default' }}
            </button>
          </div>
        </form>
      </div>

      <div class="card p-0 overflow-x-auto">
        <div class="p-4">
          <h3 class="font-display font-semibold text-white">The ask (IDs frozen)</h3>
          <p class="text-sm text-gray-400 mt-1">
            One catalog ask per working stage. The Case generator picks an ask ID. Intelligence is blocked.
          </p>
        </div>
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b border-deep-600 text-left">
              <th class="py-3 px-4 text-gray-400 font-medium">ID</th>
              <th class="py-3 px-4 text-gray-400 font-medium">Name</th>
              <th class="py-3 px-4 text-gray-400 font-medium">Stage</th>
              <th class="py-3 px-4 text-gray-400 font-medium">Ask</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="a in caseAsks" :key="a.id" class="border-b border-deep-700">
              <td class="py-3 px-4 font-mono text-xs text-primary-400">{{ a.id }}</td>
              <td class="py-3 px-4 text-white">{{ a.name }}</td>
              <td class="py-3 px-4 text-gray-400">{{ askStageLabel(a.for_stages) }}</td>
              <td class="py-3 px-4 text-gray-500">{{ a.ask }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div v-else-if="tab === 'stalls'" class="space-y-6">
      <p class="text-sm text-gray-400">
        IDs, stages, and severity are frozen so Conversion Coach stays valid. Edit the label, when-copy, and owner move.
        Archive a reason instead of deleting it. Coach-off is the hide gate for Won, Lost, and On hold.
      </p>

      <div class="card p-0 overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b border-deep-600 text-left">
              <th class="py-3 px-4 text-gray-400 font-medium">ID</th>
              <th class="py-3 px-4 text-gray-400 font-medium">Name</th>
              <th class="py-3 px-4 text-gray-400 font-medium">Stages</th>
              <th class="py-3 px-4 text-gray-400 font-medium">Severity</th>
              <th class="py-3 px-4 text-gray-400 font-medium">Use when</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="s in coachStalls"
              :key="s.id"
              class="border-b border-deep-700 cursor-pointer"
              :class="selectedStallId === s.id ? 'bg-primary-500/10' : 'hover:bg-deep-700/60'"
              @click="selectStall(s.id)"
            >
              <td class="py-3 px-4 font-mono text-xs text-primary-400">{{ s.id }}</td>
              <td class="py-3 px-4 text-white">
                {{ s.name }}
                <span v-if="s.archived" class="ml-2 text-[11px] uppercase tracking-wide text-amber-400">Archived</span>
              </td>
              <td class="py-3 px-4 text-gray-400">{{ stallStageLabel(s.for_stages) }}</td>
              <td class="py-3 px-4 text-gray-300">{{ STALL_SEVERITY_LABELS[s.severity] }}</td>
              <td class="py-3 px-4 text-gray-500">{{ s.when }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div v-if="selectedStall" class="card">
        <div class="flex items-start justify-between gap-4 mb-4">
          <div>
            <p class="text-xs uppercase tracking-wide text-gray-500">Locked ID</p>
            <h3 class="font-display font-semibold text-white mt-1">{{ selectedStall.id }}</h3>
            <p class="text-xs text-gray-500 mt-2">
              {{ stallStageLabel(selectedStall.for_stages) }} · {{ STALL_SEVERITY_LABELS[selectedStall.severity] }}
            </p>
          </div>
        </div>

        <div v-if="stallError" class="mb-4 p-3 bg-red-900/20 border border-red-800/30 rounded-lg text-red-400 text-sm">{{ stallError }}</div>
        <div v-if="stallSaved" class="mb-4 p-3 bg-emerald-900/20 border border-emerald-800/30 rounded-lg text-emerald-400 text-sm">{{ stallSaved }}</div>

        <form class="space-y-4" @submit.prevent="saveStall">
          <div>
            <label class="label">Display name</label>
            <input v-model="stallForm.name" class="input-field" maxlength="120" />
          </div>
          <div>
            <label class="label">Use when</label>
            <textarea v-model="stallForm.when" rows="2" maxlength="280" class="input-field"></textarea>
          </div>
          <div>
            <label class="label">Owner move</label>
            <textarea v-model="stallForm.owner_move" rows="3" maxlength="400" class="input-field"></textarea>
          </div>
          <label class="flex items-center gap-2 text-sm text-gray-300">
            <input v-model="stallForm.archived" type="checkbox" class="rounded border-deep-500 bg-deep-700 text-primary-500" />
            Archive this reason (do not offer it on new Coach advice)
          </label>
          <div class="flex flex-wrap gap-3 pt-2">
            <button type="submit" class="btn-primary" :disabled="stallSaving || stallRestoring">
              {{ stallSaving ? 'Saving…' : 'Save stall' }}
            </button>
            <button type="button" class="btn-secondary" :disabled="stallSaving || stallRestoring" @click="restoreStall">
              {{ stallRestoring ? 'Restoring…' : 'Restore catalog default' }}
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>
