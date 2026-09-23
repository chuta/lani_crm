<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { cpoApi } from '../lib/cpo-api'
import { useAuth } from '../lib/auth'

const auth = useAuth()

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
const TIERS = [
  { id: 1, label: 'Tier 1 — Working Tracker' },
  { id: 2, label: 'Tier 2 — Screening Queue' },
]

const showAddModal = ref(false)
const adding = ref(false)
const addError = ref('')
const addForm = ref(emptyAddForm())

const selected = ref<any | null>(null)
const editing = ref(false)
const saving = ref(false)
const archiving = ref(false)
const detailError = ref('')
const editForm = ref<any>({})

function emptyAddForm() {
  return {
    firm_name: '',
    category: 'Screening Queue',
    tier: 2,
    contact_email: '',
    why_this_fits: '',
    notes: '',
    next_action: '',
    bd_owner: auth.profile.value?.full_name || auth.profile.value?.email || '',
  }
}

function openAdd() {
  addForm.value = emptyAddForm()
  addError.value = ''
  showAddModal.value = true
}

function onAddCategoryChange() {
  if (addForm.value.category === 'Screening Queue') addForm.value.tier = 2
  else if (addForm.value.tier === 2) addForm.value.tier = 1
}

async function submitAdd() {
  addError.value = ''
  if (!addForm.value.firm_name.trim()) {
    addError.value = 'Firm name is required.'
    return
  }
  adding.value = true
  try {
    await cpoApi.createBDTarget({
      ...addForm.value,
      firm_name: addForm.value.firm_name.trim(),
      contact_email: addForm.value.contact_email.trim() || null,
      status: 1,
    })
    if (Number(addForm.value.tier) === 2) showTier2.value = true
    showAddModal.value = false
    await loadData()
  } catch (e: any) {
    addError.value = e.message || 'Could not add prospect.'
  } finally {
    adding.value = false
  }
}

function openDetail(target: any) {
  selected.value = { ...target }
  editing.value = false
  detailError.value = ''
  editForm.value = {}
}

function startEdit() {
  if (!selected.value) return
  editing.value = true
  detailError.value = ''
  editForm.value = {
    firm_name: selected.value.firm_name || '',
    category: selected.value.category || 'Screening Queue',
    tier: Number(selected.value.tier) || 2,
    status: Number(selected.value.status) || 1,
    contact_email: selected.value.contact_email || '',
    why_this_fits: selected.value.why_this_fits || '',
    notes: selected.value.notes || '',
    next_action: selected.value.next_action || '',
    bd_owner: selected.value.bd_owner || '',
    special_flags: selected.value.special_flags || '',
  }
}

function cancelEdit() {
  editing.value = false
  detailError.value = ''
}

function closeDetail() {
  selected.value = null
  editing.value = false
  detailError.value = ''
}

async function saveEdit() {
  if (!selected.value) return
  if (!editForm.value.firm_name?.trim()) {
    detailError.value = 'Firm name is required.'
    return
  }
  saving.value = true
  detailError.value = ''
  try {
    const payload = {
      firm_name: editForm.value.firm_name.trim(),
      category: editForm.value.category,
      tier: Number(editForm.value.tier),
      contact_email: editForm.value.contact_email.trim() || null,
      why_this_fits: editForm.value.why_this_fits || null,
      notes: editForm.value.notes || null,
      next_action: editForm.value.next_action || null,
      bd_owner: editForm.value.bd_owner || null,
      special_flags: editForm.value.special_flags || null,
    }
    const statusChanged = Number(editForm.value.status) !== Number(selected.value.status)
    const res = await cpoApi.updateBDTarget(selected.value.id, payload)
    selected.value = res.target
    if (statusChanged) {
      const statusRes = await cpoApi.updateBDStatus(selected.value.id, Number(editForm.value.status))
      selected.value = statusRes.target
    }
    editing.value = false
    await loadData()
  } catch (e: any) {
    detailError.value = e.message || 'Could not save changes.'
  } finally {
    saving.value = false
  }
}

