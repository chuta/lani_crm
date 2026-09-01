<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api, type Deal } from '../lib/api'
import { cpoApi } from '../lib/cpo-api'

const route = useRoute()
const router = useRouter()
const deal = ref<Deal | null>(null)
const transitions = ref<any[]>([])
const loading = ref(true)
const error = ref('')
const promoteLoading = ref(false)
const promoteResult = ref('')
const hasProposal = ref(false)
const existingProposalId = ref('')

// Stage change modal
const showStageModal = ref(false)
const newStage = ref(0)
const stageNote = ref('')

// Blocker modal
const showBlockerModal = ref(false)
const blockerText = ref('')

// Triage modal
const showTriageModal = ref(false)
const triageForm = ref({
  classification_corrected: '',
  novelty_flag: '',
  responded_by: '',
})
const triageSaving = ref(false)

// Edit modal
const showEditModal = ref(false)
const editSaving = ref(false)
const editForm = ref({
  partner_name: '',
  sector: '',
  description: '',
  bd_owner: '',
  tech_owner: '',
  urgency: '',
  compliance_flags: '',
  is_repeat: 0,
  archetype: '',
  novelty_level: 0,
  revenue_potential: 0,
  strategic_fit: 0,
  effort_tier: 0,
  triage_classification_corrected: '',
  triage_responded_by: '',
})

const PIPELINE_STAGES = ['Lead', 'Intake & Classification', 'Tech Triage', 'Prioritization', 'Business Case / Proposal', 'Build', 'Pilot', 'Launch', 'Post-Launch Review']

async function loadDeal() {
  const id = route.params.id as string
  if (!id) return
  loading.value = true; error.value = ''
  try {
    const res = await api.getDeal(id)
    deal.value = res.deal
    transitions.value = res.transitions
    // Check if this deal already has an active CPO proposal
    try {
      const props = await cpoApi.listProposals({ deal_id: res.deal.id })
      hasProposal.value = props.proposals.length > 0
      existingProposalId.value = props.proposals[0]?.id || ''
    } catch { hasProposal.value = false }
  } catch (e: any) {
    error.value = e.message || 'Failed to load deal'
  } finally { loading.value = false }
}

async function promoteToCPO() {
  if (!deal.value) return
  promoteLoading.value = true; promoteResult.value = ''
  try {
    const result = await cpoApi.promoteDeal(deal.value.id, {})
    router.push(`/proposals/${result.proposal.id}`)
  } catch (e: any) {
    const msg = e.message || ''
    if (msg.includes('already has an active proposal')) {
      try {
        const list = await cpoApi.listProposals({ deal_id: deal.value.id })
        if (list.proposals.length > 0) {
          router.push(`/proposals/${list.proposals[0].id}`)
          return
        }
      } catch {}
    }
    promoteResult.value = msg
    promoteLoading.value = false
  }
}

onMounted(loadDeal)

