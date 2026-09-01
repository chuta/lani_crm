<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { cpoApi } from '../lib/cpo-api'
import { PROPOSAL_STATES, STATE_COLORS, type DashboardData } from '../lib/cpo-types'

const router = useRouter()
const data = ref<DashboardData | null>(null)
const proposals = ref<any[]>([])
const loading = ref(true)
const error = ref('')
const showPromoteDialog = ref(false)
const promoteDealId = ref('')
const promoteDealUrl = ref('')
const promoteContact = ref('')
const promoteCountry = ref('')
const promoteVertical = ref('')
const promoteLoading = ref(false)
const showBdDialog = ref(false)
const bdFirm = ref('')
const bdContact = ref('')
const bdCountry = ref('')
const bdVertical = ref('')
const bdRef = ref('')
const bdUrl = ref('')
const bdLoading = ref(false)
const searchQuery = ref('')
const filterState = ref('')
const filterSource = ref('')

async function load() {
  loading.value = true
  error.value = ''
  try {
    const [dash, list] = await Promise.all([
      cpoApi.dashboard(),
      cpoApi.listProposals({ archived: 'false' }),
    ])
    data.value = dash as any
    proposals.value = list.proposals
  } catch (e: any) {
    error.value = e.message
  } finally {
    loading.value = false
  }
}

async function doPromote() {
  if (!promoteDealId.value) return
  promoteLoading.value = true
  try {
    const result = await cpoApi.promoteDeal(promoteDealId.value, {
      pipedrive_deal_url: promoteDealUrl.value,
      partner_contact: promoteContact.value,
      country: promoteCountry.value,
      vertical: promoteVertical.value,
    })
    showPromoteDialog.value = false
    router.push(`/proposals/${result.proposal.id}`)
  } catch (e: any) {
    error.value = e.message
  } finally {
    promoteLoading.value = false
  }
}

async function doPromoteBd() {
  if (!bdFirm.value) return
  bdLoading.value = true
  try {
    const result = await cpoApi.promoteBd({
      firm_name: bdFirm.value,
      partner_contact: bdContact.value,
      country: bdCountry.value,
      vertical: bdVertical.value,
      bd_tracker_deal_ref: bdRef.value,
      pipedrive_deal_url: bdUrl.value,
    })
    showBdDialog.value = false
    router.push(`/proposals/${result.proposal.id}`)
  } catch (e: any) {
    error.value = e.message
  } finally {
    bdLoading.value = false
  }
}

function stateBadge(state: string) {
  const meta = PROPOSAL_STATES.find(s => s.id === state)
  return meta ? { icon: meta.icon, label: meta.label, color: meta.color } : { icon: '❓', label: state, color: 'text-gray-500' }
}

function sourceBadge(source: string) {
  const map: Record<string, { icon: string; label: string; color: string }> = {
    bd_tracker: { icon: '📋', label: 'BD Tracker', color: 'text-blue-400' },
    pipedrive: { icon: '🔗', label: 'Pipedrive', color: 'text-green-400' },
    manual: { icon: '✍️', label: 'Manual', color: 'text-gray-400' },
  }
  return map[source] || { icon: '❓', label: source, color: 'text-gray-400' }
}

function currency(v: any): string {
  if (v === null || v === undefined) return '—'
  return '$' + Number(v).toLocaleString('en-US', { maximumFractionDigits: 0 })
}

onMounted(load)
</script>

