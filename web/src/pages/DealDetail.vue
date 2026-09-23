<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  api,
  CONVERSION_GAP_LABELS,
  type Account,
  type AccountStage,
  type Archetype,
  type CommercialLane,
  type CommercialModel,
  type Deal,
  type Geography,
  type PartnershipRole,
  type SectorOverlay,
} from '../lib/api'
import { useAuth } from '../lib/auth'

const route = useRoute()
const router = useRouter()
const auth = useAuth()
const deal = ref<Deal | null>(null)
const transitions = ref<any[]>([])
const archetypes = ref<Archetype[]>([])
const sectors = ref<SectorOverlay[]>([])
const roles = ref<PartnershipRole[]>([])
const geographies = ref<Geography[]>([])
const lanes = ref<CommercialLane[]>([])
const stages = ref<AccountStage[]>([])
const models = ref<CommercialModel[]>([])
const partnerAccounts = ref<Account[]>([])
const loading = ref(true)
const error = ref('')

const showStageModal = ref(false)
const newStage = ref(0)
const stageNote = ref('')
const stageNextAction = ref('')
const stageDecisionDate = ref('')
const stagePartnerId = ref('')

const showBlockerModal = ref(false)
const blockerText = ref('')

const showEditModal = ref(false)
const editSaving = ref(false)
const editForm = ref({
  partner_name: '',
  sector: '',
  partnership_role: 'end_client',
  geography: 'NG',
  lane: 'immediate',
  description: '',
  bd_owner: '',
  urgency: '',
  archetype: '',
  next_action: '',
  expected_decision_date: '',
  delivery_partner_account_id: '',
})

async function loadDeal() {
  const id = route.params.id as string
  if (!id) return
  loading.value = true; error.value = ''
  try {
    const [res, catalog] = await Promise.all([
      api.getDeal(id),
      api.listArchetypes(),
    ])
    deal.value = res.deal
    transitions.value = res.transitions
    archetypes.value = catalog.archetypes
    sectors.value = catalog.sectors
    roles.value = catalog.partnership_roles
    geographies.value = catalog.geographies
    lanes.value = catalog.lanes || []
    stages.value = catalog.account_stages || []
    models.value = catalog.commercial_models || []
    const partners = await api.listAccounts()
    partnerAccounts.value = partners.accounts
  } catch (e: any) {
    error.value = e.message || 'Failed to load opportunity'
  } finally { loading.value = false }
}

function stageLabel(id?: number | null) {
  return stages.value.find((s) => s.id === id)?.label || `Stage ${id ?? '?'}`
}
function laneLabel(id?: string | null) {
  return lanes.value.find((l) => l.id === id)?.name || id || '—'
}

async function moveStage() {
  if (!deal.value || !newStage.value) return
  try {
    const actor = auth.profile.value?.full_name || auth.profile.value?.email || 'BD'
    const res = await api.advanceStage(deal.value.id, newStage.value, actor, stageNote.value, {
      next_action: stageNextAction.value || deal.value.next_action,
      expected_decision_date: stageDecisionDate.value || deal.value.expected_decision_date,
      delivery_partner_account_id: stagePartnerId.value || deal.value.delivery_partner_account_id,
    })
    deal.value = res.deal
    showStageModal.value = false
    stageNote.value = ''
    newStage.value = 0
    await loadDeal()
  } catch (e: any) { error.value = e.message || 'Failed to move stage' }
}

function openStageModal() {
  if (!deal.value) return
  stageNextAction.value = deal.value.next_action || deal.value.account_next_action || ''
  stageDecisionDate.value = deal.value.expected_decision_date || ''
  stagePartnerId.value = deal.value.delivery_partner_account_id || ''
  showStageModal.value = true
}

async function updateBlocker() {
  if (!deal.value) return
  try {
    const res = await api.updateBlocker(deal.value.id, blockerText.value)
    deal.value = res.deal; showBlockerModal.value = false
  } catch (e: any) { error.value = e.message || 'Failed to update blocker' }
}

async function clearBlocker() {
  if (!deal.value) return
  try { const res = await api.updateBlocker(deal.value.id, ''); deal.value = res.deal }
  catch (e: any) { error.value = e.message || 'Failed to clear blocker' }
}

function openEdit() {
  if (!deal.value) return
  editForm.value = {
    partner_name: deal.value.partner_name,
    sector: deal.value.sector || '',
    partnership_role: deal.value.partnership_role || 'end_client',
    geography: deal.value.geography || 'NG',
    lane: deal.value.lane || 'immediate',
    description: deal.value.description || '',
    bd_owner: deal.value.bd_owner || '',
    urgency: deal.value.urgency || '',
    archetype: deal.value.archetype || '',
    next_action: deal.value.next_action || deal.value.account_next_action || '',
    expected_decision_date: deal.value.expected_decision_date || '',
    delivery_partner_account_id: deal.value.delivery_partner_account_id || '',
  }
  showEditModal.value = true
}

