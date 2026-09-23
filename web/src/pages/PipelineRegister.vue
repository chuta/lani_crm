<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import {
  api,
  CONVERSION_GAP_LABELS,
  type AccountStage,
  type Archetype,
  type CommercialLane,
  type Deal,
  type ExecutiveData,
} from '../lib/api'

const router = useRouter()
const deals = ref<Deal[]>([])
const laneCounts = ref<Record<string, number>>({})
const executive = ref<ExecutiveData | null>(null)
const archetypes = ref<Archetype[]>([])
const lanes = ref<CommercialLane[]>([])
const stages = ref<AccountStage[]>([])
const loading = ref(true)
const filterArchetype = ref('')
const filterStage = ref('')
const filterLane = ref('')
const searchQuery = ref('')

async function loadData() {
  loading.value = true
  try {
    const params: Record<string, string> = {}
    if (filterArchetype.value) params.archetype = filterArchetype.value
    if (filterStage.value) params.stage = filterStage.value
    if (filterLane.value) params.lane = filterLane.value
    if (searchQuery.value) params.search = searchQuery.value

    const [dealsRes, execRes, catalog] = await Promise.all([
      api.listDeals(params),
      api.getExecutive(),
      api.listArchetypes(),
    ])
    deals.value = dealsRes.deals
    laneCounts.value = dealsRes.lane_counts || {}
    executive.value = execRes
    archetypes.value = catalog.archetypes
    lanes.value = catalog.lanes || []
    stages.value = catalog.account_stages || []
  } catch (e) {
    console.error('Failed to load pipeline data:', e)
  } finally {
    loading.value = false
  }
}

onMounted(loadData)

function stageLabel(id?: number | null) {
  return stages.value.find((s) => s.id === id)?.label || `Stage ${id ?? '?'}`
}
function stageColor(stage: number): string {
  if (stage <= 2) return 'bg-gray-500/30 text-gray-300'
  if (stage === 3) return 'bg-blue-500/30 text-blue-300'
  if (stage <= 5) return 'bg-yellow-500/30 text-yellow-300'
  if (stage === 6) return 'bg-accent-success/30 text-accent-success'
  if (stage === 7) return 'bg-accent-danger/30 text-accent-danger'
  return 'bg-purple-500/30 text-purple-300'
}
function priorityColor(score: number | null | undefined): string {
  if (score == null) return 'text-gray-500'
  if (score >= 4) return 'text-accent-success'
  if (score >= 3) return 'text-accent-gold'
  return 'text-gray-400'
}

function setLaneFilter(id: string) {
  filterLane.value = filterLane.value === id ? '' : id
  loadData()
}
function gapLabel(id: string) {
  return CONVERSION_GAP_LABELS[id] || id
}

const grouped = computed(() => {
  const activeLanes = filterLane.value
    ? lanes.value.filter((l) => l.id === filterLane.value)
    : lanes.value
  return activeLanes.map((lane) => ({
    lane,
    deals: deals.value.filter((d) => d.lane === lane.id),
  })).filter((g) => g.deals.length > 0 || !filterLane.value)
})
</script>

