<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { cpoApi } from '../lib/cpo-api'

const router = useRouter()

const targets = ref<any[]>([])
const tier1Targets = ref<any[]>([])
const tier2Targets = ref<any[]>([])
const loading = ref(true)
const showTier2 = ref(false)

// Filters
const searchQuery = ref('')
const filterCategory = ref('')
const filterStatus = ref('')

const BD_STAGES = [
  { id: 1,  label: 'Not Started', color: 'gray' },
  { id: 2,  label: 'Researching', color: 'blue' },
  { id: 3,  label: 'Ready for Outreach', color: 'indigo' },
  { id: 4,  label: 'Outreach Sent', color: 'cyan' },
  { id: 5,  label: 'In Conversation', color: 'teal' },
  { id: 6,  label: 'Meeting Scheduled', color: 'yellow' },
  { id: 7,  label: 'Proposal Sent', color: 'orange' },
  { id: 8,  label: 'On Hold', color: 'purple' },
  { id: 9,  label: 'Closed – Won', color: 'green' },
  { id: 10, label: 'Closed – Lost / No Fit', color: 'red' },
]

const CATEGORIES = ['Category A', 'Category B', 'Category C', 'Hold', 'Screening Queue']

async function loadData() {
  loading.value = true
  try {
    const params: Record<string, string> = {}
    if (filterCategory.value) params.category = filterCategory.value
    if (filterStatus.value) params.status = filterStatus.value
    if (searchQuery.value) params.search = searchQuery.value
    if (!filterCategory.value && !filterStatus.value && !searchQuery.value) {
      // Load all for both tiers
    }

    const res = await cpoApi.listBDTargets(params)
    targets.value = res.targets
    tier1Targets.value = res.targets.filter((t: any) => t.tier === 1)
    tier2Targets.value = res.targets.filter((t: any) => t.tier === 2)
  } catch (e) {
    console.error('Failed to load BD prospecting data:', e)
  } finally {
    loading.value = false
  }
}

onMounted(loadData)

async function updateStatus(target: any, newStatus: number) {
  try {
    const res = await cpoApi.updateBDStatus(target.id, newStatus)
    // Reload to reflect auto-promotion or deal creation
    await loadData()
    if (res.created_deal) {
      // Show brief success — deal was created in main pipeline
    }
  } catch (e) {
    console.error('Status update failed:', e)
  }
}

function stageColor(stage: number): string {
  const s = BD_STAGES.find(x => x.id === stage)
  if (!s) return 'bg-gray-500/30 text-gray-300'

  const map: Record<string, string> = {
    gray:   'bg-gray-500/20 text-gray-300 border-gray-500/30',
    blue:   'bg-blue-500/20 text-blue-300 border-blue-500/30',
    indigo: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30',
    cyan:   'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
    teal:   'bg-teal-500/20 text-teal-300 border-teal-500/30',
    yellow: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
    orange: 'bg-orange-500/20 text-orange-300 border-orange-500/30',
    purple: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
    green:  'bg-green-500/20 text-green-300 border-green-500/30',
    red:    'bg-red-500/20 text-red-300 border-red-500/30',
  }
  return map[s.color] || 'bg-gray-500/30 text-gray-300'
}

function stageLabel(id: number): string {
  return BD_STAGES.find(s => s.id === id)?.label || 'Unknown'
}

const tier1Stats = computed(() => ({
  total: tier1Targets.value.length,
  notStarted: tier1Targets.value.filter((t: any) => t.status === 1).length,
  inProgress: tier1Targets.value.filter((t: any) => t.status >= 2 && t.status <= 7).length,
  won: tier1Targets.value.filter((t: any) => t.status === 9).length,
  onHold: tier1Targets.value.filter((t: any) => t.status === 8).length,
  lost: tier1Targets.value.filter((t: any) => t.status === 10).length,
}))

const tier2Count = computed(() => tier2Targets.value.length)

function hasFlag(target: any, flag: string): boolean {
  return target.special_flags?.includes(flag)
}

function copyEmail(email: string) {
  navigator.clipboard.writeText(email).catch(() => {})
}

async function seedTargets() {
  try {
    const res = await cpoApi.seedBDTargets()
    if (res.skipped) {
      return
    }
    await loadData()
  } catch (e: any) {
    console.error('Seed failed:', e)
  }
}
</script>