async function saveEdit() {
  if (!deal.value) return
  editSaving.value = true
  try {
    const res = await api.updateDeal(deal.value.id, editForm.value)
    deal.value = res.deal
    showEditModal.value = false
    error.value = ''
  } catch (e: any) {
    error.value = e.message || 'Failed to update opportunity'
  } finally {
    editSaving.value = false
  }
}

async function confirmArchive() {
  if (!deal.value) return
  if (!confirm('Archive this opportunity? It stays on the account map.')) return
  try {
    await api.archiveDeal(deal.value.id)
    router.push('/pipeline')
  } catch (e: any) {
    error.value = e.message || 'Failed to archive opportunity'
  }
}

function priorityColor(score: number | null): string {
  if (score === null) return 'text-gray-500'
  if (score >= 4) return 'text-accent-success'
  if (score >= 3) return 'text-accent-gold'
  return 'text-gray-400'
}

function roleLabel(id?: string | null): string {
  return roles.value.find((r) => r.id === id)?.name || id || 'End client'
}
function modelLabel(id?: string | null): string {
  return models.value.find((m) => m.id === id)?.name || id || '—'
}
function gapLabel(id: string) {
  return CONVERSION_GAP_LABELS[id] || id
}
function geographyLabel(id?: string | null): string {
  return geographies.value.find((g) => g.id === id)?.name || id || 'Nigeria'
}
function sectorLabel(id?: string | null): string {
  return sectors.value.find((s) => s.id === id)?.name || id || 'No sector overlay'
}

onMounted(loadDeal)
</script>

