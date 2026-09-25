<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { api, type CommercialLane, type ExecutiveData } from '../lib/api'

const router = useRouter()
const data = ref<ExecutiveData | null>(null)
const lanes = ref<CommercialLane[]>([])
const loading = ref(true)

onMounted(async () => {
  try {
    const [exec, catalog] = await Promise.all([
      api.getExecutive(),
      api.listArchetypes(),
    ])
    data.value = exec
    lanes.value = catalog.lanes || []
  } catch (e) {
    console.error('Failed to load executive view:', e)
  } finally {
    loading.value = false
  }
})

function maxFunnelCount(): number {
  if (!data.value) return 1
  return Math.max(...data.value.funnel.map((s: any) => s.count), 1)
}

function maxLaneCount(): number {
  if (!data.value?.lanes?.length) return 1
  return Math.max(...data.value.lanes.map((l) => l.count), 1)
}

function maxTriggerCount(): number {
  if (!data.value?.trigger_distribution?.length) return 1
  return Math.max(...data.value.trigger_distribution.map((t) => t.count), 1)
}

function stageLabel(id: number) {
  return data.value?.funnel.find((s: any) => s.stage_id === id)?.stage_name || `Stage ${id}`
}

function laneName(id?: string) {
  return lanes.value.find((l) => l.id === id)?.name || id || '—'
}

const workingQueue = computed(() =>
  (data.value?.queue || []).filter((d: any) => d.current_stage >= 1 && d.current_stage <= 5)
)
</script>