<template>
  <div>
    <div class="mb-6 flex items-start justify-between">
      <div>
        <h2 class="text-2xl font-display font-bold text-white">🔍 BD Prospecting Tracker</h2>
        <p class="text-gray-400 mt-1">$GIFT Distribution — Nigerian Asset Manager Outreach Pipeline</p>
      </div>
      <button @click="seedTargets" class="btn-secondary text-sm flex items-center gap-1.5">
        <span>🌱</span> Seed Data
      </button>
    </div>

    <!-- ── Tier 1 Stats ── -->
    <div class="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
      <div class="stat-card">
        <div class="stat-value">{{ tier1Stats.total }}</div>
        <div class="stat-label">Working Targets</div>
      </div>
      <div class="stat-card">
        <div class="stat-value text-gray-400">{{ tier1Stats.notStarted }}</div>
        <div class="stat-label">Not Started</div>
      </div>
      <div class="stat-card">
        <div class="stat-value text-cyan-300">{{ tier1Stats.inProgress }}</div>
        <div class="stat-label">In Progress</div>
      </div>
      <div class="stat-card">
        <div class="stat-value text-green-300">{{ tier1Stats.won }}</div>
        <div class="stat-label">Closed – Won</div>
      </div>
      <div class="stat-card">
        <div class="stat-value" :class="tier1Stats.onHold > 0 ? 'text-purple-300' : 'text-gray-400'">{{ tier1Stats.onHold }}</div>
        <div class="stat-label">On Hold</div>
      </div>
    </div>

    <!-- ── Filters ── -->
    <div class="flex flex-wrap gap-3 mb-6">
      <input v-model="searchQuery" @input="loadData" class="input-field w-72" placeholder="Search firm name, notes, or email…" />
      <select v-model="filterCategory" @change="loadData" class="select-field w-48">
        <option value="">All Categories</option>
        <option v-for="c in CATEGORIES" :key="c" :value="c">{{ c }}</option>
      </select>
      <select v-model="filterStatus" @change="loadData" class="select-field w-44">
        <option value="">All Stages</option>
        <option v-for="s in BD_STAGES" :key="s.id" :value="s.id">{{ s.id }} — {{ s.label }}</option>
      </select>
      <button @click="loadData" class="btn-secondary text-sm">🔄 Refresh</button>
    </div>

    <!-- ── Loading ── -->
    <div v-if="loading" class="py-12 text-center text-gray-500">Loading prospecting data…</div>

    <!-- ════════════════════════════════════════════════════════════════ -->
    <!-- ── TIER 1: Working Tracker ── -->
    <!-- ════════════════════════════════════════════════════════════════ -->
    <template v-if="!loading">
      <div v-if="tier1Targets.length === 0 && tier2Targets.length === 0" class="py-12 text-center text-gray-500">
        No targets found. Click <button @click="seedTargets" class="text-primary-400 underline cursor-pointer">Seed Data</button> to populate the list.
      </div>

      <div v-if="tier1Targets.length > 0" class="mb-8">
        <div class="card p-0 overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="border-b border-deep-600 text-left">
                <th class="py-3 px-4 text-gray-400 font-medium w-8">#</th>
                <th class="py-3 px-4 text-gray-400 font-medium">Firm</th>
                <th class="py-3 px-4 text-gray-400 font-medium">Category</th>
                <th class="py-3 px-4 text-gray-400 font-medium">Contact</th>
                <th class="py-3 px-4 text-gray-400 font-medium">Stage</th>
                <th class="py-3 px-4 text-gray-400 font-medium">Next Action</th>
                <th class="py-3 px-4 text-gray-400 font-medium">Notes</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(target, i) in tier1Targets" :key="target.id" class="border-b border-deep-700 hover:bg-deep-700/50 transition-colors">
                <td class="py-3 px-4">
                  <span class="inline-flex items-center justify-center w-6 h-6 rounded-full bg-deep-700 text-xs font-bold text-gray-400">{{ i + 1 }}</span>
                </td>
                <td class="py-3 px-4">
                  <div class="flex items-center gap-2">
                    <span class="font-medium text-white">{{ target.firm_name }}</span>
                    <span v-if="hasFlag(target, 'warm_intro_hold')" class="badge bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[10px]">🔒 Warm Intro Hold</span>
                    <span v-if="hasFlag(target, 'entity_name_gap')" class="badge bg-red-500/20 text-red-300 border border-red-500/30 text-[10px]">⚠️ Entity Gap</span>
                    <span v-if="target.auto_promoted" class="badge bg-accent-teal/20 text-accent-teal border border-accent-teal/30 text-[10px]">↑ Promoted</span>
                    <span v-if="target.deal_id" class="badge bg-green-500/20 text-green-300 border border-green-500/30 text-[10px]">📈 Deal Created</span>
                    <span v-if="target.proposal_id" class="badge bg-orange-500/20 text-orange-300 border border-orange-500/30 text-[10px]">📄 Has Proposal</span>
                  </div>
                  <div v-if="target.why_this_fits" class="text-xs text-gray-500 mt-0.5 max-w-md truncate">{{ target.why_this_fits }}</div>
                </td>
                <td class="py-3 px-4">
                  <span class="badge" :class="{
                    'bg-emerald-500/20 text-emerald-300 border-emerald-500/30': target.category === 'Category A',
                    'bg-blue-500/20 text-blue-300 border-blue-500/30': target.category === 'Category B',
                    'bg-amber-500/20 text-amber-300 border-amber-500/30': target.category === 'Category C',
                    'bg-purple-500/20 text-purple-300 border-purple-500/30': target.category === 'Hold',
                  }">
                    {{ target.category }}
                  </span>
                </td>
                <td class="py-3 px-4">
                  <div v-if="target.contact_email" class="flex items-center gap-1">
                    <a :href="'mailto:' + target.contact_email" class="text-accent-teal hover:underline text-xs truncate max-w-[140px] inline-block">{{ target.contact_email }}</a>
                    <button @click="copyEmail(target.contact_email)" class="text-gray-500 hover:text-gray-300 text-[10px]" title="Copy">📋</button>
                  </div>
                  <span v-else class="text-gray-600 text-xs">—</span>
                </td>
                <td class="py-3 px-4 min-w-[180px]">
                  <select
                    :value="target.status"
                    @change="updateStatus(target, Number(($event.target as HTMLSelectElement).value))"
                    class="select-field text-xs py-1 px-2 w-full"
                    :class="stageColor(target.status)"
                  >
                    <option v-for="s in BD_STAGES" :key="s.id" :value="s.id" :disabled="s.id === 9 && target.status >= 9 || s.id === 10 && target.status >= 10">
                      {{ s.label }}
                    </option>
                  </select>
                </td>
                <td class="py-3 px-4 text-xs text-gray-300 max-w-[140px]">{{ target.next_action || '—' }}</td>
                <td class="py-3 px-4 text-xs text-gray-500 max-w-[180px] truncate">{{ target.notes || '—' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- ════════════════════════════════════════════════════════════════ -->
      <!-- ── TIER 2: Screening Queue ── -->
      <!-- ════════════════════════════════════════════════════════════════ -->
      <div v-if="tier2Targets.length > 0" class="mb-4">
        <button
          @click="showTier2 = !showTier2"
          class="flex items-center gap-3 w-full px-4 py-3 bg-deep-800 border border-deep-600 rounded-xl hover:bg-deep-700 transition-colors"
        >
          <span class="text-lg">{{ showTier2 ? '▼' : '▶' }}</span>
          <div class="text-left">
            <span class="font-display font-semibold text-white">Screening Queue</span>
            <span class="text-gray-400 text-sm ml-2">({{ tier2Count }} unscreened firms)</span>
          </div>
          <span class="ml-auto text-xs text-gray-500">Click to {{ showTier2 ? 'collapse' : 'expand' }}</span>
        </button>
      </div>

      <div v-if="showTier2 && tier2Targets.length > 0">
        <div class="card p-0 overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="border-b border-deep-600 text-left">
                <th class="py-2.5 px-4 text-gray-400 font-medium">Firm</th>
                <th class="py-2.5 px-4 text-gray-400 font-medium">Contact</th>
                <th class="py-2.5 px-4 text-gray-400 font-medium">Status</th>
                <th class="py-2.5 px-4 text-gray-400 font-medium">Promote → Tier 1</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="target in tier2Targets" :key="target.id" class="border-b border-deep-700 hover:bg-deep-700/50 transition-colors">
                <td class="py-2.5 px-4">
                  <span class="font-medium text-white text-sm">{{ target.firm_name }}</span>
                </td>
                <td class="py-2.5 px-4">
                  <div v-if="target.contact_email" class="flex items-center gap-1">
                    <a :href="'mailto:' + target.contact_email" class="text-accent-teal hover:underline text-xs">{{ target.contact_email }}</a>
                    <button @click="copyEmail(target.contact_email)" class="text-gray-500 hover:text-gray-300 text-[10px]">📋</button>
                  </div>
                  <span v-else class="text-gray-600 text-xs">—</span>
                </td>
                <td class="py-2.5 px-4">
                  <span class="badge text-xs" :class="stageColor(target.status)">{{ stageLabel(target.status) }}</span>
                </td>
                <td class="py-2.5 px-4">
                  <button
                    @click="updateStatus(target, 2)"
                    class="text-xs text-accent-teal hover:text-accent-teal/80 underline"
                  >
                    Promote (set Researching)
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p class="text-xs text-gray-500 mt-2 px-2">Promoting a target sets status to "Researching" and moves it into Tier 1 — Working Tracker.</p>
      </div>
    </template>
  </div>
</template>