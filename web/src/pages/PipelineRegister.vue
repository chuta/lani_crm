<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { api, type Deal, type ExecutiveData } from '../lib/api'

const router = useRouter()
const deals = ref<Deal[]>([])
const executive = ref<ExecutiveData | null>(null)
const loading = ref(true)
const filterArchetype = ref('')
const filterStage = ref('')
const searchQuery = ref('')

const PIPELINE_STAGES = ['Lead', 'Intake & Classification', 'Tech Triage', 'Prioritization', 'Business Case / Proposal', 'Build', 'Pilot', 'Launch', 'Post-Launch Review']

async function loadData() {
  loading.value = true
  try {
    const params: Record<string, string> = {}
    if (filterArchetype.value) params.archetype = filterArchetype.value
    if (filterStage.value) params.stage = filterStage.value
    if (searchQuery.value) params.search = searchQuery.value

    const [dealsRes, execRes] = await Promise.all([
      api.listDeals(params),
      api.getExecutive(),
    ])
    deals.value = dealsRes.deals
    executive.value = execRes
  } catch (e) {
    console.error('Failed to load pipeline data:', e)
  } finally {
    loading.value = false
  }
}

onMounted(loadData)

function stageColor(stage: number): string {
  if (stage <= 2) return 'bg-gray-500/30 text-gray-300'
  if (stage <= 4) return 'bg-blue-500/30 text-blue-300'
  if (stage <= 6) return 'bg-yellow-500/30 text-yellow-300'
  if (stage <= 8) return 'bg-accent-success/30 text-accent-success'
  return 'bg-primary-500/30 text-primary-400'
}

function priorityColor(score: number | null): string {
  if (score === null) return 'text-gray-500'
  if (score >= 3) return 'text-accent-success'
  if (score >= 1.5) return 'text-accent-gold'
  return 'text-gray-400'
}
</script>

<template>
  <div>
    <div class="mb-6">
      <h2 class="text-2xl font-display font-bold text-white">📋 Integration Pipeline Register</h2>
      <p class="text-gray-400 mt-1">Section 5.2 — Every request, its archetype, priority score, and current stage</p>
    </div>

    <!-- Summary cards -->
    <div v-if="executive" class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
      <div class="stat-card">
        <div class="stat-value">{{ executive.summary.total_active_deals }}</div>
        <div class="stat-label">Active Deals</div>
      </div>
      <div class="stat-card">
        <div class="stat-value text-accent-gold">{{ executive.summary.awaiting_triage }}</div>
        <div class="stat-label">Awaiting Tech Triage</div>
      </div>
      <div class="stat-card">
        <div class="stat-value text-accent-success">{{ executive.summary.high_priority }}</div>
        <div class="stat-label">High Priority (score ≥ 3)</div>
      </div>
      <div class="stat-card">
        <div class="stat-value" :class="executive.summary.blocked_deals > 0 ? 'text-accent-danger' : 'text-gray-400'">{{ executive.summary.blocked_deals }}</div>
        <div class="stat-label">Blocked</div>
      </div>
    </div>

    <!-- Filters -->
    <div class="flex flex-wrap gap-3 mb-6">
      <input v-model="searchQuery" @input="loadData" class="input-field w-64" placeholder="Search partner name or description..." />
      <select v-model="filterArchetype" @change="loadData" class="select-field w-44">
        <option value="">All Archetypes</option>
        <option value="I">I — Embedded Account</option>
        <option value="II">II — Fund Wrapper</option>
        <option value="III">III — Payment Rails</option>
        <option value="IV">IV — Card Acceptance</option>
        <option value="V">V — Card Issuance</option>
        <option value="VI">VI — Exchange Listing</option>
        <option value="VII">VII — Zero-Integration</option>
      </select>
      <select v-model="filterStage" @change="loadData" class="select-field w-44">
        <option value="">All Stages</option>
        <option v-for="(s, i) in PIPELINE_STAGES" :key="i" :value="i + 1">{{ i + 1 }} — {{ s }}</option>
      </select>
      <button @click="loadData" class="btn-secondary text-sm">🔄 Refresh</button>
    </div>

    <!-- Table -->
    <div class="card p-0 overflow-x-auto">
      <table class="w-full text-sm">
        <thead>
          <tr class="border-b border-deep-600 text-left">
            <th class="py-3 px-4 text-gray-400 font-medium">Queue</th>
            <th class="py-3 px-4 text-gray-400 font-medium">Partner / Deal</th>
            <th class="py-3 px-4 text-gray-400 font-medium">Archetype</th>
            <th class="py-3 px-4 text-gray-400 font-medium">Priority</th>
            <th class="py-3 px-4 text-gray-400 font-medium">Stage</th>
            <th class="py-3 px-4 text-gray-400 font-medium">Blocker</th>
            <th class="py-3 px-4 text-gray-400 font-medium">Owners</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="loading && deals.length === 0">
            <td colspan="7" class="py-8 text-center text-gray-500">Loading pipeline data…</td>
          </tr>
          <tr v-for="deal in deals" :key="deal.id" @click="router.push(`/deals/${deal.id}`)" class="border-b border-deep-700 hover:bg-deep-700/50 cursor-pointer transition-colors">
            <td class="py-3 px-4">
              <span class="inline-flex items-center justify-center w-7 h-7 rounded-full bg-deep-700 text-xs font-bold text-gray-300">{{ deal.queue_position }}</span>
            </td>
            <td class="py-3 px-4">
              <div class="font-medium text-white">{{ deal.partner_name }}</div>
              <div v-if="deal.sector" class="text-xs text-gray-500">{{ deal.sector }}</div>
            </td>
            <td class="py-3 px-4">
              <span class="badge-archetype">Archetype {{ deal.archetype }}</span>
            </td>
            <td class="py-3 px-4">
              <span class="font-bold text-lg" :class="priorityColor(deal.priority_score)">{{ deal.priority_score ?? '—' }}</span>
            </td>
            <td class="py-3 px-4">
              <span class="badge" :class="stageColor(deal.current_stage)">
                {{ deal.current_stage }} — {{ PIPELINE_STAGES[deal.current_stage - 1] }}
              </span>
            </td>
            <td class="py-3 px-4">
              <span v-if="deal.blocking_factor" class="text-accent-danger text-xs">{{ deal.blocking_factor }}</span>
              <span v-else class="text-gray-600">—</span>
            </td>
            <td class="py-3 px-4">
              <div class="text-xs">
                <div v-if="deal.bd_owner" class="text-gray-300">BD: {{ deal.bd_owner }}</div>
                <div v-if="deal.tech_owner" class="text-gray-500">Tech: {{ deal.tech_owner }}</div>
                <div v-else class="text-gray-600 italic">No Tech owner</div>
              </div>
            </td>
          </tr>
          <tr v-if="!loading && deals.length === 0">
            <td colspan="7" class="py-8 text-center text-gray-500">No deals match your filters.</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>