async function archiveSelected() {
  if (!selected.value) return
  if (!confirm(`Archive ${selected.value.firm_name}? It will be hidden from the tracker.`)) return
  archiving.value = true
  detailError.value = ''
  try {
    await cpoApi.archiveBDTarget(selected.value.id)
    closeDetail()
    await loadData()
  } catch (e: any) {
    detailError.value = e.message || 'Could not archive prospect.'
  } finally {
    archiving.value = false
  }
}

function tierLabel(id: number): string {
  return TIERS.find(t => t.id === id)?.label || `Tier ${id}`
}

function formatDate(value?: string | null): string {
  if (!value) return '—'
  const d = new Date(value.includes('T') ? value : value.replace(' ', 'T') + 'Z')
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleString()
}

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
</script>

<template>
  <div>
    <div class="mb-6 flex items-start justify-between">
      <div>
        <h2 class="text-2xl font-display font-bold text-white">🔍 BD Prospecting Tracker</h2>
        <p class="text-gray-400 mt-1">B2B Outreach Pipeline</p>
      </div>
      <div class="flex items-center gap-2">
        <button @click="openAdd" class="btn-primary text-sm flex items-center gap-1.5">
          <span>+</span> Add Prospect
        </button>
      </div>
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
        No targets found.
        <button @click="openAdd" class="text-primary-400 underline cursor-pointer">Add a prospect</button>
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
              <tr
                v-for="(target, i) in tier1Targets"
                :key="target.id"
                class="border-b border-deep-700 hover:bg-deep-700/50 transition-colors cursor-pointer"
                @click="openDetail(target)"
              >
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
                    <a :href="'mailto:' + target.contact_email" @click.stop class="text-accent-teal hover:underline text-xs truncate max-w-[140px] inline-block">{{ target.contact_email }}</a>
                    <button @click.stop="copyEmail(target.contact_email)" class="text-gray-500 hover:text-gray-300 text-[10px]" title="Copy">📋</button>
                  </div>
                  <span v-else class="text-gray-600 text-xs">—</span>
                </td>
                <td class="py-3 px-4 min-w-[180px]">
                  <select
                    :value="target.status"
                    @click.stop
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
              <tr
                v-for="target in tier2Targets"
                :key="target.id"
                class="border-b border-deep-700 hover:bg-deep-700/50 transition-colors cursor-pointer"
                @click="openDetail(target)"
              >
                <td class="py-2.5 px-4">
                  <span class="font-medium text-white text-sm">{{ target.firm_name }}</span>
                </td>
                <td class="py-2.5 px-4">
                  <div v-if="target.contact_email" class="flex items-center gap-1">
                    <a :href="'mailto:' + target.contact_email" @click.stop class="text-accent-teal hover:underline text-xs">{{ target.contact_email }}</a>
                    <button @click.stop="copyEmail(target.contact_email)" class="text-gray-500 hover:text-gray-300 text-[10px]">📋</button>
                  </div>
                  <span v-else class="text-gray-600 text-xs">—</span>
                </td>
                <td class="py-2.5 px-4">
                  <span class="badge text-xs" :class="stageColor(target.status)">{{ stageLabel(target.status) }}</span>
                </td>
                <td class="py-2.5 px-4">
                  <button
                    @click.stop="updateStatus(target, 2)"
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

    <!-- Add Prospect -->
    <div v-if="showAddModal" class="fixed inset-0 z-[70] flex items-start justify-center bg-black/60 p-4 overflow-y-auto" @click.self="showAddModal = false">
      <div class="bg-deep-800 border border-deep-600 rounded-xl p-6 w-full max-w-lg my-8">
        <div class="flex items-center justify-between mb-6">
          <h3 class="text-lg font-display font-semibold text-white">+ Add New Prospect</h3>
          <button class="text-gray-400 hover:text-white text-xl leading-none" @click="showAddModal = false">×</button>
        </div>
        <form class="space-y-4" @submit.prevent="submitAdd">
          <div>
            <label class="label">Firm Name *</label>
            <input v-model="addForm.firm_name" class="input-field" placeholder="e.g. UBA Asset Management" required />
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="label">Category</label>
              <select v-model="addForm.category" class="select-field" @change="onAddCategoryChange">
                <option v-for="c in CATEGORIES" :key="c" :value="c">{{ c }}</option>
              </select>
            </div>
            <div>
              <label class="label">Tier</label>
              <select v-model.number="addForm.tier" class="select-field">
                <option v-for="t in TIERS" :key="t.id" :value="t.id">{{ t.label }}</option>
              </select>
            </div>
          </div>
          <div>
            <label class="label">Contact Email</label>
            <input v-model="addForm.contact_email" type="email" class="input-field" placeholder="compliance@firm.com" />
          </div>
          <div>
            <label class="label">Why This Fits</label>
            <textarea v-model="addForm.why_this_fits" class="input-field min-h-[80px]" placeholder="Why is this firm a good target?" />
          </div>
          <div>
            <label class="label">Notes</label>
            <textarea v-model="addForm.notes" class="input-field min-h-[80px]" placeholder="Internal notes…" />
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="label">Next Action</label>
              <input v-model="addForm.next_action" class="input-field" placeholder="e.g. Send warm intro" />
            </div>
            <div>
              <label class="label">BD Owner</label>
              <input v-model="addForm.bd_owner" class="input-field" placeholder="Your name" />
            </div>
          </div>
          <p v-if="addError" class="text-sm text-red-400">{{ addError }}</p>
          <div class="flex justify-end gap-3 pt-2">
            <button type="button" class="btn-secondary" @click="showAddModal = false">Cancel</button>
            <button type="submit" class="btn-primary" :disabled="adding || !addForm.firm_name.trim()">
              {{ adding ? 'Adding…' : '+ Add Prospect' }}
            </button>
          </div>
        </form>
      </div>
    </div>

    <!-- Prospect detail -->
    <div v-if="selected" class="fixed inset-0 z-[70] flex items-start justify-center bg-black/60 p-4 overflow-y-auto" @click.self="closeDetail">
      <div class="bg-deep-800 border border-deep-600 rounded-xl p-6 w-full max-w-2xl my-8">
        <div class="flex items-start justify-between gap-4 mb-6">
          <div>
            <h3 class="text-lg font-display font-semibold text-white">{{ selected.firm_name }}</h3>
            <p class="text-sm text-gray-500 mt-1">{{ tierLabel(selected.tier) }} · {{ stageLabel(selected.status) }}</p>
          </div>
          <div class="flex items-center gap-2 shrink-0">
            <button v-if="!editing" class="btn-secondary text-sm" @click="startEdit">✏️ Edit</button>
            <button class="btn-secondary text-sm text-red-400 hover:text-red-300" :disabled="archiving" @click="archiveSelected">
              {{ archiving ? 'Archiving…' : '🗑️ Archive' }}
            </button>
            <button class="text-gray-400 hover:text-white text-xl leading-none px-1" @click="closeDetail">×</button>
          </div>
        </div>

        <div v-if="!editing" class="space-y-4 text-sm">
          <div class="flex flex-wrap gap-2">
            <span class="badge" :class="{
              'bg-emerald-500/20 text-emerald-300 border-emerald-500/30': selected.category === 'Category A',
              'bg-blue-500/20 text-blue-300 border-blue-500/30': selected.category === 'Category B',
              'bg-amber-500/20 text-amber-300 border-amber-500/30': selected.category === 'Category C',
              'bg-purple-500/20 text-purple-300 border-purple-500/30': selected.category === 'Hold',
              'bg-gray-500/20 text-gray-300 border-gray-500/30': selected.category === 'Screening Queue',
            }">{{ selected.category }}</span>
            <span class="badge" :class="stageColor(selected.status)">{{ stageLabel(selected.status) }}</span>
            <span v-if="selected.auto_promoted" class="badge bg-accent-teal/20 text-accent-teal border-accent-teal/30">↑ Promoted</span>
            <span v-if="selected.deal_id" class="badge bg-green-500/20 text-green-300 border-green-500/30">📈 Deal Created</span>
            <span v-if="selected.proposal_id" class="badge bg-orange-500/20 text-orange-300 border-orange-500/30">📄 Has Proposal</span>
          </div>
          <dl class="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
            <div>
              <dt class="text-xs text-gray-500 mb-1">Contact</dt>
              <dd class="text-gray-200">
                <a v-if="selected.contact_email" :href="'mailto:' + selected.contact_email" class="text-accent-teal hover:underline">{{ selected.contact_email }}</a>
                <span v-else class="text-gray-600">—</span>
              </dd>
            </div>
            <div>
              <dt class="text-xs text-gray-500 mb-1">BD Owner</dt>
              <dd class="text-gray-200">{{ selected.bd_owner || '—' }}</dd>
            </div>
            <div>
              <dt class="text-xs text-gray-500 mb-1">Next Action</dt>
              <dd class="text-gray-200">{{ selected.next_action || '—' }}</dd>
            </div>
            <div>
              <dt class="text-xs text-gray-500 mb-1">Last Contacted</dt>
              <dd class="text-gray-200">{{ formatDate(selected.last_contacted_at) }}</dd>
            </div>
            <div class="sm:col-span-2">
              <dt class="text-xs text-gray-500 mb-1">Why This Fits</dt>
              <dd class="text-gray-200 whitespace-pre-wrap">{{ selected.why_this_fits || '—' }}</dd>
            </div>
            <div class="sm:col-span-2">
              <dt class="text-xs text-gray-500 mb-1">Notes</dt>
              <dd class="text-gray-200 whitespace-pre-wrap">{{ selected.notes || '—' }}</dd>
            </div>
            <div v-if="selected.special_flags">
              <dt class="text-xs text-gray-500 mb-1">Flags</dt>
              <dd class="text-gray-200">{{ selected.special_flags }}</dd>
            </div>
            <div>
              <dt class="text-xs text-gray-500 mb-1">Updated</dt>
              <dd class="text-gray-400">{{ formatDate(selected.updated_at) }}</dd>
            </div>
          </dl>
        </div>

        <form v-else class="space-y-4" @submit.prevent="saveEdit">
          <div>
            <label class="label">Firm Name *</label>
            <input v-model="editForm.firm_name" class="input-field" required />
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="label">Category</label>
              <select v-model="editForm.category" class="select-field">
                <option v-for="c in CATEGORIES" :key="c" :value="c">{{ c }}</option>
              </select>
            </div>
            <div>
              <label class="label">Tier</label>
              <select v-model.number="editForm.tier" class="select-field">
                <option v-for="t in TIERS" :key="t.id" :value="t.id">{{ t.label }}</option>
              </select>
            </div>
          </div>
          <div>
            <label class="label">Stage</label>
            <select v-model.number="editForm.status" class="select-field">
              <option v-for="s in BD_STAGES" :key="s.id" :value="s.id">{{ s.label }}</option>
            </select>
          </div>
          <div>
            <label class="label">Contact Email</label>
            <input v-model="editForm.contact_email" type="email" class="input-field" />
          </div>
          <div>
            <label class="label">Why This Fits</label>
            <textarea v-model="editForm.why_this_fits" class="input-field min-h-[80px]" />
          </div>
          <div>
            <label class="label">Notes</label>
            <textarea v-model="editForm.notes" class="input-field min-h-[80px]" />
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="label">Next Action</label>
              <input v-model="editForm.next_action" class="input-field" />
            </div>
            <div>
              <label class="label">BD Owner</label>
              <input v-model="editForm.bd_owner" class="input-field" />
            </div>
          </div>
          <div>
            <label class="label">Special Flags</label>
            <input v-model="editForm.special_flags" class="input-field" placeholder="Optional flags" />
          </div>
          <div class="flex justify-end gap-3 pt-2">
            <button type="button" class="btn-secondary" @click="cancelEdit">Cancel</button>
            <button type="submit" class="btn-primary" :disabled="saving">{{ saving ? 'Saving…' : 'Save changes' }}</button>
          </div>
        </form>

        <p v-if="detailError" class="text-sm text-red-400 mt-4">{{ detailError }}</p>
      </div>
    </div>
  </div>
</template>