<template>
  <div>
    <!-- Header -->
    <div class="flex flex-wrap items-center justify-between mb-6">
      <div>
        <h2 class="text-2xl font-display font-bold text-white">📄 Commercial Control Tower</h2>
        <p class="text-gray-400 mt-1">CPO — Proposal lifecycle, readiness, and release management</p>
      </div>
      <div class="flex gap-2">
        <button @click="load" class="px-3 py-2 text-sm bg-deep-700 text-gray-300 rounded-lg hover:bg-deep-600 transition-colors">🔄 Refresh</button>
        <button @click="showPromoteDialog = true" class="px-4 py-2 text-sm bg-primary-500/20 text-primary-400 rounded-lg hover:bg-primary-500/30 transition-colors">+ Promote Deal</button>
        <button @click="showBdDialog = true" class="px-4 py-2 text-sm bg-blue-500/20 text-blue-400 rounded-lg hover:bg-blue-500/30 transition-colors">📋 BD Tracker → CPO</button>
      </div>
    </div>

    <!-- Error -->
    <div v-if="error" class="mb-6 p-4 bg-red-900/30 border border-red-700/50 rounded-lg text-red-400 text-sm">{{ error }}</div>

    <!-- Loading -->
    <div v-if="loading" class="text-center py-12 text-gray-500">Loading Commercial Control Tower…</div>

    <template v-if="data">
      <!-- Summary cards -->
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 mb-6">
        <div class="stat-card">
          <div class="stat-value text-white">{{ data.summary.total_active }}</div>
          <div class="stat-label">Active Proposals</div>
        </div>
        <div class="stat-card" :class="data.summary.release_ready > 0 ? 'border-accent-success/30' : ''">
          <div class="stat-value text-accent-success">{{ data.summary.release_ready }}</div>
          <div class="stat-label">Release Ready</div>
        </div>
        <div class="stat-card">
          <div class="stat-value text-yellow-400">{{ data.summary.in_draft }}</div>
          <div class="stat-label">In Draft</div>
        </div>
        <div class="stat-card">
          <div class="stat-value text-purple-400">{{ data.summary.awaiting_review }}</div>
          <div class="stat-label">Awaiting Review</div>
        </div>
        <div class="stat-card" :class="data.summary.blocked > 0 ? 'border-accent-danger/30' : ''">
          <div class="stat-value" :class="data.summary.blocked > 0 ? 'text-accent-danger' : 'text-gray-400'">{{ data.summary.blocked }}</div>
          <div class="stat-label">Blocked</div>
        </div>
      </div>

      <!-- Attention Required -->
      <div v-if="data.attention_required.length > 0" class="mb-6">
        <div class="flex items-center gap-2 mb-3">
          <h3 class="font-semibold text-white">⚠️ Attention Required</h3>
          <span class="text-xs px-2 py-0.5 rounded-full bg-red-900/30 text-red-400">{{ data.attention_required.length }} item(s)</span>
        </div>
        <div class="space-y-2">
          <div v-for="item in data.attention_required" :key="item.proposal_id + item.issue + (item.function_area || '')"
            class="flex items-center gap-3 p-3 rounded-lg"
            :class="item.severity === 'high' ? 'bg-red-900/20 border border-red-800/30' : 'bg-yellow-900/20 border border-yellow-800/30'"
          >
            <span :class="item.severity === 'high' ? 'text-accent-danger' : 'text-yellow-400'" class="text-lg shrink-0">{{ item.issue === 'approval_overdue' ? '🔴' : '⚠️' }}</span>
            <div class="flex-1 min-w-0">
              <router-link :to="`/proposals/${item.proposal_id}`" class="text-white hover:text-primary-400 text-sm font-medium">{{ item.partner }}</router-link>
              <p class="text-xs" :class="item.severity === 'high' ? 'text-red-400' : 'text-yellow-400'">{{ item.detail }}</p>
              <p v-if="item.function_area" class="text-xs text-gray-600 mt-0.5">Function: {{ item.function_area.replace(/_/g, ' ') }}</p>
            </div>
            <router-link :to="`/proposals/${item.proposal_id}#${item.target_tab}`"
              class="shrink-0 px-3 py-1.5 text-xs rounded-lg transition-colors font-medium"
              :class="item.issue === 'approval_overdue' ? 'bg-primary-500/20 text-primary-400 hover:bg-primary-500/30' : 'bg-amber-500/20 text-amber-400 hover:bg-amber-500/30'"
            >Resolve →</router-link>
          </div>
        </div>
      </div>

      <!-- Pipeline Funnel -->
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        <div class="card lg:col-span-2">
          <h3 class="font-semibold text-white mb-4">📊 Proposal Pipeline</h3>
          <div class="space-y-2">
            <div v-for="s in data.pipeline" :key="s.state" class="flex items-center gap-3">
              <span class="text-xs text-gray-500 w-24 text-right shrink-0">{{ s.state.replace(/_/g, ' ') }}</span>
              <span class="w-7 h-2 rounded-full shrink-0" :class="STATE_COLORS[s.state] || 'bg-gray-600'"></span>
              <div class="flex-1 h-6 bg-deep-700 rounded-full overflow-hidden">
                <div class="h-full rounded-full transition-all duration-500 bg-gray-600/60"
                  :style="{ width: Math.min(100, (s.count / Math.max(...data.pipeline.map(x => x.count), 1)) * 100) + '%' }"
                ></div>
              </div>
              <span class="text-xs text-gray-300 w-8 shrink-0 text-right">{{ s.count }}</span>
              <span class="text-xs text-gray-500 w-20 shrink-0 text-right">{{ s.total_revenue > 0 ? currency(s.total_revenue) : '' }}</span>
            </div>
          </div>
        </div>
        <div class="card">
          <h3 class="font-semibold text-white mb-4">🏷️ State Legend</h3>
          <div class="space-y-1.5 text-xs text-gray-400">
            <div v-for="s in PROPOSAL_STATES" :key="s.id" class="flex items-center gap-2">
              <span class="w-2 h-2 rounded-full shrink-0" :class="STATE_COLORS[s.id]"></span>
              <span>{{ s.icon }} {{ s.label }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Proposals Table -->
      <div class="card">
        <div class="flex flex-wrap items-center justify-between mb-4">
          <h3 class="font-semibold text-white">All Proposals</h3>
          <div class="flex gap-2">
            <input v-model="searchQuery" placeholder="Search proposals…" class="px-3 py-1.5 text-sm bg-deep-700 text-gray-200 rounded-lg border border-deep-600 focus:border-primary-500 outline-none w-48" />
            <select v-model="filterState" class="px-3 py-1.5 text-sm bg-deep-700 text-gray-200 rounded-lg border border-deep-600 focus:border-primary-500 outline-none">
              <option value="">All states</option>
              <option v-for="s in PROPOSAL_STATES" :key="s.id" :value="s.id">{{ s.label }}</option>
            </select>
          </div>
        </div>
        <div v-if="proposals.length === 0" class="text-center py-8 text-gray-500 text-sm">
          No proposals yet. Promote a deal to start.
        </div>
        <div v-else class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="text-left text-gray-500 border-b border-deep-600">
                <th class="py-2 pr-4">Ref</th>
                <th class="py-2 pr-4">Partner</th>
                <th class="py-2 pr-4">Source</th>
                <th class="py-2 pr-4">Model</th>
                <th class="py-2 pr-4">State</th>
                <th class="py-2 pr-4">Revenue</th>
                <th class="py-2 pr-4">Owner</th>
                <th class="py-2 pr-4">Created</th>
                <th class="py-2"></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="p in proposals.filter(x => !searchQuery || x.partner_name.toLowerCase().includes(searchQuery.toLowerCase()) || x.id.toLowerCase().includes(searchQuery.toLowerCase())).filter(x => !filterState || x.current_state === filterState)" :key="p.id" class="border-b border-deep-700 hover:bg-deep-700/50 transition-colors">
                <td class="py-2 pr-4"><router-link :to="`/proposals/${p.id}`" class="text-primary-400 hover:text-primary-300 font-mono text-xs">{{ p.id }}</router-link></td>
                <td class="py-2 pr-4 text-white font-medium">{{ p.partner_name }}</td>
                <td class="py-2 pr-4"><span class="inline-flex items-center gap-1 text-xs" :class="sourceBadge(p.source || 'manual').color">{{ sourceBadge(p.source || 'manual').icon }} {{ sourceBadge(p.source || 'manual').label }}</span></td>
                <td class="py-2 pr-4 text-gray-400">{{ p.commercial_model || '—' }}</td>
                <td class="py-2 pr-4">
                  <span class="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-deep-700" :class="(PROPOSAL_STATES.find(s => s.id === p.current_state)?.color) || 'text-gray-400'">
                    <span>{{ PROPOSAL_STATES.find(s => s.id === p.current_state)?.icon }}</span>
                    <span>{{ PROPOSAL_STATES.find(s => s.id === p.current_state)?.label || p.current_state }}</span>
                  </span>
                </td>
                <td class="py-2 pr-4 text-gray-400">{{ p.expected_revenue ? currency(p.expected_revenue) : '—' }}</td>
                <td class="py-2 pr-4 text-gray-400">{{ p.owner || '—' }}</td>
                <td class="py-2 pr-4 text-gray-500 text-xs">{{ new Date(p.created_at).toLocaleDateString('en-GB') }}</td>
                <td class="py-2"><router-link :to="`/proposals/${p.id}`" class="text-xs text-primary-400 hover:text-primary-300">Open →</router-link></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </template>

    <!-- Promote Dialog (Pipedrive / partnership pipeline) -->
    <div v-if="showPromoteDialog" class="fixed inset-0 z-50 flex items-center justify-center bg-black/60" @click.self="showPromoteDialog = false">
      <div class="bg-deep-800 border border-deep-600 rounded-xl p-6 w-full max-w-md mx-4">
        <h3 class="text-lg font-semibold text-white mb-4">🚀 Promote Deal to CPO</h3>
        <p class="text-sm text-gray-400 mb-4">Promote from the <strong>partnership pipeline</strong> (port 3003 deals table).</p>
        <div class="space-y-3">
          <div>
            <label class="block text-xs text-gray-400 mb-1">Deal ID <span class="text-red-400">*</span></label>
            <input v-model="promoteDealId" placeholder="e.g. BAM-001" class="w-full px-3 py-2 text-sm bg-deep-700 text-white rounded-lg border border-deep-600 focus:border-primary-500 outline-none" />
          </div>
          <div>
            <label class="block text-xs text-gray-400 mb-1">Pipedrive URL</label>
            <input v-model="promoteDealUrl" placeholder="https://ubuntu.pipedrive.com/deal/42" class="w-full px-3 py-2 text-sm bg-deep-700 text-white rounded-lg border border-deep-600 focus:border-primary-500 outline-none" />
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block text-xs text-gray-400 mb-1">Country</label>
              <input v-model="promoteCountry" placeholder="Nigeria" class="w-full px-3 py-2 text-sm bg-deep-700 text-white rounded-lg border border-deep-600 focus:border-primary-500 outline-none" />
            </div>
            <div>
              <label class="block text-xs text-gray-400 mb-1">Vertical</label>
              <input v-model="promoteVertical" placeholder="Banking" class="w-full px-3 py-2 text-sm bg-deep-700 text-white rounded-lg border border-deep-600 focus:border-primary-500 outline-none" />
            </div>
          </div>
          <div>
            <label class="block text-xs text-gray-400 mb-1">Partner Contact</label>
            <input v-model="promoteContact" placeholder="name@partner.com" class="w-full px-3 py-2 text-sm bg-deep-700 text-white rounded-lg border border-deep-600 focus:border-primary-500 outline-none" />
          </div>
        </div>
        <div class="flex gap-3 mt-6">
          <button @click="showPromoteDialog = false" class="flex-1 py-2 text-sm text-gray-400 bg-deep-700 rounded-lg hover:bg-deep-600 transition-colors">Cancel</button>
          <button @click="doPromote" :disabled="!promoteDealId || promoteLoading" class="flex-1 py-2 text-sm text-white bg-primary-500/80 rounded-lg hover:bg-primary-500 disabled:opacity-40 transition-colors">
            {{ promoteLoading ? 'Promoting…' : 'Promote to CPO' }}
          </button>
        </div>
      </div>
    </div>

    <!-- Promote from BD Tracker Dialog -->
    <div v-if="showBdDialog" class="fixed inset-0 z-50 flex items-center justify-center bg-black/60" @click.self="showBdDialog = false">
      <div class="bg-deep-800 border border-deep-600 rounded-xl p-6 w-full max-w-md mx-4">
        <h3 class="text-lg font-semibold text-white mb-4">📋 BD Tracker → CPO</h3>
        <p class="text-sm text-gray-400 mb-4">Create a CPO proposal from a deal tracked in the <a href="https://skynet.utribe.app/bd-tracker/" target="_blank" class="text-blue-400 hover:text-blue-300 underline">BD Tracker</a>. A placeholder deal will also be created.</p>
        <div class="space-y-3">
          <div>
            <label class="block text-xs text-gray-400 mb-1">Firm / Partner Name <span class="text-red-400">*</span></label>
            <input v-model="bdFirm" placeholder="e.g. Chapel Hill Denham" class="w-full px-3 py-2 text-sm bg-deep-700 text-white rounded-lg border border-deep-600 focus:border-primary-500 outline-none" />
          </div>
          <div>
            <label class="block text-xs text-gray-400 mb-1">BD Tracker Deal Ref</label>
            <input v-model="bdRef" placeholder="Firm name as shown in BD Tracker" class="w-full px-3 py-2 text-sm bg-deep-700 text-white rounded-lg border border-deep-600 focus:border-primary-500 outline-none" />
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block text-xs text-gray-400 mb-1">Country</label>
              <input v-model="bdCountry" placeholder="Nigeria" class="w-full px-3 py-2 text-sm bg-deep-700 text-white rounded-lg border border-deep-600 focus:border-primary-500 outline-none" />
            </div>
            <div>
              <label class="block text-xs text-gray-400 mb-1">Vertical</label>
              <input v-model="bdVertical" placeholder="Asset Mgmt" class="w-full px-3 py-2 text-sm bg-deep-700 text-white rounded-lg border border-deep-600 focus:border-primary-500 outline-none" />
            </div>
          </div>
          <div>
            <label class="block text-xs text-gray-400 mb-1">Partner Contact</label>
            <input v-model="bdContact" placeholder="name@partner.com" class="w-full px-3 py-2 text-sm bg-deep-700 text-white rounded-lg border border-deep-600 focus:border-primary-500 outline-none" />
          </div>
          <div>
            <label class="block text-xs text-gray-400 mb-1">Pipedrive URL (if any)</label>
            <input v-model="bdUrl" placeholder="https://ubuntu.pipedrive.com/deal/…" class="w-full px-3 py-2 text-sm bg-deep-700 text-white rounded-lg border border-deep-600 focus:border-primary-500 outline-none" />
          </div>
        </div>
        <div class="flex gap-3 mt-6">
          <button @click="showBdDialog = false" class="flex-1 py-2 text-sm text-gray-400 bg-deep-700 rounded-lg hover:bg-deep-600 transition-colors">Cancel</button>
          <button @click="doPromoteBd" :disabled="!bdFirm || bdLoading" class="flex-1 py-2 text-sm text-white bg-blue-500/80 rounded-lg hover:bg-blue-500 disabled:opacity-40 transition-colors">
            {{ bdLoading ? 'Promoting…' : 'Promote to CPO' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>