<template>
  <div>
    <div v-if="loading" class="text-center py-12 text-gray-500">Loading opportunity…</div>
    <div v-else-if="!deal && error" class="card border-accent-danger/30 text-accent-danger">{{ error }}</div>
    <div v-else-if="deal">
      <div v-if="error" class="card border-accent-danger/30 text-accent-danger mb-6">{{ error }}</div>
      <router-link to="/pipeline" class="text-sm text-gray-500 hover:text-gray-300 mb-2 inline-block">← Back to Pipeline</router-link>
      <div class="flex items-start justify-between mb-6">
        <div>
          <h2 class="text-2xl font-display font-bold text-white">{{ deal.partner_name }}</h2>
          <p class="text-gray-400 mt-1">{{ laneLabel(deal.lane) }} · {{ stageLabel(deal.current_stage) }} · {{ geographyLabel(deal.geography) }} · {{ roleLabel(deal.partnership_role) }}</p>
        </div>
        <span class="badge-archetype text-base py-1.5 px-4">Archetype {{ deal.archetype }}</span>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        <div class="card lg:col-span-3">
          <h3 class="font-display font-semibold text-white mb-4">Opportunity information</h3>
          <div class="grid grid-cols-2 gap-4 text-sm">
            <div><div class="label">Relationship owner</div><div class="text-white">{{ deal.bd_owner || '—' }}</div></div>
            <div><div class="label">Partnership role</div><div class="text-white">{{ roleLabel(deal.partnership_role) }}</div></div>
            <div><div class="label">Geography</div><div class="text-white">{{ geographyLabel(deal.geography) }}</div></div>
            <div><div class="label">Commercial lane</div><div class="text-white">{{ laneLabel(deal.lane) }}</div></div>
            <div v-if="deal.account_id">
              <div class="label">Account</div>
              <router-link :to="`/accounts?open=${deal.account_id}`" class="text-primary-400 hover:underline">Open on Account Map</router-link>
            </div>
            <div><div class="label">Sector overlay</div><div class="text-white">{{ sectorLabel(deal.sector) }}</div></div>
            <div><div class="label">Trigger</div><div class="text-white">{{ deal.trigger_event || '—' }}</div></div>
            <div><div class="label">Decision-maker</div><div class="text-white">{{ deal.decision_maker || '—' }}</div></div>
            <div>
              <div class="label">Blocking factor</div>
              <div v-if="deal.blocking_factor" class="flex items-center gap-2">
                <span class="text-accent-danger">{{ deal.blocking_factor }}</span>
                <button @click="clearBlocker" class="text-xs text-gray-500 hover:text-white">✕ clear</button>
              </div>
              <div v-else class="text-gray-500 italic">None</div>
            </div>
            <div v-if="deal.consortium_required" class="text-accent-gold">Consortium / delivery partner required</div>
            <div>
              <div class="label">Commercial model</div>
              <div class="text-white">{{ modelLabel(deal.commercial_model) }}</div>
            </div>
            <div>
              <div class="label">Named delivery partner</div>
              <div class="text-white">{{ deal.delivery_partner_name || '—' }}</div>
            </div>
            <div class="col-span-2">
              <div class="label">Strategic problem / what is changing</div>
              <div class="text-gray-300">{{ deal.description || 'No description' }}</div>
            </div>
          </div>
        </div>
      </div>
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <div class="stat-card">
          <div class="stat-label">Internal sort</div>
          <div class="stat-value" :class="priorityColor(deal.priority_score)">{{ deal.priority_score ?? '—' }}</div>
          <div class="text-xs text-gray-500 mt-2">Average of five qualification scores</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Conversion stage</div>
          <div class="stat-value text-base pt-1">{{ stageLabel(deal.current_stage) }}</div>
          <div class="text-xs text-gray-500 mt-2">Owner: {{ deal.bd_owner || 'Unassigned' }}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Next action</div>
          <div class="stat-value text-base pt-1">{{ deal.next_action || deal.account_next_action || '—' }}</div>
          <div class="text-xs text-gray-500 mt-2">{{ deal.expected_decision_date ? `Decision ${deal.expected_decision_date}` : 'Expected decision date not set' }}</div>
        </div>
      </div>

      <div v-if="deal.conversion_gaps?.length" class="card border-accent-gold/30 mb-8 text-sm text-accent-gold">
        Conversion discipline: {{ deal.conversion_gaps.map(gapLabel).join(' · ') }}
      </div>

      <div class="card mb-8">
        <h3 class="font-display font-semibold text-white mb-4">Conversion timeline</h3>
        <div class="relative">
          <div class="absolute left-[11px] top-2 bottom-2 w-0.5 bg-deep-600"></div>
          <div v-if="transitions.length === 0" class="text-gray-500 text-sm ml-8 py-2">No transitions recorded</div>
          <div v-for="(t, i) in transitions" :key="t.id" class="relative pl-10 pb-4 last:pb-0">
            <div class="absolute left-[5px] top-[5px] w-3.5 h-3.5 rounded-full border-2"
              :class="i === transitions.length - 1 ? 'bg-primary-500 border-primary-400' : 'bg-deep-700 border-deep-500'"></div>
            <div class="text-sm">
              <span class="font-medium text-white">{{ stageLabel(t.to_stage) }}</span>
              <span v-if="t.from_stage" class="text-gray-500"> (from {{ stageLabel(t.from_stage) }})</span>
              <span class="text-xs text-gray-500 ml-2">{{ new Date(t.created_at).toLocaleString() }}</span>
            </div>
            <div v-if="t.triggered_by" class="text-xs text-gray-500 mt-0.5">by {{ t.triggered_by }}</div>
            <div v-if="t.note" class="text-xs text-gray-400 mt-0.5 italic">{{ t.note }}</div>
          </div>
        </div>
      </div>

      <div class="card">
        <h3 class="font-display font-semibold text-white mb-4">Actions</h3>
        <div class="flex flex-wrap gap-3">
          <button @click="openEdit" class="text-sm py-2 px-4 rounded-lg bg-deep-700 text-gray-300 hover:bg-deep-600 transition-colors">Edit</button>
          <button @click="openStageModal" class="btn-primary text-sm">Move stage</button>
          <button @click="showBlockerModal = true" class="btn-secondary text-sm">Add blocker</button>
          <button @click="confirmArchive" class="text-sm py-2 px-4 rounded-lg border border-accent-danger/30 text-accent-danger hover:bg-accent-danger/10 transition-colors">Archive</button>
        </div>
      </div>

      <div v-if="showStageModal" class="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" @click.self="showStageModal = false">
        <div class="bg-deep-800 border border-deep-600 rounded-xl p-6 w-full max-w-md">
          <h3 class="font-display font-semibold text-white mb-4">Move conversion stage</h3>
          <div class="space-y-4">
            <div><label class="label">Current stage</label><div class="text-gray-300">{{ stageLabel(deal.current_stage) }}</div></div>
            <div><label class="label">New stage</label>
              <select v-model.number="newStage" class="select-field">
                <option :value="0">Select stage…</option>
                <option v-for="s in stages" :key="s.id" :value="s.id" :disabled="s.id === deal.current_stage">{{ s.label }}</option>
              </select>
            </div>
            <div><label class="label">Next action</label><input v-model="stageNextAction" class="input-field" placeholder="Required from Qualified through Verbal" /></div>
            <div><label class="label">Expected decision date</label><input v-model="stageDecisionDate" type="date" class="input-field" /></div>
            <div>
              <label class="label">Named delivery partner</label>
              <select v-model="stagePartnerId" class="select-field">
                <option value="">Not named yet</option>
                <option v-for="p in partnerAccounts.filter((a) => a.id !== deal.account_id)" :key="p.id" :value="p.id">{{ p.organisation }}</option>
              </select>
            </div>
            <div><label class="label">Note</label><input v-model="stageNote" class="input-field" placeholder="What moved?" /></div>
            <div class="flex gap-3 justify-end pt-2">
              <button @click="showStageModal = false" class="btn-secondary text-sm">Cancel</button>
              <button @click="moveStage" class="btn-primary text-sm" :disabled="!newStage">Move</button>
            </div>
          </div>
        </div>
      </div>

      <div v-if="showBlockerModal" class="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" @click.self="showBlockerModal = false">
        <div class="bg-deep-800 border border-deep-600 rounded-xl p-6 w-full max-w-md">
          <h3 class="font-display font-semibold text-white mb-4">Add blocking factor</h3>
          <div class="space-y-4">
            <div><label class="label">What's blocking?</label>
              <textarea v-model="blockerText" class="input-field min-h-[80px]" placeholder="e.g. Waiting on programme officer intro" /></div>
            <div class="flex gap-3 justify-end pt-2">
              <button @click="showBlockerModal = false" class="btn-secondary text-sm">Cancel</button>
              <button @click="updateBlocker" class="btn-primary text-sm" :disabled="!blockerText.trim()">Save</button>
            </div>
          </div>
        </div>
      </div>

      <div v-if="showEditModal" class="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" @click.self="showEditModal = false">
        <div class="bg-deep-800 border border-deep-600 rounded-xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
          <h3 class="font-display font-semibold text-white mb-4">Edit: {{ deal?.partner_name }}</h3>
          <div class="space-y-4">
            <div>
              <label class="label">Organisation name</label>
              <input v-model="editForm.partner_name" class="input-field" />
            </div>
            <div>
              <label class="label">Archetype</label>
              <select v-model="editForm.archetype" class="select-field">
                <option v-for="a in archetypes" :key="a.id" :value="a.id">{{ a.id }} — {{ a.name }}</option>
              </select>
            </div>
            <div>
              <label class="label">Commercial lane</label>
              <select v-model="editForm.lane" class="select-field">
                <option v-for="l in lanes" :key="l.id" :value="l.id">{{ l.short }} — {{ l.name }}</option>
              </select>
            </div>
            <div>
              <label class="label">Partnership role</label>
              <select v-model="editForm.partnership_role" class="select-field">
                <option v-for="r in roles" :key="r.id" :value="r.id">{{ r.name }}</option>
              </select>
            </div>
            <div>
              <label class="label">Geography</label>
              <select v-model="editForm.geography" class="select-field">
                <option v-for="g in geographies" :key="g.id" :value="g.id">{{ g.name }}</option>
              </select>
            </div>
            <div>
              <label class="label">Sector overlay</label>
              <select v-model="editForm.sector" class="select-field">
                <option value="">Not specified</option>
                <option v-for="s in sectors" :key="s.id" :value="s.id">{{ s.name }}</option>
              </select>
            </div>
            <div>
              <label class="label">Relationship owner</label>
              <input v-model="editForm.bd_owner" class="input-field" />
            </div>
            <div>
              <label class="label">Urgency</label>
              <select v-model="editForm.urgency" class="select-field">
                <option value="">None</option>
                <option value="Low">Low</option>
                <option value="Medium">Medium</option>
                <option value="High">High</option>
                <option value="Critical">Critical</option>
              </select>
            </div>
            <div>
              <label class="label">Next action</label>
              <input v-model="editForm.next_action" class="input-field" />
            </div>
            <div>
              <label class="label">Expected decision date</label>
              <input v-model="editForm.expected_decision_date" type="date" class="input-field" />
            </div>
            <div>
              <label class="label">Named delivery partner</label>
              <select v-model="editForm.delivery_partner_account_id" class="select-field">
                <option value="">Not named yet</option>
                <option v-for="p in partnerAccounts.filter((a) => a.id !== deal.account_id)" :key="p.id" :value="p.id">{{ p.organisation }}</option>
              </select>
            </div>
            <div>
              <label class="label">Strategic problem / what is changing</label>
              <textarea v-model="editForm.description" class="input-field min-h-[80px]" />
            </div>
          </div>
          <div class="flex gap-3 justify-end pt-4 border-t border-deep-600 mt-4">
            <button @click="showEditModal = false" class="btn-secondary text-sm">Cancel</button>
            <button @click="saveEdit" :disabled="editSaving || !editForm.partner_name.trim()" class="btn-primary text-sm">
              {{ editSaving ? 'Saving...' : 'Save changes' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