<template>
  <div>
    <div class="mb-8">
      <h2 class="text-2xl font-display font-bold text-white">Executive Dashboard</h2>
      <p class="text-gray-400 mt-1">By commercial lane, archetype, trigger, and conversion only</p>
    </div>

    <div v-if="loading" class="text-center py-12 text-gray-500">Loading executive overview…</div>

    <template v-if="data">
      <div class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4 mb-8">
        <div class="stat-card">
          <div class="stat-value">{{ data.summary.working ?? data.summary.total_active_deals }}</div>
          <div class="stat-label">Working opportunities</div>
        </div>
        <div class="stat-card">
          <div class="stat-value text-accent-gold">{{ data.summary.at_proposal ?? 0 }}</div>
          <div class="stat-label">Proposal / verbal</div>
        </div>
        <div class="stat-card">
          <div class="stat-value text-accent-success">{{ data.summary.won ?? 0 }}</div>
          <div class="stat-label">Won</div>
        </div>
        <div class="stat-card" :class="(data.summary.stalled ?? data.summary.blocked_deals) > 0 ? 'border-accent-danger/30' : ''">
          <div class="stat-value" :class="(data.summary.stalled ?? data.summary.blocked_deals) > 0 ? 'text-accent-danger' : 'text-gray-400'">
            {{ data.summary.stalled ?? data.summary.blocked_deals }}
          </div>
          <div class="stat-label">Stalled / on hold</div>
        </div>
        <div class="stat-card" :class="(data.summary.missing_next_action || 0) > 0 ? 'border-accent-gold/30' : ''">
          <div class="stat-value" :class="(data.summary.missing_next_action || 0) > 0 ? 'text-accent-gold' : 'text-gray-400'">{{ data.summary.missing_next_action ?? 0 }}</div>
          <div class="stat-label">Missing next action</div>
        </div>
        <div class="stat-card" :class="(data.summary.unnamed_consortium || 0) > 0 ? 'border-accent-gold/30' : ''">
          <div class="stat-value" :class="(data.summary.unnamed_consortium || 0) > 0 ? 'text-accent-gold' : 'text-gray-400'">{{ data.summary.unnamed_consortium ?? 0 }}</div>
          <div class="stat-label">Unnamed consortium</div>
        </div>
        <div class="stat-card">
          <div class="stat-value text-primary-400">{{ data.summary.ecosystem_partners ?? 0 }}</div>
          <div class="stat-label">Ecosystem partners</div>
        </div>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <div class="card">
          <h3 class="font-display font-semibold text-white mb-4">Four commercial lanes</h3>
          <div v-if="!data.lanes?.length" class="text-gray-500 text-sm">No lane data yet</div>
          <div v-else class="space-y-3">
            <div v-for="lane in data.lanes" :key="lane.id" class="flex items-center gap-3">
              <span class="text-xs text-gray-400 w-36 shrink-0">{{ lane.short }} · {{ lane.name }}</span>
              <div class="flex-1 h-7 bg-deep-700 rounded-full overflow-hidden">
                <div
                  class="h-full rounded-full bg-primary-500/70 transition-all duration-500"
                  :style="{ width: (lane.count / maxLaneCount() * 100) + '%' }"
                ></div>
              </div>
              <span class="text-xs text-gray-300 w-8 shrink-0">{{ lane.count }}</span>
            </div>
          </div>
        </div>

        <div class="card">
          <h3 class="font-display font-semibold text-white mb-4">Conversion path</h3>
          <div class="space-y-2">
            <div v-for="stage in data.funnel" :key="stage.stage_id" class="flex items-center gap-3">
              <span class="text-xs text-gray-500 w-28 text-right shrink-0 truncate">{{ stage.stage_name }}</span>
              <div class="flex-1 h-7 bg-deep-700 rounded-full overflow-hidden">
                <div
                  class="h-full rounded-full transition-all duration-500"
                  :class="stage.count > 0
                    ? stage.stage_id <= 2 ? 'bg-blue-500/60'
                       : stage.stage_id <= 5 ? 'bg-yellow-500/60'
                       : stage.stage_id === 6 ? 'bg-accent-success/60'
                       : stage.stage_id === 7 ? 'bg-accent-danger/60'
                       : 'bg-purple-500/60'
                    : ''"
                  :style="{ width: (stage.count / maxFunnelCount() * 100) + '%' }"
                ></div>
              </div>
              <span class="text-xs text-gray-300 w-8 shrink-0">{{ stage.count }}</span>
            </div>
          </div>
        </div>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <div class="card">
          <h3 class="font-display font-semibold text-white mb-4">Archetype mix</h3>
          <div class="grid grid-cols-3 gap-4">
            <div v-for="a in data.archetype_distribution" :key="a.archetype" class="text-center p-3 rounded-xl bg-deep-700">
              <div class="text-2xl font-bold font-display text-primary-400">{{ a.count }}</div>
              <div class="text-xs text-gray-400 mt-1">{{ a.archetype }}</div>
            </div>
            <div v-if="data.archetype_distribution.length === 0" class="col-span-3 text-gray-500 text-sm">No opportunities yet</div>
          </div>
        </div>

        <div class="card">
          <h3 class="font-display font-semibold text-white mb-4">Commercial triggers</h3>
          <div v-if="!data.trigger_distribution?.length" class="text-gray-500 text-sm">No trigger data yet</div>
          <div v-else class="space-y-2">
            <div v-for="t in data.trigger_distribution" :key="t.trigger_event" class="flex items-center gap-3">
              <span class="text-xs text-gray-400 w-44 shrink-0 truncate">{{ t.trigger_event }}</span>
              <div class="flex-1 h-5 bg-deep-700 rounded-full overflow-hidden">
                <div class="h-full rounded-full bg-accent-gold/70" :style="{ width: (t.count / maxTriggerCount() * 100) + '%' }"></div>
              </div>
              <span class="text-xs text-gray-300 w-6">{{ t.count }}</span>
            </div>
          </div>
        </div>
      </div>

      <div class="card mb-8">
        <h3 class="font-display font-semibold text-white mb-4">Working queue</h3>
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="border-b border-deep-600 text-left">
                <th class="py-2 px-3 text-gray-400 font-medium">Organisation</th>
                <th class="py-2 px-3 text-gray-400 font-medium">Lane</th>
                <th class="py-2 px-3 text-gray-400 font-medium">Arch</th>
                <th class="py-2 px-3 text-gray-400 font-medium">Internal</th>
                <th class="py-2 px-3 text-gray-400 font-medium">Conversion</th>
                <th class="py-2 px-3 text-gray-400 font-medium">Owner</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="workingQueue.length === 0">
                <td colspan="6" class="py-6 text-center text-gray-500">No working opportunities yet</td>
              </tr>
              <tr v-for="deal in workingQueue" :key="deal.id" @click="router.push(`/accounts?open=${deal.account_id || deal.id}`)" class="border-b border-deep-700 hover:bg-deep-700/50 cursor-pointer">
                <td class="py-2 px-3 font-medium text-white">{{ deal.partner_name }}</td>
                <td class="py-2 px-3 text-xs text-gray-400">{{ laneName(deal.lane) }}</td>
                <td class="py-2 px-3">
                  <span class="badge-archetype text-xs">{{ deal.archetype }}</span>
                </td>
                <td class="py-2 px-3 font-bold" :class="deal.priority_score >= 4 ? 'text-accent-success' : deal.priority_score >= 3 ? 'text-accent-gold' : 'text-gray-400'">{{ deal.priority_score ?? '—' }}</td>
                <td class="py-2 px-3 text-xs">{{ stageLabel(deal.current_stage) }}</td>
                <td class="py-2 px-3 text-gray-400">{{ deal.bd_owner || '—' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div class="card">
        <h3 class="font-display font-semibold text-white mb-4">Stalled opportunities</h3>
        <p class="text-sm text-gray-400 mb-4">What would move conversion — not a tech-triage queue</p>
        <div v-if="data.bottlenecks.length === 0" class="text-gray-500 text-sm">Nothing stalled.</div>
        <div v-else class="space-y-3">
          <div v-for="b in data.bottlenecks" :key="b.deal_id" class="p-4 rounded-xl bg-deep-700 border border-deep-600">
            <div class="flex items-start justify-between gap-4">
              <div>
                <div class="font-medium text-white">{{ b.partner_name }}</div>
                <div class="text-xs text-gray-400 mt-1">{{ b.stage_name }} · {{ b.lane }} · {{ b.blocking_factor }}</div>
                <div class="text-xs text-accent-gold mt-2">
                  <span class="font-medium">Next:</span> {{ b.suggestion }}
                </div>
              </div>
              <router-link :to="`/accounts?open=${b.account_id || b.deal_id}`" class="btn-secondary text-xs shrink-0">View</router-link>
            </div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>