<template>
  <div>
    <div class="mb-6 flex items-start justify-between gap-4">
      <div>
        <h2 class="text-2xl font-display font-bold text-white">Qualified Commercial Pipeline</h2>
        <p class="text-gray-400 mt-1">One conversion path across four 90-day lanes. Closed-won stays on the account — it is not a build stage.</p>
      </div>
      <router-link to="/intake" class="btn-primary text-sm shrink-0">+ New opportunity</router-link>
    </div>

    <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
      <button
        v-for="lane in lanes"
        :key="lane.id"
        type="button"
        class="card text-left transition-all"
        :class="filterLane === lane.id ? 'border-primary-500/50 bg-primary-500/10' : 'hover:border-deep-500'"
        @click="setLaneFilter(lane.id)"
      >
        <div class="flex items-start justify-between gap-2">
          <div>
            <div class="text-xs text-gray-500">{{ lane.short }} · {{ lane.horizon }}</div>
            <div class="font-display font-semibold text-white mt-0.5">{{ lane.name }}</div>
          </div>
          <div class="text-2xl font-bold text-primary-400">{{ laneCounts[lane.id] || 0 }}</div>
        </div>
        <p class="text-xs text-gray-500 mt-2">{{ lane.description }}</p>
      </button>
    </div>

    <div v-if="executive" class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
      <div class="stat-card">
        <div class="stat-value">{{ executive.summary.working ?? executive.summary.total_active_deals }}</div>
        <div class="stat-label">Working (Intel → Verbal)</div>
      </div>
      <div class="stat-card">
        <div class="stat-value text-accent-gold">{{ executive.summary.at_proposal ?? 0 }}</div>
        <div class="stat-label">Proposal / verbal</div>
      </div>
      <div class="stat-card">
        <div class="stat-value text-accent-success">{{ executive.summary.won ?? 0 }}</div>
        <div class="stat-label">Won</div>
      </div>
      <div class="stat-card">
        <div class="stat-value" :class="(executive.summary.stalled ?? executive.summary.blocked_deals) > 0 ? 'text-accent-danger' : 'text-gray-400'">
          {{ executive.summary.stalled ?? executive.summary.blocked_deals }}
        </div>
        <div class="stat-label">Stalled / on hold</div>
      </div>
    </div>

    <div class="flex flex-wrap gap-3 mb-6">
      <input v-model="searchQuery" @change="loadData" class="input-field w-64" placeholder="Search organisation, trigger, problem…" />
      <select v-model="filterArchetype" @change="loadData" class="select-field w-44">
        <option value="">All archetypes</option>
        <option v-for="a in archetypes" :key="a.id" :value="a.id">{{ a.id }} — {{ a.name }}</option>
      </select>
      <select v-model="filterStage" @change="loadData" class="select-field w-48">
        <option value="">All conversion stages</option>
        <option v-for="s in stages" :key="s.id" :value="s.id">{{ s.label }}</option>
      </select>
      <button @click="loadData" class="btn-secondary text-sm">Refresh</button>
    </div>

    <div v-if="loading && deals.length === 0" class="py-12 text-center text-gray-500">Loading pipeline…</div>
    <div v-else-if="!loading && deals.length === 0" class="py-12 text-center text-gray-500">
      No opportunities in this view.
      <router-link to="/intake" class="text-primary-400 underline">Capture one</router-link>
      or
      <router-link to="/accounts" class="text-primary-400 underline">open the Account Map</router-link>.
    </div>

    <div v-else class="space-y-8">
      <section v-for="group in grouped" :key="group.lane.id">
        <h3 class="font-display font-semibold text-white mb-3">
          {{ group.lane.short }} — {{ group.lane.name }}
          <span class="text-sm font-normal text-gray-500 ml-2">{{ group.deals.length }}</span>
        </h3>
        <div v-if="group.deals.length === 0" class="text-sm text-gray-500 mb-2">No opportunities in this lane.</div>
        <div v-else class="card p-0 overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="border-b border-deep-600 text-left">
                <th class="py-3 px-4 text-gray-400 font-medium">Opportunity</th>
                <th class="py-3 px-4 text-gray-400 font-medium">Conversion</th>
                <th class="py-3 px-4 text-gray-400 font-medium">Trigger</th>
                <th class="py-3 px-4 text-gray-400 font-medium">Internal</th>
                <th class="py-3 px-4 text-gray-400 font-medium">Owner</th>
                <th class="py-3 px-4 text-gray-400 font-medium">Next action</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="deal in group.deals"
                :key="deal.id"
                class="border-b border-deep-700 hover:bg-deep-700/50 cursor-pointer transition-colors"
                @click="router.push(`/deals/${deal.id}`)"
              >
                <td class="py-3 px-4">
                  <div class="font-medium text-white">{{ deal.partner_name }}</div>
                  <div class="text-xs text-gray-500">
                    {{ deal.archetype }} · {{ deal.geography || 'NG' }}
                    <span v-if="deal.consortium_required" class="text-accent-gold"> · Consortium</span>
                  </div>
                  <div v-if="deal.conversion_gaps?.length" class="flex flex-wrap gap-1 mt-1">
                    <span
                      v-for="gap in deal.conversion_gaps"
                      :key="gap"
                      class="text-[11px] px-1.5 py-0.5 rounded bg-accent-gold/15 text-accent-gold"
                    >{{ gapLabel(gap) }}</span>
                  </div>
                </td>
                <td class="py-3 px-4">
                  <span class="badge" :class="stageColor(deal.current_stage)">{{ stageLabel(deal.current_stage) }}</span>
                </td>
                <td class="py-3 px-4 text-xs text-gray-300 max-w-[180px]">{{ deal.trigger_event || '—' }}</td>
                <td class="py-3 px-4">
                  <span class="text-xs text-gray-500 mr-1">sort</span>
                  <span class="font-semibold" :class="priorityColor(deal.priority_score)">{{ deal.priority_score ?? '—' }}</span>
                </td>
                <td class="py-3 px-4 text-xs text-gray-300">{{ deal.bd_owner || 'Unassigned' }}</td>
                <td class="py-3 px-4 text-xs text-gray-300 max-w-[180px]">{{ deal.next_action || deal.account_next_action || '—' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>
  </div>
</template>