async function advanceStage() {
  if (!deal.value || !newStage.value) return
  try {
    const res = await api.advanceStage(deal.value.id, newStage.value, 'Chimezie Chuta', stageNote.value)
    deal.value = res.deal; showStageModal.value = false; await loadDeal()
  } catch (e: any) { error.value = e.message || 'Failed to advance stage' }
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

async function openTriage() {
  if (!deal.value) return
  triageForm.value = {
    classification_corrected: deal.value.triage_classification_corrected || deal.value.archetype || '',
    novelty_flag: deal.value.triage_novelty_flag || '',
    responded_by: deal.value.triage_responded_by || '',
  }
  showTriageModal.value = true
}

async function submitTriage() {
  if (!deal.value) return
  triageSaving.value = true
  try {
    const res = await api.submitTriage(deal.value.id, {
      classification_corrected: triageForm.value.classification_corrected,
      novelty_flag: triageForm.value.novelty_flag,
      responded_by: triageForm.value.responded_by || 'Tech Lead',
    })
    deal.value = res.deal
    showTriageModal.value = false
    error.value = ''
  } catch (e: any) {
    error.value = e.message || 'Failed to submit triage'
  } finally {
    triageSaving.value = false
  }
}

function openEdit() {
  if (!deal.value) return
  editForm.value = {
    partner_name: deal.value.partner_name,
    sector: deal.value.sector || '',
    description: deal.value.description || '',
    bd_owner: deal.value.bd_owner || '',
    tech_owner: deal.value.tech_owner || '',
    urgency: deal.value.urgency || '',
    compliance_flags: deal.value.compliance_flags || '',
    is_repeat: deal.value.is_repeat,
    archetype: deal.value.archetype || '',
    novelty_level: deal.value.novelty_level || 0,
    revenue_potential: deal.value.revenue_potential || 0,
    strategic_fit: deal.value.strategic_fit || 0,
    effort_tier: deal.value.effort_tier || 0,
    triage_classification_corrected: deal.value.triage_classification_corrected || '',
    triage_responded_by: deal.value.triage_responded_by || '',
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
    error.value = e.message || 'Failed to update deal'
  } finally {
    editSaving.value = false
  }
}

async function confirmArchive() {
  if (!deal.value) return
  if (!confirm('Are you sure you want to archive this deal?')) return
  try {
    await api.archiveDeal(deal.value.id)
    router.push('/pipeline')
  } catch (e: any) {
    error.value = e.message || 'Failed to archive deal'
  }
}

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
    <div v-if="loading" class="text-center py-12 text-gray-500">Loading deal details…</div>
    <div v-else-if="error" class="card border-accent-danger/30 text-accent-danger">{{ error }}</div>
    <div v-else-if="deal">
      <router-link to="/pipeline" class="text-sm text-gray-500 hover:text-gray-300 mb-2 inline-block">← Back to Pipeline</router-link>
      <div class="flex items-start justify-between mb-6">
        <div>
          <h2 class="text-2xl font-display font-bold text-white">{{ deal.partner_name }}</h2>
          <p class="text-gray-400 mt-1">{{ deal.sector || 'No sector' }} · Archetype {{ deal.archetype }} · Stage {{ deal.current_stage }}: {{ PIPELINE_STAGES[deal.current_stage - 1] }}</p>
        </div>
        <span class="badge-archetype text-base py-1.5 px-4">Archetype {{ deal.archetype }}</span>
      </div>

      <div v-if="hasProposal && existingProposalId" class="mb-4 p-4 rounded-lg bg-accent-success/10 border border-accent-success/30 flex items-center gap-3">
        <span class="text-green-400 text-lg">✅</span>
        <div class="flex-1">
          <p class="text-sm font-medium text-accent-success">Promoted to CPO — {{ existingProposalId }}</p>
          <p class="text-xs text-gray-400 mt-0.5">This deal already has an active Commercial Proposal. Use the proposal workspace to manage it.</p>
        </div>
        <router-link :to="`/proposals/${existingProposalId}`" class="shrink-0 text-xs px-3 py-1.5 bg-accent-success/20 text-accent-success rounded-lg hover:bg-accent-success/30 transition-colors font-medium">Open Proposal →</router-link>
      </div>

      <div v-if="promoteResult" class="mb-4 p-3 rounded-lg bg-yellow-900/20 border border-yellow-800/30 text-yellow-400 text-sm">{{ promoteResult }}</div>

      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        <div class="stat-card">
          <div class="stat-label">Priority Score</div>
          <div class="stat-value" :class="priorityColor(deal.priority_score)">{{ deal.priority_score ?? '—' }}</div>
          <div class="text-xs text-gray-500 mt-2">({{ deal.revenue_potential }} × {{ deal.strategic_fit }}) ÷ ({{ deal.effort_tier }} × {{ deal.novelty_penalty }})</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Queue Position</div>
          <div class="stat-value text-accent-gold">#{{ deal.queue_position ?? '—' }}</div>
          <div class="text-xs text-gray-500 mt-2">of active deals</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Current Stage</div>
          <div class="stat-value">{{ PIPELINE_STAGES[deal.current_stage - 1] }}</div>
          <div class="text-xs text-gray-500 mt-2">Owner: {{ ['BD', 'BD', 'Product & Tech', 'Strategic Technical Bridge', 'BD', 'Product & Tech', 'Joint', 'Joint', 'Strategic Technical Bridge'][deal.current_stage - 1] }}</div>
        </div>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        <div class="card lg:col-span-2">
          <h3 class="font-display font-semibold text-white mb-4">Deal Information</h3>
          <div class="grid grid-cols-2 gap-4 text-sm">
            <div><div class="label">BD Owner</div><div class="text-white">{{ deal.bd_owner || '—' }}</div></div>
            <div><div class="label">Tech Owner</div><div class="text-white">{{ deal.tech_owner || '—' }}</div></div>
            <div><div class="label">Novelty Level</div><div class="text-white">{{ deal.novelty_level }} — {{ {1:'Repeat (fast-track)',2:'Moderate adaptation',3:'Genuinely new'}[deal.novelty_level] }}</div></div>
            <div><div class="label">Effort Tier</div><div class="text-white">{{ deal.effort_tier }}</div></div>
            <div><div class="label">Urgency</div><div class="text-white">{{ deal.urgency || '—' }}</div></div>
            <div><div class="label">Compliance Flags</div><div class="text-white">{{ deal.compliance_flags || '—' }}</div></div>
            <div class="col-span-2">
              <div class="label">Blocking Factor</div>
              <div v-if="deal.blocking_factor" class="flex items-center gap-2">
                <span class="text-accent-danger">{{ deal.blocking_factor }}</span>
                <button @click="clearBlocker" class="text-xs text-gray-500 hover:text-white">✕ clear</button>
              </div>
              <div v-else class="text-gray-500 italic">None</div>
            </div>
            <div class="col-span-2">
              <div class="label">Description</div>
              <div class="text-gray-300">{{ deal.description || 'No description' }}</div>
            </div>
          </div>
        </div>
        <div class="card">
          <h3 class="font-display font-semibold text-white mb-4">Tech Triage</h3>
          <div v-if="deal.triage_classification_corrected" class="space-y-3 text-sm">
            <div><div class="label">Classification</div><div class="text-white">Archetype {{ deal.triage_classification_corrected }}
              <span v-if="deal.archetype === deal.triage_classification_corrected" class="text-accent-success text-xs ml-2">Confirmed</span>
              <span v-else class="text-accent-gold text-xs ml-2">Corrected</span>
            </div></div>
            <div><div class="label">Novelty Flag</div><div class="text-white">{{ {confirmed_repeat:'Confirmed repeat (fast-track)',moderate_adaptation:'Moderate adaptation',genuinely_new:'Genuinely new design'}[deal.triage_novelty_flag as string] || deal.triage_novelty_flag }}</div></div>
            <div><div class="label">Responded</div><div class="text-white">{{ deal.triage_responded_by || '—' }}</div></div>
            <div><div class="label">Date</div><div class="text-white">{{ deal.triage_response_at ? new Date(deal.triage_response_at).toLocaleString() : '—' }}</div></div>
          </div>
          <div v-else class="text-gray-500 text-sm italic py-4 text-center">Awaiting Tech triage</div>
        </div>
      </div>

      <!-- Stage Timeline -->
      <div class="card mb-8">
        <h3 class="font-display font-semibold text-white mb-4">Stage Timeline</h3>
        <div class="relative">
          <div class="absolute left-[11px] top-2 bottom-2 w-0.5 bg-deep-600"></div>
          <div v-if="transitions.length === 0" class="text-gray-500 text-sm ml-8 py-2">No transitions recorded</div>
          <div v-for="(t, i) in transitions" :key="t.id" class="relative pl-10 pb-4 last:pb-0">
            <div class="absolute left-[5px] top-[5px] w-3.5 h-3.5 rounded-full border-2"
              :class="i === transitions.length - 1 ? 'bg-primary-500 border-primary-400' : 'bg-deep-700 border-deep-500'"></div>
            <div class="text-sm">
              <span class="font-medium text-white">{{ PIPELINE_STAGES[t.to_stage - 1] }}</span>
              <span v-if="t.from_stage" class="text-gray-500"> (from Stage {{ t.from_stage }})</span>
              <span class="text-xs text-gray-500 ml-2">{{ new Date(t.created_at).toLocaleString() }}</span>
            </div>
            <div v-if="t.triggered_by" class="text-xs text-gray-500 mt-0.5">by {{ t.triggered_by }}</div>
            <div v-if="t.note" class="text-xs text-gray-400 mt-0.5 italic">{{ t.note }}</div>
          </div>
        </div>
      </div>

      <!-- Actions -->
      <div class="card">
        <h3 class="font-display font-semibold text-white mb-4">Actions</h3>
        <div class="flex flex-wrap gap-3">
          <button @click="openEdit" class="text-sm py-2 px-4 rounded-lg bg-deep-700 text-gray-300 hover:bg-deep-600 transition-colors">Edit Deal</button>
          <button @click="showStageModal = true" class="btn-primary text-sm">Advance Stage</button>
          <button @click="showBlockerModal = true" class="btn-secondary text-sm">Add Blocker</button>
          <button @click="openTriage" class="btn-secondary text-sm">Submit Triage</button>
          <button v-if="hasProposal" :disabled="true"
            class="text-sm py-2 px-4 rounded-lg transition-colors font-medium bg-accent-success/10 text-accent-success border border-accent-success/30 cursor-default"
          >
            ✅ Promoted to CPO
          </button>
          <button v-else @click="promoteToCPO" :disabled="promoteLoading || deal.current_stage < 5"
            class="text-sm py-2 px-4 rounded-lg transition-colors font-medium"
            :class="deal.current_stage >= 5 ? 'bg-primary-500/20 text-primary-400 hover:bg-primary-500/30' : 'bg-deep-700 text-gray-500 cursor-not-allowed'"
          >
            {{ promoteLoading ? 'Promoting...' : 'Promote to CPO' }}
          </button>
          <button @click="confirmArchive" class="text-sm py-2 px-4 rounded-lg border border-accent-danger/30 text-accent-danger hover:bg-accent-danger/10 transition-colors">Archive</button>
        </div>
        <p v-if="deal.current_stage < 5" class="text-xs text-gray-500 mt-2">Proposal creation requires stage 5 (Business Case / Proposal) or higher.</p>
      </div>

      <!-- Stage Modal -->
      <div v-if="showStageModal" class="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" @click.self="showStageModal = false">
        <div class="bg-deep-800 border border-deep-600 rounded-xl p-6 w-full max-w-md">
          <h3 class="font-display font-semibold text-white mb-4">Advance Stage</h3>
          <div class="space-y-4">
            <div><label class="label">Current Stage</label><div class="text-gray-300">Stage {{ deal.current_stage }} - {{ PIPELINE_STAGES[deal.current_stage - 1] }}</div></div>
            <div><label class="label">New Stage</label>
              <select v-model.number="newStage" class="select-field">
                <option :value="0">Select new stage...</option>
                <option v-for="(s, i) in PIPELINE_STAGES" :key="i" :value="i + 1" :disabled="i + 1 <= deal.current_stage">{{ i + 1 }} - {{ s }}</option>
              </select>
            </div>
            <div><label class="label">Note</label><input v-model="stageNote" class="input-field" placeholder="e.g. Triage complete" /></div>
            <div class="flex gap-3 justify-end pt-2">
              <button @click="showStageModal = false" class="btn-secondary text-sm">Cancel</button>
              <button @click="advanceStage" class="btn-primary text-sm" :disabled="!newStage">Advance</button>
            </div>
          </div>
        </div>
      </div>

      <!-- Blocker Modal -->
      <div v-if="showBlockerModal" class="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" @click.self="showBlockerModal = false">
        <div class="bg-deep-800 border border-deep-600 rounded-xl p-6 w-full max-w-md">
          <h3 class="font-display font-semibold text-white mb-4">Add Blocking Factor</h3>
          <div class="space-y-4">
            <div><label class="label">What's blocking?</label>
              <textarea v-model="blockerText" class="input-field min-h-[80px]" placeholder="e.g. Awaiting BSILC sign-off" /></div>
            <div class="flex gap-3 justify-end pt-2">
              <button @click="showBlockerModal = false" class="btn-secondary text-sm">Cancel</button>
              <button @click="updateBlocker" class="btn-primary text-sm" :disabled="!blockerText.trim()">Save</button>
            </div>
          </div>
        </div>
      </div>

      <!-- Triage Modal -->
      <div v-if="showTriageModal" class="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" @click.self="showTriageModal = false">
        <div class="bg-deep-800 border border-deep-600 rounded-xl p-6 w-full max-w-md">
          <h3 class="font-display font-semibold text-white mb-4">Submit Tech Triage</h3>
          <p class="text-sm text-gray-400 mb-4">Tech Lead reviews and classifies this deal for archetype and novelty.</p>
          <div class="space-y-4">
            <div>
              <label class="label">Classification (Archetype)</label>
              <select v-model="triageForm.classification_corrected" class="select-field">
                <option value="">- Select -</option>
                <option value="I">I - API / Integration</option>
                <option value="II">II - Gold / Commodity</option>
                <option value="III">III - Tokenisation / RWA</option>
                <option value="IV">IV - Infrastructure / Enterprise</option>
                <option value="V">V - Wealth / Asset Mgmt</option>
                <option value="VI">VI - Payments / Remittance</option>
                <option value="VII">VII - Data / Identity</option>
              </select>
            </div>
            <div>
              <label class="label">Novelty Flag</label>
              <select v-model="triageForm.novelty_flag" class="select-field">
                <option value="">- Select -</option>
                <option value="confirmed_repeat">Confirmed repeat (fast-track)</option>
                <option value="moderate_adaptation">Moderate adaptation</option>
                <option value="genuinely_new">Genuinely new design</option>
              </select>
            </div>
            <div>
              <label class="label">Responded By</label>
              <input v-model="triageForm.responded_by" class="input-field" placeholder="e.g. Oliver, Matt" />
            </div>
            <div class="flex gap-3 justify-end pt-2">
              <button @click="showTriageModal = false" class="btn-secondary text-sm">Cancel</button>
              <button @click="submitTriage" class="btn-primary text-sm" :disabled="triageSaving || !triageForm.classification_corrected || !triageForm.novelty_flag">
                {{ triageSaving ? 'Submitting...' : 'Submit Triage' }}
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Edit Deal Modal -->
      <div v-if="showEditModal" class="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" @click.self="showEditModal = false">
        <div class="bg-deep-800 border border-deep-600 rounded-xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
          <h3 class="font-display font-semibold text-white mb-4">Edit Deal: {{ deal?.partner_name }}</h3>
          <div class="space-y-4">
            <div>
              <label class="label">Partner Name</label>
              <input v-model="editForm.partner_name" class="input-field" />
            </div>
            <div>
              <label class="label">Sector</label>
              <input v-model="editForm.sector" class="input-field" placeholder="e.g. Banking, Asset Management" />
            </div>
            <div>
              <label class="label">Archetype</label>
              <select v-model="editForm.archetype" class="select-field">
                <option value="">- Select -</option>
                <option value="I">I - API / Integration</option>
                <option value="II">II - Gold / Commodity</option>
                <option value="III">III - Tokenisation / RWA</option>
                <option value="IV">IV - Infrastructure / Enterprise</option>
              </select>
            </div>
            <div>
              <label class="label">Novelty Level</label>
              <select v-model.number="editForm.novelty_level" class="select-field">
                <option value="">- Select -</option>
                <option :value="1">1 - Repeat (fast-track)</option>
                <option :value="2">2 - Moderate adaptation</option>
                <option :value="3">3 - Genuinely new</option>
              </select>
            </div>
            <div>
              <label class="label">Revenue Potential</label>
              <select v-model.number="editForm.revenue_potential" class="select-field">
                <option value="">- Select -</option>
                <option :value="1">1 - Low</option>
                <option :value="2">2 - Medium</option>
                <option :value="3">3 - High</option>
              </select>
            </div>
            <div>
              <label class="label">Strategic Fit</label>
              <select v-model.number="editForm.strategic_fit" class="select-field">
                <option value="">- Select -</option>
                <option :value="1">1 - Low</option>
                <option :value="2">2 - Medium</option>
                <option :value="3">3 - High</option>
              </select>
            </div>
            <div>
              <label class="label">Effort Tier</label>
              <select v-model.number="editForm.effort_tier" class="select-field">
                <option value="">- Select -</option>
                <option :value="1">1 - Low effort</option>
                <option :value="2">2 - Medium effort</option>
                <option :value="3">3 - High effort</option>
              </select>
            </div>
            <div>
              <label class="label">BD Owner</label>
              <input v-model="editForm.bd_owner" class="input-field" placeholder="e.g. Ruth" />
            </div>
            <div>
              <label class="label">Tech Owner</label>
              <input v-model="editForm.tech_owner" class="input-field" placeholder="e.g. Matt" />
            </div>
            <div>
              <label class="label">Urgency</label>
              <select v-model="editForm.urgency" class="select-field">
                <option value="">- None -</option>
                <option value="Low">Low</option>
                <option value="Medium">Medium</option>
                <option value="High">High</option>
                <option value="Critical">Critical</option>
              </select>
            </div>
            <div>
              <label class="label">Compliance Flags</label>
              <input v-model="editForm.compliance_flags" class="input-field" placeholder="e.g. BSILC, SEC, CBN" />
            </div>
            <div>
              <label class="label">Repeat / Fast-track</label>
              <select v-model.number="editForm.is_repeat" class="select-field">
                <option :value="0">No (first-time)</option>
                <option :value="1">Yes (repeat partner)</option>
              </select>
            </div>
            <div>
              <label class="label">Description</label>
              <textarea v-model="editForm.description" class="input-field min-h-[80px]" placeholder="Describe the partnership deal..." />
            </div>
            <div class="pt-3 border-t border-deep-600">
              <h4 class="text-sm font-medium text-gray-400 mb-3">Triage Override (admin only)</h4>
              <div class="grid grid-cols-2 gap-3">
                <div>
                  <label class="label">Triage Classification</label>
                  <select v-model="editForm.triage_classification_corrected" class="select-field">
                    <option value="">- None -</option>
                    <option value="I">I - API / Integration</option>
                    <option value="II">II - Gold / Commodity</option>
                    <option value="III">III - Tokenisation / RWA</option>
                    <option value="IV">IV - Infrastructure / Enterprise</option>
                    <option value="V">V - Wealth / Asset Mgmt</option>
                    <option value="VI">VI - Payments / Remittance</option>
                    <option value="VII">VII - Data / Identity</option>
                  </select>
                </div>
                <div>
                  <label class="label">Triage Responded By</label>
                  <input v-model="editForm.triage_responded_by" class="input-field" placeholder="e.g. Oliver" />
                </div>
              </div>
            </div>
          </div>
          <div class="flex gap-3 justify-end pt-4 border-t border-deep-600 mt-4">
            <button @click="showEditModal = false" class="btn-secondary text-sm">Cancel</button>
            <button @click="saveEdit" :disabled="editSaving || !editForm.partner_name.trim()" class="btn-primary text-sm">
              {{ editSaving ? 'Saving...' : 'Save Changes' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>