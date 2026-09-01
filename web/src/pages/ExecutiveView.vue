<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { api, type ExecutiveData } from '../lib/api'

const router = useRouter()
const data = ref<ExecutiveData | null>(null)
const loading = ref(true)

onMounted(async () => {
  try {
    data.value = await api.getExecutive()
  } catch (e) {
    console.error('Failed to load executive view:', e)
  } finally {
    loading.value = false
  }
})

const PIPELINE_STAGES = ['Lead', 'Intake & Classification', 'Tech Triage', 'Prioritization', 'Business Case / Proposal', 'Build', 'Pilot', 'Launch', 'Post-Launch Review']

function maxFunnelCount(): number {
  if (!data.value) return 1
  return Math.max(...data.value.funnel.map((s: any) => s.count), 1)
}
</script>

<template>
  <div>
    <div class="mb-8">
      <h2 class="text-2xl font-display font-bold text-white">👁️ Executive Dashboard</h2>
      <p class="text-gray-400 mt-1">Section 5.2 — Mamadou View · Where every deal sits and why</p>
    </div>

    <div v-if="loading" class="text-center py-12 text-gray-500">Loading executive overview…</div>

    <template v-if="data">
      <!-- Summary banner -->
      <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <div class="stat-card">
          <div class="stat-value">{{ data.summary.total_active_deals }}</div>
          <div class="stat-label">Active Deals</div>
        </div>
        <div class="stat-card" :class="data.summary.awaiting_triage > 0 ? 'border-accent-gold/30' : ''">
          <div class="stat-value text-accent-gold">{{ data.summary.awaiting_triage }}</div>
          <div class="stat-label">Awaiting Tech Triage</div>
        </div>
        <div class="stat-card">
          <div class="stat-value text-accent-success">{{ data.summary.high_priority }}</div>
          <div class="stat-label">High Priority (≥ 3.0)</div>
        </div>
        <div class="stat-card" :class="data.summary.blocked_deals > 0 ? 'border-accent-danger/30' : ''">
          <div class="stat-value" :class="data.summary.blocked_deals > 0 ? 'text-accent-danger' : 'text-gray-400'">{{ data.summary.blocked_deals }}</div>
          <div class="stat-label">Blocked Deals</div>
        </div>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <!-- Funnel -->
        <div class="card">
          <h3 class="font-display font-semibold text-white mb-4">📊 Stage Funnel</h3>
          <div class="space-y-2">
            <div v-for="stage in data.funnel" :key="stage.stage_id" class="flex items-center gap-3">
              <span class="text-xs text-gray-500 w-16 text-right shrink-0">{{ stage.stage_id }}</span>
              <div class="flex-1 h-7 bg-deep-700 rounded-full overflow-hidden">
                <div
                  class="h-full rounded-full transition-all duration-500"
                  :class="stage.count > 0
                    ? stage.stage_id <= 2 ? 'bg-blue-500/60'
                       : stage.stage_id <= 4 ? 'bg-yellow-500/60'
                       : stage.stage_id <= 6 ? 'bg-accent-success/60'
                       : stage.stage_id <= 8 ? 'bg-primary-500/60'
                       : 'bg-gray-500/60'
                    : ''"
                  :style="{ width: (stage.count / maxFunnelCount() * 100) + '%' }"
                ></div>
              </div>
              <span class="text-xs text-gray-300 w-8 shrink-0">{{ stage.count }}</span>
              <span class="text-xs text-gray-500 truncate">{{ stage.stage_name }}</span>
            </div>
          </div>
        </div>

        <!-- Priority Distribution -->
        <div class="card">
          <h3 class="font-display font-semibold text-white mb-4">🎯 Priority Distribution</h3>
          <div v-if="data.priority_distribution.length === 0" class="text-gray-500 text-sm">No scored deals yet</div>
          <div v-else class="space-y-4">
            <div v-for="bucket in data.priority_distribution" :key="bucket.bucket" class="flex items-center gap-3">
              <span class="text-sm font-medium w-16"
                :class="bucket.bucket === 'high' ? 'text-accent-success' : bucket.bucket === 'medium' ? 'text-accent-gold' : 'text-gray-400'">
                {{ bucket.bucket === 'high' ? 'High' : bucket.bucket === 'medium' ? 'Medium' : 'Low' }}
              </span>
              <div class="flex-1 h-6 bg-deep-700 rounded-full overflow-hidden">
                <div
                  class="h-full rounded-full"
                  :class="bucket.bucket === 'high' ? 'bg-accent-success' : bucket.bucket === 'medium' ? 'bg-accent-gold' : 'bg-gray-500'"
                  :style="{ width: (bucket.count / Math.max(...data.priority_distribution.map((b: any) => b.count)) * 100) + '%' }"
                ></div>
              </div>
              <span class="text-sm text-gray-300 w-8">{{ bucket.count }}</span>
              <span class="text-xs text-gray-500">avg {{ bucket.avg_score }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Archetype Distribution -->
      <div class="card mb-8">
        <h3 class="font-display font-semibold text-white mb-4">📚 Archetype Distribution</h3>
        <div class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
          <div v-for="a in data.archetype_distribution" :key="a.archetype" class="text-center p-3 rounded-xl bg-deep-700">
            <div class="text-2xl font-bold font-display text-primary-400">{{ a.count }}</div>
            <div class="text-xs text-gray-400 mt-1">Archetype {{ a.archetype }}</div>
          </div>
        </div>
      </div>

      <!-- Queue -->
      <div class="card mb-8">
        <h3 class="font-display font-semibold text-white mb-4">📋 Active Queue</h3>
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="border-b border-deep-600 text-left">
                <th class="py-2 px-3 text-gray-400 font-medium">#</th>
                <th class="py-2 px-3 text-gray-400 font-medium">Partner</th>
                <th class="py-2 px-3 text-gray-400 font-medium">Arch</th>
                <th class="py-2 px-3 text-gray-400 font-medium">Score</th>
                <th class="py-2 px-3 text-gray-400 font-medium">Stage</th>
                <th class="py-2 px-3 text-gray-400 font-medium">BD Owner</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="deal in data.queue" :key="deal.id" @click="router.push(`/deals/${deal.id}`)" class="border-b border-deep-700 hover:bg-deep-700/50 cursor-pointer">
                <td class="py-2 px-3">{{ deal.queue_position }}</td>
                <td class="py-2 px-3 font-medium text-white">{{ deal.partner_name }}</td>
                <td class="py-2 px-3">
                  <span class="badge-archetype text-xs">{{ deal.archetype }}</span>
                </td>
                <td class="py-2 px-3 font-bold" :class="deal.priority_score >= 3 ? 'text-accent-success' : deal.priority_score >= 1.5 ? 'text-accent-gold' : 'text-gray-400'">{{ deal.priority_score ?? '—' }}</td>
                <td class="py-2 px-3 text-xs">{{ PIPELINE_STAGES[deal.current_stage - 1] }}</td>
                <td class="py-2 px-3 text-gray-400">{{ deal.bd_owner || '—' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Bottlenecks -->
      <div class="card">
        <h3 class="font-display font-semibold text-white mb-4">🚧 Bottlenecks & Suggestions</h3>
        <p class="text-sm text-gray-400 mb-4">What would move each blocked deal faster</p>
        <div v-if="data.bottlenecks.length === 0" class="text-gray-500 text-sm">No bottlenecks — all clear!</div>
        <div v-else class="space-y-3">
          <div v-for="b in data.bottlenecks" :key="b.deal_id" class="p-4 rounded-xl bg-deep-700 border border-deep-600">
            <div class="flex items-start justify-between gap-4">
              <div>
                <div class="font-medium text-white">{{ b.partner_name }}</div>
                <div class="text-xs text-gray-400 mt-1">{{ b.stage_name }} · Blocked: {{ b.blocking_factor }}</div>
                <div class="text-xs text-accent-gold mt-2">
                  <span class="font-medium">Suggestion:</span> {{ b.suggestion }}
                </div>
              </div>
              <router-link :to="`/deals/${b.deal_id}`" class="btn-secondary text-xs shrink-0">View</router-link>
            </div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>