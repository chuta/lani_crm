<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { cpoApi } from '../lib/cpo-api'
import { PROPOSAL_STATES, STATE_COLORS, STATE_META, VALID_TRANSITIONS_MAP, CONTROL_DOMAINS, ASSUMPTION_CATEGORIES, CONFIDENCE_LEVELS, RISK_TYPES, SEVERITY_LEVELS, DISCUSSION_CATEGORIES, type ProposalDetail } from '../lib/cpo-types'

const props = defineProps<{ id: string }>()
const router = useRouter()

const detail = ref<ProposalDetail | null>(null)
const loading = ref(true)
const error = ref('')
const activeTab = ref('overview')
const notif = ref('')

// ─── Release Gate Dialog ───
const showReleaseDialog = ref(false)
const releaseBlockers = ref<{ name: string; detail: string }[]>([])
const releaseError = ref('')

function showBlockedDialog(blockers: { name: string; detail: string }[], error: string) {
  releaseBlockers.value = blockers
  releaseError.value = error
  showReleaseDialog.value = true
}

function resolveCheck(name: string) {
  const tabMap: Record<string, string> = {
    'No Placeholder Assumptions': 'assumptions',
    'Pre-Flight Complete': 'overview',
    'Commercial Model Selected': 'commercial',
    'Economics Entered': 'commercial',
    'No Deprecated Claims': 'claims',
    'Claims Approved': 'claims',
    'Partnership Route Selected': 'overview',
    'Executive Summary Written': 'overview',
    'Approval Matrix Complete': 'approvals',
    'Implementation Route Defined': 'overview',
    'No Critical Open Risks': 'assumptions',
    'Contract Term Defined': 'overview',
    'Risk & Control Responsibilities Complete': 'responsibilities',
    'Commercial Terms Complete': 'terms',
    'Jurisdiction Claims Qualified': 'claims',
  }
  activeTab.value = tabMap[name] || 'overview'
  showReleaseDialog.value = false
}

// ─── Helpers ───
function currency(v: any): string {
  if (v === null || v === undefined) return '—'
  return '$' + Number(v).toLocaleString('en-US', { maximumFractionDigits: 2 })
}
function pct(v: any): string {
  if (v === null || v === undefined) return '—'
  return Number(v).toFixed(1) + '%'
}
function stateColor(s: string) { return STATE_COLORS[s] || 'bg-gray-500' }
function stateGroup(s: string) { return STATE_META[s]?.group || 'Unknown' }
function showNotif(msg: string) { notif.value = msg; setTimeout(() => notif.value = '', 4000) }

const canTransition = computed(() => {
  if (!detail.value) return []
  const allowed = VALID_TRANSITIONS_MAP[detail.value.project.current_state] || []
  return allowed.map((t: string) => ({ id: t, label: PROPOSAL_STATES.find(s => s.id === t)?.label || t }))
})

const approvalSummary = computed(() => {
  if (!detail.value) return { approved: 0, pending: 0, rejected: 0, total: 0 }
  const a = detail.value.approvals
  return {
    approved: a.filter(x => x.status === 'approved').length,
    pending: a.filter(x => x.status === 'pending').length,
    rejected: a.filter(x => x.status === 'rejected' || x.status === 'clarification').length,
    total: a.length,
  }
})

const claimToAttach = ref('')

// ─── Claims Library ───
const claimsLibrary = ref<{ id: string; category: string; claim: string; status: string; owner: string | null }[]>([])
const claimsLibraryLoading = ref(false)
const claimsFilter = ref('')
const showAllClaims = ref(false)

async function loadClaimsLibrary() {
  claimsLibraryLoading.value = true
  try {
    const res = await cpoApi.listClaims()
    claimsLibrary.value = res.claims
  } catch { claimsLibrary.value = [] }
  finally { claimsLibraryLoading.value = false }
}

const attachedClaimIds = computed(() => new Set((detail.value?.claims || []).map((c: any) => c.claim_id || c.id)))

const filteredLibraryClaims = computed(() => {
  let list = claimsLibrary.value.filter(c => (showAllClaims.value ? true : c.status === 'Approved') && !attachedClaimIds.value.has(c.id))
  const f = claimsFilter.value.toLowerCase()
  if (f) {
    list = list.filter(c => c.id.toLowerCase().includes(f) || c.category.toLowerCase().includes(f) || c.claim.toLowerCase().includes(f))
  }
  return list
})

async function load() {
  loading.value = true; error.value = ''
  try {
    detail.value = await cpoApi.getProposal(props.id)
  } catch (e: any) { error.value = e.message }
  finally { loading.value = false }
}

async function attachClaimAction() {
  if (!claimToAttach.value) return
  try {
    await cpoApi.attachClaim(props.id, claimToAttach.value)
    claimToAttach.value = ''
    showNotif('✅ Claim attached')
    await load()
  } catch (e: any) { showNotif(`Error: ${e.message}`) }
}

async function attachClaimFromLibrary(claimId: string) {
  try {
    await cpoApi.attachClaim(props.id, claimId)
    showNotif('✅ Claim attached to proposal')
    await load()
  } catch (e: any) { showNotif(`Error: ${e.message}`) }
}

// ─── Responsibilities state & handlers ───
// ─── Assumption form state ───
const newAssumption = ref({ category: 'Market', description: '', confidence: 'E', owner: '', evidence: '' })

// ─── Risk form state ───
const newRisk = ref({ risk_type: 'Regulatory', owner: '', severity: 'Medium', mitigation: '' })

// ─── Discussion form state ───
const newDiscussion = ref({ category: 'Regulatory', question: '', owner: '' })

// ─── Inline edit state ───
const editingAssumption = ref<number | null>(null)
const editAssumption = ref({ category: '', description: '', confidence: 'E', owner: '', evidence: '', status: 'open' })
const editingRisk = ref<number | null>(null)
const editRisk = ref({ risk_type: '', owner: '', severity: 'Medium', mitigation: '', status: 'open' })
const editingDiscussion = ref<number | null>(null)
const editDiscussion = ref({ category: '', question: '', owner: '', status: 'open', resolution: '' })

const newResp = ref({ party: 'UTribe', domain: null as string | null, description: '' })
const newRole = ref({ party: 'UTribe', description: '' })

function partyColor(p: string): string {
  if (p === 'UTribe') return 'bg-primary-500/20 text-primary-400'
  if (p === 'Partner') return 'bg-accent-gold/20 text-accent-gold'
  if (p === 'Joint') return 'bg-cyan-900/30 text-cyan-400'
  return 'bg-gray-700 text-gray-500'
}

async function addResponsibilityRow(domain: string | null, desc: string, party: string) {
  if (!desc.trim()) { showNotif('⚠️ Description required'); return }
  try {
    await cpoApi.addResponsibility(props.id, { party, domain, description: desc.trim() })
    showNotif('✅ Responsibility added')
    await load()
  } catch (e: any) { showNotif(`Error: ${e.message}`) }
}

async function deleteResponsibilityRow(id: number) {
  try {
    await cpoApi.deleteResponsibility(props.id, id)
    await load()
  } catch (e: any) { showNotif(`Error: ${e.message}`) }
}

async function seedResponsibilities() {
  try {
    const res = await cpoApi.seedResponsibilities(props.id)
    showNotif(`✅ Seeded ${res.seeded} route-default responsibilities`)
    await load()
  } catch (e: any) { showNotif(`Error: ${e.message}`) }
}

// ─── Assumption CRUD ───
async function addAssumptionRow() {
  if (!newAssumption.value.description.trim()) { showNotif('⚠️ Description required'); return }
  try {
    await cpoApi.addAssumption(props.id, {
      category: newAssumption.value.category,
      description: newAssumption.value.description.trim(),
      confidence: newAssumption.value.confidence,
      owner: newAssumption.value.owner || null,
      evidence: newAssumption.value.evidence || null,
    })
    newAssumption.value = { category: 'Market', description: '', confidence: 'E', owner: '', evidence: '' }
    showNotif('✅ Assumption added')
    await load()
  } catch (e: any) { showNotif(`Error: ${e.message}`) }
}

function startEditAssumption(a: any) {
  editingAssumption.value = a.id
  editAssumption.value = { category: a.category, description: a.description, confidence: a.confidence, owner: a.owner || '', evidence: a.evidence || '', status: a.status }
}

function cancelEditAssumption() { editingAssumption.value = null }

async function saveEditAssumption() {
  if (!editingAssumption.value) return
  try {
    await cpoApi.updateAssumption(props.id, editingAssumption.value, editAssumption.value)
    showNotif('✅ Assumption updated')
    editingAssumption.value = null
    await load()
  } catch (e: any) { showNotif(`Error: ${e.message}`) }
}

async function deleteAssumptionRow(id: number) {
  try {
    await cpoApi.deleteAssumption(props.id, id)
    await load()
  } catch (e: any) { showNotif(`Error: ${e.message}`) }
}

// ─── Risk CRUD ───
async function addRiskRow() {
  if (!newRisk.value.mitigation.trim()) { showNotif('⚠️ Mitigation description required'); return }
  try {
    await cpoApi.addRisk(props.id, {
      risk_type: newRisk.value.risk_type,
      severity: newRisk.value.severity,
      owner: newRisk.value.owner || null,
      mitigation: newRisk.value.mitigation.trim(),
    })
    newRisk.value = { risk_type: 'Regulatory', owner: '', severity: 'Medium', mitigation: '' }
    showNotif('✅ Risk added')
    await load()
  } catch (e: any) { showNotif(`Error: ${e.message}`) }
}

function startEditRisk(r: any) {
  editingRisk.value = r.id
  editRisk.value = { risk_type: r.risk_type, owner: r.owner || '', severity: r.severity, mitigation: r.mitigation || '', status: r.status }
}

function cancelEditRisk() { editingRisk.value = null }

async function saveEditRisk() {
  if (!editingRisk.value) return
  try {
    await cpoApi.updateRisk(props.id, editingRisk.value, editRisk.value)
    showNotif('✅ Risk updated')
    editingRisk.value = null
    await load()
  } catch (e: any) { showNotif(`Error: ${e.message}`) }
}

async function deleteRiskRow(id: number) {
  try {
    await cpoApi.deleteRisk(props.id, id)
    await load()
  } catch (e: any) { showNotif(`Error: ${e.message}`) }
}

// ─── Discussion CRUD ───
async function addDiscussionRow() {
  if (!newDiscussion.value.question.trim()) { showNotif('⚠️ Question required'); return }
  try {
    await cpoApi.addDiscussionPoint(props.id, {
      category: newDiscussion.value.category,
      question: newDiscussion.value.question.trim(),
      owner: newDiscussion.value.owner || null,
    })
    newDiscussion.value = { category: 'Regulatory', question: '', owner: '' }
    showNotif('✅ Discussion point added')
    await load()
  } catch (e: any) { showNotif(`Error: ${e.message}`) }
}

function startEditDiscussion(d: any) {
  editingDiscussion.value = d.id
  editDiscussion.value = { category: d.category, question: d.question, owner: d.owner || '', status: d.status, resolution: d.resolution || '' }
}

function cancelEditDiscussion() { editingDiscussion.value = null }

async function saveEditDiscussion() {
  if (!editingDiscussion.value) return
  try {
    await cpoApi.updateDiscussionPoint(props.id, editingDiscussion.value, editDiscussion.value)
    showNotif('✅ Discussion point updated')
    editingDiscussion.value = null
    await load()
  } catch (e: any) { showNotif(`Error: ${e.message}`) }
}

async function deleteDiscussionRow(id: number) {
  try {
    await cpoApi.deleteDiscussionPoint(props.id, id)
    await load()
  } catch (e: any) { showNotif(`Error: ${e.message}`) }
}

const coveredControlDomains = computed(() => new Set((detail.value?.responsibilities || []).filter((r: any) => r.domain).map((r: any) => r.domain)))
const missingControlDomains = computed(() => (CONTROL_DOMAINS as readonly string[]).filter(d => !coveredControlDomains.value.has(d)))

// ─── Terms state & handlers ───
const termsDraft = ref<Record<string, any>>({})
const termsSaving = ref(false)
const newMetric = ref({ metric: '', measurement_basis: '', target: '', linked_model: '' })

function openTermsDraft() {
  const t = detail.value?.terms
  termsDraft.value = {
    commercial_review: t?.commercial_review || '',
    review_data_required: t?.review_data_required || '',
    review_reconsideration: t?.review_reconsideration || '',
    review_approval_process: t?.review_approval_process || '',
    recon_cadence: t?.recon_cadence || '',
    payment_cadence: t?.payment_cadence || '',
    dispute_window: t?.dispute_window || '',
    settlement_mechanism: t?.settlement_mechanism || '',
    pilot_required: t?.pilot_required || 0,
    pilot_target_segment: t?.pilot_target_segment || '',
    pilot_duration: t?.pilot_duration || '',
    pilot_scope: t?.pilot_scope || '',
    pilot_success_measures: t?.pilot_success_measures || '',
    pilot_decision_gate: t?.pilot_decision_gate || '',
    pilot_expansion_criteria: t?.pilot_expansion_criteria || '',
    exclusivity_requested: t?.exclusivity_requested || 0,
    excl_scope: t?.excl_scope || '',
    excl_geography: t?.excl_geography || '',
    excl_product: t?.excl_product || '',
    excl_customer_segment: t?.excl_customer_segment || '',
    excl_duration: t?.excl_duration || '',
    excl_performance_conditions: t?.excl_performance_conditions || '',
    excl_conflict_check: t?.excl_conflict_check || '',
  }
}

async function saveTermsDraft() {
  termsSaving.value = true
  try {
    await cpoApi.saveTerms(props.id, termsDraft.value)
    showNotif('✅ Commercial & partnership terms saved')
    await load()
  } catch (e: any) { showNotif(`Error: ${e.message}`) }
  finally { termsSaving.value = false }
}

async function addMetricRow() {
  if (!newMetric.value.metric.trim()) { showNotif('⚠️ Metric name required'); return }
  try {
    await cpoApi.addMetric(props.id, { ...newMetric.value, metric: newMetric.value.metric.trim() })
    newMetric.value = { metric: '', measurement_basis: '', target: '', linked_model: '' }
    showNotif('✅ Success metric added')
    await load()
  } catch (e: any) { showNotif(`Error: ${e.message}`) }
}

async function deleteMetricRow(id: number) {
  try {
    await cpoApi.deleteMetric(props.id, id)
    await load()
  } catch (e: any) { showNotif(`Error: ${e.message}`) }
}

async function transitionTo(to: string) {
  try {
    const result = await cpoApi.transitionProposal(props.id, to, 'Chimezie Chuta')
    if (result.release_gate) {
      showNotif(`⚠️ Release gate: ${result.release_gate.passed ? 'PASSED' : 'BLOCKED'} (${result.release_gate.score}%)`)
    }
    await load()
  } catch (e: any) { showNotif(`Error: ${e.message}`) }
}

async function saveField(field: string, value: any) {
  try {
    await cpoApi.updateProposal(props.id, { [field]: value })
    showNotif(`✅ ${field.replace(/_/g, ' ')} saved`)
    await load()
  } catch (e: any) { showNotif(`Error: ${e.message}`) }
}

async function generateDoc() {
  try {
    const result = await cpoApi.generateDocument(props.id)
    if (!result.ok) {
      showBlockedDialog(result.blockers || [], result.error)
      return
    }
    // Open in new tab
    const w = window.open('', '_blank')
    if (w) {
      w.document.write(result.document!)
      w.document.close()
    }
    showNotif('✅ Proposal document generated — use Print / Save PDF or your local printer')
    await load()
  } catch (e: any) { showNotif(`Error: ${e.message}`) }
}

async function exportDocx() {
  try {
    const result = await cpoApi.exportDocx(props.id)
    if (!result.ok) {
      showBlockedDialog(result.blockers || [], result.error)
      return
    }
    // Trigger download
    const url = URL.createObjectURL(result.blob)
    const a = document.createElement('a')
    a.href = url
    a.download = result.filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    showNotif(`✅ Word document downloaded: ${result.filename}`)
    await load()
  } catch (e: any) { showNotif(`Error: ${e.message}`) }
}

async function printDoc() {
  try {
    const result = await cpoApi.generateDocument(props.id)
    if (!result.ok) {
      showBlockedDialog(result.blockers || [], result.error)
      return
    }
    // Open in new window and trigger print directly
    const w = window.open('', '_blank')
    if (w) {
      w.document.write(result.document!)
      w.document.close()
      // Wait for render, then print
      w.onload = () => { w.print() }
      // Fallback: print after a short delay
      setTimeout(() => { if (w && !w.closed) w.print() }, 500)
    }
    showNotif('✅ Print dialog opened — select your local printer')
    await load()
  } catch (e: any) { showNotif(`Error: ${e.message}`) }
}

async function runRelease() {
  try {
    const result = await cpoApi.runRelease(props.id)
    showNotif(result.passed ? `✅ Release gate PASSED (${result.score}%)` : `🔴 Release gate BLOCKED (${result.score}%) — ${result.checks.filter((c: any) => !c.passed).length} checks failed`)
    await load()
  } catch (e: any) { showNotif(`Error: ${e.message}`) }
}

onMounted(() => {
  load()
  // Read hash for tab override (e.g. /proposals/XYZ#approvals from Resolve Now button)
  const hash = window.location.hash.replace(/^#/, '')
  const validTabs = ['overview','commercial','approvals','claims','assumptions','discussion','responsibilities','terms','modules','generate','audit']
  if (hash && validTabs.includes(hash)) {
    activeTab.value = hash
  }
})

// ─── Load claims library when claims tab is first visited ───
watch(activeTab, (tab) => {
  if (tab === 'claims' && claimsLibrary.value.length === 0) {
    loadClaimsLibrary()
  }
})
</script>

<template>
  <div v-if="loading" class="text-center py-16 text-gray-500">Loading proposal workspace…</div>
  <div v-else-if="error" class="py-16 text-center">
    <p class="text-accent-danger text-lg mb-2">🔴 Failed to load proposal</p>
    <p class="text-gray-400 text-sm">{{ error }}</p>
  </div>
  <div v-else-if="detail">
    <!-- Notification -->
    <div v-if="notif" class="mb-4 p-3 bg-deep-700 border border-deep-600 rounded-lg text-sm text-white/90">{{ notif }}</div>

    <!-- ─── Release Gate Blocked Dialog ─── -->
    <div v-if="showReleaseDialog" class="fixed inset-0 z-50 flex items-start justify-center pt-24 pb-12" @click.self="showReleaseDialog = false">
      <div class="absolute inset-0 bg-black/60 backdrop-blur-sm"></div>
      <div class="relative bg-deep-800 border border-deep-600 rounded-xl shadow-2xl w-full max-w-lg mx-4 max-h-[70vh] overflow-y-auto">
        <div class="p-5 border-b border-deep-700 flex items-start gap-3">
          <span class="text-2xl">🔴</span>
          <div>
            <h3 class="text-lg font-semibold text-white">Release Gate Blocked</h3>
            <p class="text-sm text-gray-400 mt-1">{{ releaseError }}</p>
          </div>
          <button @click="showReleaseDialog = false" class="ml-auto text-gray-500 hover:text-white transition-colors">✕</button>
        </div>
        <div class="p-5 space-y-3">
          <p class="text-xs text-gray-500 uppercase tracking-wider font-semibold">{{ releaseBlockers.length }} Failed Check(s) — resolve each below</p>
          <div v-for="(b, i) in releaseBlockers" :key="i" class="p-3 bg-deep-900/50 rounded-lg border border-deep-700">
            <div class="flex items-start justify-between gap-2">
              <div>
                <p class="text-sm font-medium text-white">{{ b.name }}</p>
                <p class="text-xs text-gray-400 mt-1">{{ b.detail }}</p>
              </div>
              <button @click="resolveCheck(b.name)" class="shrink-0 px-3 py-1.5 text-xs bg-primary-500/20 text-primary-400 rounded-lg hover:bg-primary-500/30 transition-colors">Resolve →</button>
            </div>
          </div>
          <p class="text-xs text-gray-600 text-center pt-2">Click "Resolve" to navigate to the section that needs attention, or close this dialog and fix each item manually.</p>
        </div>
        <div class="p-4 border-t border-deep-700 flex justify-end">
          <button @click="showReleaseDialog = false" class="px-4 py-2 text-sm bg-deep-700 text-gray-300 rounded-lg hover:bg-deep-600 transition-colors">Dismiss</button>
        </div>
      </div>
    </div>

    <!-- Header -->
    <div class="flex flex-wrap items-start justify-between mb-6">
      <div>
        <div class="flex items-center gap-3 mb-1">
          <span class="text-lg font-mono text-primary-400">{{ detail.project.id }}</span>
          <span class="inline-flex items-center gap-1 text-sm px-3 py-1 rounded-full"
            :class="`${stateColor(detail.project.current_state)}/20 text-white border ${stateColor(detail.project.current_state)}/30`"
          >
            {{ PROPOSAL_STATES.find(s => s.id === detail.project.current_state)?.icon }}
            {{ PROPOSAL_STATES.find(s => s.id === detail.project.current_state)?.label }}
          </span>
        </div>
        <h2 class="text-2xl font-display font-bold text-white">{{ detail.project.partner_name }}</h2>
        <p class="text-gray-400 mt-1">Deal: <router-link :to="`/deals/${detail.project.deal_id}`" class="text-primary-400 hover:text-primary-300">{{ detail.project.deal_id }}</router-link>
          <span v-if="detail.project.pipedrive_deal_url"> · <a :href="detail.project.pipedrive_deal_url" target="_blank" class="text-primary-400 hover:text-primary-300">Pipedrive ↗</a></span>
        </p>
      </div>
      <div class="flex gap-2 mt-2 sm:mt-0">
        <a :href="`/proposals`" class="px-3 py-2 text-sm text-gray-400 bg-deep-700 rounded-lg hover:bg-deep-600 transition-colors">← Back</a>
      </div>
    </div>

    <!-- State Machine + Quick Actions -->
    <div class="card mb-6">
      <div class="flex flex-wrap items-center gap-4">
        <div class="flex-1">
          <div class="flex items-center gap-2 text-xs text-gray-500 mb-1">
            <span>{{ stateGroup(detail.project.current_state) }}</span>
            <span>·</span>
            <span>Created {{ new Date(detail.project.created_at).toLocaleDateString('en-GB') }}</span>
            <span v-if="detail.project.external_released_at">· Released v{{ detail.project.external_release_version }} on {{ new Date(detail.project.external_released_at).toLocaleDateString('en-GB') }}</span>
          </div>
          <div class="flex items-center gap-2 flex-wrap">
            <span class="text-xs text-gray-400">Transition to:</span>
            <button v-for="t in canTransition" :key="t.id" @click="transitionTo(t.id)"
              class="text-xs px-3 py-1.5 rounded-lg transition-colors"
              :class="[`${stateColor(t.id)}/20 text-white hover:${stateColor(t.id)}/30`]"
            >{{ t.label }}</button>
            <button v-if="canTransition.length === 0" disabled class="text-xs px-3 py-1.5 text-gray-600 bg-deep-700 rounded-lg">No transitions available</button>
          </div>
        </div>
        <div class="flex gap-2">
          <button @click="runRelease" class="px-3 py-2 text-xs bg-cyan-500/20 text-cyan-400 rounded-lg hover:bg-cyan-500/30">🔍 Run Release Audit</button>
          <button @click="exportDocx" class="px-3 py-2 text-xs bg-accent-success/20 text-accent-success rounded-lg hover:bg-accent-success/30">📄 Export Word (.DOCX)</button>
          <button @click="generateDoc" class="px-3 py-2 text-xs bg-primary-500/20 text-primary-400 rounded-lg hover:bg-primary-500/30">📄 Generate &amp; Print</button>
        </div>
      </div>
    </div>

    <!-- Tabs -->
    <div class="flex gap-1 border-b border-deep-600 mb-6 overflow-x-auto">
      <button v-for="tab in [
        { id: 'overview', label: 'Overview', icon: '📋' },
        { id: 'commercial', label: 'Commercial', icon: '💰' },
        { id: 'approvals', label: 'Approvals', icon: '✅' },
        { id: 'claims', label: 'Claims', icon: '📜' },
        { id: 'assumptions', label: 'Assumptions & Risks', icon: '⚠️' },
        { id: 'discussion', label: 'Discussion', icon: '💬' },
        { id: 'responsibilities', label: 'Responsibilities', icon: '🛡️' },
        { id: 'terms', label: 'Terms', icon: '📑' },
        { id: 'modules', label: 'Modules', icon: '🧩' },
        { id: 'generate', label: 'Generate', icon: '🚀' },
        { id: 'audit', label: 'Audit', icon: '📊' },
      ]" :key="tab.id" @click="activeTab = tab.id"
        class="px-4 py-2.5 text-sm whitespace-nowrap transition-colors border-b-2"
        :class="activeTab === tab.id ? 'border-primary-500 text-primary-400' : 'border-transparent text-gray-500 hover:text-gray-300'"
      >{{ tab.icon }} {{ tab.label }}</button>
    </div>

    <!-- ─── TAB: Overview ─── -->
    <div v-if="activeTab === 'overview'" class="space-y-6">
      <!-- Pre-Flight Score -->
      <div class="card">
        <h3 class="font-semibold text-white mb-3">🔍 Pre-Flight Checklist</h3>
        <div class="flex items-center gap-2 text-sm text-gray-400 mb-3">
          <span>{{ detail.preflight.filter(p => p.is_checked).length }} / {{ detail.preflight.length }} checked</span>
        </div>
        <div class="space-y-1.5">
          <div v-for="item in detail.preflight" :key="item.id" class="flex items-center gap-2.5 text-sm">
            <span @click="cpoApi.checkPreflight(props.id, item.id, !item.is_checked).then(load).catch(() => {})" class="cursor-pointer text-base shrink-0"
              :class="item.is_checked ? 'text-accent-success' : 'text-gray-600 hover:text-gray-400'"
            >{{ item.is_checked ? '✅' : '⬜' }}</span>
            <span class="text-xs text-gray-500 w-24 shrink-0">{{ item.category }}</span>
            <span :class="item.is_checked ? 'text-gray-300' : 'text-gray-500'">{{ item.check_item }}</span>
            <span v-if="item.checked_by" class="text-xs text-gray-600 ml-auto">by {{ item.checked_by }} {{ item.checked_at ? new Date(item.checked_at).toLocaleDateString() : '' }}</span>
          </div>
        </div>
      </div>

      <!-- Proposal Info -->
      <div class="card">
        <h3 class="font-semibold text-white mb-3">📋 Proposal Summary</h3>
        <div class="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
          <div><span class="text-gray-500 block">Partnership Route</span><span class="text-white">{{ detail.project.partnership_route || '—' }}</span></div>
          <div><span class="text-gray-500 block">Commercial Model</span><span class="text-white">{{ detail.project.commercial_model || '—' }}</span></div>
          <div><span class="text-gray-500 block">Country</span><span class="text-white">{{ detail.project.country || '—' }}</span></div>
          <div><span class="text-gray-500 block">Vertical</span><span class="text-white">{{ detail.project.vertical || '—' }}</span></div>
          <div><span class="text-gray-500 block">Owner</span><span class="text-white">{{ detail.project.owner || '—' }}</span></div>
          <div><span class="text-gray-500 block">Expected Revenue</span><span class="text-white">{{ detail.project.expected_revenue ? currency(detail.project.expected_revenue) : '—' }}</span></div>
        </div>
        <div class="mt-4">
          <label class="block text-xs text-gray-500 mb-1">Executive Summary</label>
          <textarea :value="detail.project.executive_summary || ''" @change="(e: any) => saveField('executive_summary', e.target.value)"
            class="w-full px-3 py-2 text-sm bg-deep-700 text-gray-200 rounded-lg border border-deep-600 focus:border-primary-500 outline-none min-h-[80px]"
            placeholder="Describe the partnership opportunity and commercial rationale…"
          ></textarea>
        </div>
      </div>
    </div>

    <!-- ─── TAB: Commercial ─── -->
    <div v-if="activeTab === 'commercial'" class="space-y-6">
      <div class="card">
        <h3 class="font-semibold text-white mb-4">🗂️ Commercial Model</h3>
        <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <button v-for="m in ['A', 'B', 'C', 'D']" :key="m" @click="saveField('commercial_model', m)"
            class="px-4 py-3 rounded-lg text-sm transition-colors border"
            :class="detail.project.commercial_model === m ? 'bg-primary-500/20 border-primary-500/50 text-primary-400' : 'bg-deep-700 border-deep-600 text-gray-400 hover:border-gray-500'"
          >
            <div class="font-semibold">Model {{ m }}</div>
            <div class="text-xs mt-0.5 text-gray-500">
              {{ { A: 'Volume / Transaction-led', B: 'AUM / Recurring', C: 'Referral / Outcome-led', D: 'Custom / Strategic' }[m] }}
            </div>
          </button>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block text-xs text-gray-400 mb-1">Partnership Route</label>
            <select @change="(e: any) => saveField('partnership_route', e.target.value)" :value="detail.project.partnership_route || ''"
              class="w-full px-3 py-2 text-sm bg-deep-700 text-white rounded-lg border border-deep-600 focus:border-primary-500 outline-none"
            >
              <option value="">— Select —</option>
              <option value="Distribution Partnership">Distribution Partnership</option>
              <option value="Connected Customer Journey">Connected Customer Journey</option>
              <option value="Embedded / Co-branded">Embedded / Co-branded</option>
              <option value="Strategic Institutional Partnership">Strategic Institutional Partnership</option>
              <option value="Other">Other</option>
            </select>
          </div>
          <div>
            <label class="block text-xs text-gray-400 mb-1">Contract Term</label>
            <input :value="detail.project.contract_term || ''" @change="(e: any) => saveField('contract_term', e.target.value)"
              class="w-full px-3 py-2 text-sm bg-deep-700 text-white rounded-lg border border-deep-600 focus:border-primary-500 outline-none"
              placeholder="e.g. 12 months" />
          </div>
        </div>
      </div>

      <!-- Economics Calculator -->
      <div class="card">
        <h3 class="font-semibold text-white mb-4">🧮 Commercial Economics</h3>
        <div class="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
          <div>
            <label class="block text-xs text-gray-400 mb-1">Gross Commercial Value</label>
            <input :value="detail.economics?.gross_commercial_value || ''" @change="(e: any) => saveField('econ_gross', Number(e.target.value))"
              class="w-full px-3 py-2 bg-deep-700 text-white rounded-lg border border-deep-600 focus:border-primary-500 outline-none" placeholder="e.g. 250000" />
          </div>
          <div>
            <label class="block text-xs text-gray-400 mb-1">Operating Cost</label>
            <input :value="detail.economics?.operating_cost || ''" @change="(e: any) => saveField('econ_cost', Number(e.target.value))"
              class="w-full px-3 py-2 bg-deep-700 text-white rounded-lg border border-deep-600 focus:border-primary-500 outline-none" placeholder="e.g. 80000" />
          </div>
          <div>
            <label class="block text-xs text-gray-400 mb-1">Partner Allocation (%)</label>
            <input :value="detail.economics?.partner_allocation_pct || ''" @change="(e: any) => saveField('partner_pct', Number(e.target.value))"
              class="w-full px-3 py-2 bg-deep-700 text-white rounded-lg border border-deep-600 focus:border-primary-500 outline-none" placeholder="e.g. 40" />
          </div>
        </div>
        <div v-if="detail.economics" class="mt-4 p-3 bg-deep-700 rounded-lg">
          <div class="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <div><span class="text-gray-500 text-xs">Residual Pool</span><span class="text-white block font-semibold">{{ currency(detail.economics.residual_pool) }}</span></div>
            <div><span class="text-gray-500 text-xs">Partner Effective</span><span class="text-accent-success block font-semibold">{{ currency(detail.economics.partner_effective_economics) }} ({{ pct(detail.economics.effective_partner_pct) }})</span></div>
            <div><span class="text-gray-500 text-xs">UTribe Effective</span><span class="text-primary-400 block font-semibold">{{ currency(detail.economics.utribe_effective_economics) }} ({{ pct(detail.economics.effective_utribe_pct) }})</span></div>
            <div><span class="text-gray-500 text-xs">Split Ratio</span><span class="text-white block font-semibold">{{ detail.economics.partner_allocation_pct ?? '?' }} / {{ detail.economics.utribe_allocation_pct ?? '?' }}</span></div>
          </div>
        </div>
      </div>
    </div>

    <!-- ─── TAB: Approvals ─── -->
    <div v-if="activeTab === 'approvals'" class="space-y-6">
      <div class="flex gap-3 mb-4">
        <button @click="cpoApi.seedApprovals(props.id).then(load)" class="px-3 py-2 text-sm bg-deep-700 text-gray-300 rounded-lg hover:bg-deep-600">🌱 Seed Approvals</button>
      </div>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div v-for="a in detail.approvals" :key="a.id" class="card flex items-center justify-between p-4">
          <div>
            <span class="text-sm text-white font-medium">{{ a.function_area.replace(/_/g, ' ') }}</span>
            <div v-if="a.reviewer_name" class="text-xs text-gray-500 mt-0.5">{{ a.reviewer_name }} {{ a.reviewed_at ? new Date(a.reviewed_at).toLocaleDateString() : '' }}</div>
            <div v-if="a.decision" class="text-xs text-gray-500 mt-0.5">"{{ a.decision }}"</div>
          </div>
          <div class="flex items-center gap-2">
            <button @click="cpoApi.submitApproval(props.id, a.function_area, { status: 'approved', reviewer_name: 'Chuta', decision: 'Approved' }).then(load)"
              class="px-2.5 py-1 text-xs rounded-lg bg-accent-success/20 text-accent-success hover:bg-accent-success/30 transition-colors">✅ Approve</button>
            <button @click="cpoApi.submitApproval(props.id, a.function_area, { status: 'clarification', reviewer_name: 'Chuta', decision: 'Needs clarification' }).then(load)"
              class="px-2.5 py-1 text-xs rounded-lg bg-yellow-900/30 text-yellow-400 hover:bg-yellow-900/50 transition-colors">🔄 Clarify</button>
            <button @click="cpoApi.submitApproval(props.id, a.function_area, { status: 'rejected', reviewer_name: 'Chuta', decision: 'Rejected' }).then(load)"
              class="px-2.5 py-1 text-xs rounded-lg bg-red-900/30 text-red-400 hover:bg-red-900/50 transition-colors">🔴 Reject</button>
            <span class="text-xs px-2 py-0.5 rounded-full"
              :class="a.status === 'approved' ? 'bg-accent-success/20 text-accent-success' : a.status === 'rejected' ? 'bg-red-900/30 text-red-400' : a.status === 'clarification' ? 'bg-yellow-900/30 text-yellow-400' : 'bg-deep-700 text-gray-500'"
            >{{ a.status }}</span>
          </div>
        </div>
        <div v-if="detail.approvals.length === 0" class="col-span-2 text-center py-8 text-gray-500 text-sm">
          No approvals seeded yet. Click "Seed Approvals" to populate the matrix.
        </div>
      </div>
    </div>

    <!-- ─── TAB: Claims ─── -->
    <div v-if="activeTab === 'claims'" class="space-y-6">
      <div class="card">
        <h3 class="font-semibold text-white mb-3">📜 Attached Claims</h3>
        <div v-if="detail.claims.length === 0" class="text-sm text-gray-500 py-4">No claims attached yet. Browse the Claims Library below and click "Attach" to add approved claims.</div>
        <div v-for="c in detail.claims" :key="c.claim_id || c.id" class="flex items-start gap-3 p-3 mb-2 bg-deep-700 rounded-lg">
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2 mb-1">
              <span class="text-xs font-mono text-gray-500">{{ c.id || c.claim_id }}</span>
              <span class="text-xs px-1.5 py-0.5 rounded bg-deep-600 text-gray-400">{{ c.category }}</span>
              <span class="text-xs" :class="c.status === 'Approved' ? 'text-accent-success' : 'text-yellow-400'">{{ c.status }}</span>
            </div>
            <p class="text-sm text-gray-300">{{ c.claim }}</p>
          </div>
          <button @click="cpoApi.detachClaim(props.id, c.claim_id || c.id).then(load)" class="text-xs text-red-400 hover:text-red-300 shrink-0">Remove</button>
        </div>
      </div>

      <div class="card">
        <h3 class="font-semibold text-white mb-3">📚 Claims Library Browser</h3>
        <div class="flex items-center justify-between mb-3">
          <p class="text-xs text-gray-500">Browse claims from the library and attach them to this proposal.</p>
          <label class="flex items-center gap-2 text-xs text-gray-400 cursor-pointer">
            <input type="checkbox" v-model="showAllClaims" class="text-primary-500 rounded" />
            Show all (incl. pending)
          </label>
        </div>

        <!-- Search filter -->
        <div class="mb-4">
          <input v-model="claimsFilter" placeholder="Search claims by ID, category, or text…" class="w-full px-3 py-2 text-sm bg-deep-700 text-white rounded-lg border border-deep-600 focus:border-primary-500 outline-none" />
        </div>

        <!-- Loading state -->
        <div v-if="claimsLibraryLoading" class="text-sm text-gray-500 py-4">Loading claims library…</div>

        <!-- Empty state -->
        <div v-else-if="filteredLibraryClaims.length === 0 && claimsLibrary.length > 0" class="text-sm text-gray-500 py-4">
          All approved claims are already attached, or no results match your search.
          <span v-if="claimsFilter" class="block mt-1">Try a different search term, or <button @click="claimsFilter = ''" class="text-primary-400 hover:text-primary-300 underline">clear the filter</button>.</span>
        </div>
        <div v-else-if="claimsLibrary.length === 0 && !claimsLibraryLoading" class="text-sm text-gray-500 py-4">
          Claims library is empty. Seed claims first from the admin interface.
        </div>

        <!-- Claims grid -->
        <div v-else class="grid gap-2">
          <div v-for="c in filteredLibraryClaims" :key="c.id" class="flex items-start gap-3 p-3 bg-deep-700 rounded-lg hover:bg-deep-650 transition-colors">
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2 mb-1">
                <span class="text-xs font-mono text-primary-400">{{ c.id }}</span>
                <span class="text-xs px-1.5 py-0.5 rounded bg-deep-600 text-gray-400">{{ c.category }}</span>
                <span class="text-xs" :class="c.status === 'Approved' ? 'text-accent-success' : c.status === 'Pending' ? 'text-yellow-400' : 'text-red-400'">{{ c.status }}</span>
                <span v-if="c.owner" class="text-xs text-gray-600 ml-auto">{{ c.owner }}</span>
              </div>
              <p class="text-sm text-gray-300">{{ c.claim }}</p>
            </div>
            <button v-if="c.status === 'Approved'" @click="attachClaimFromLibrary(c.id)" class="shrink-0 px-3 py-1.5 text-xs bg-primary-500/20 text-primary-400 rounded-lg hover:bg-primary-500/30 transition-colors font-medium">+ Attach</button>
            <span v-else class="shrink-0 px-3 py-1.5 text-xs bg-deep-700 text-gray-600 rounded-lg font-medium">{{ c.status }}</span>
          </div>
        </div>
      </div>

      <div class="card">
        <h3 class="font-semibold text-white mb-3">🔗 Quick Attach by ID</h3>
        <p class="text-xs text-gray-500 mb-2">If you know the claim ID, type it directly:</p>
        <div class="flex gap-2">
          <input v-model="claimToAttach" placeholder="e.g. CLM-001" class="flex-1 px-3 py-2 text-sm bg-deep-700 text-white rounded-lg border border-deep-600 focus:border-primary-500 outline-none font-mono" />
          <button @click="attachClaimAction" class="px-4 py-2 text-sm bg-primary-500/20 text-primary-400 rounded-lg hover:bg-primary-500/30">Attach</button>
        </div>
      </div>
    </div>

    <!-- ─── TAB: Assumptions & Risks ─── -->
    <div v-if="activeTab === 'assumptions'" class="space-y-6">
      <!-- ── Assumptions Register ── -->
      <div class="card">
        <h3 class="font-semibold text-white mb-3">📌 Assumptions Register
          <span v-if="detail.unresolved_p_count > 0" class="ml-2 text-xs text-red-400">🔴 {{ detail.unresolved_p_count }} unresolved [P]</span>
        </h3>

        <!-- Add form -->
        <div class="grid grid-cols-1 md:grid-cols-[auto_1fr_auto] gap-2 mb-4 p-3 bg-deep-800 rounded-lg border border-deep-600">
          <div>
            <label class="block text-xs text-gray-500 mb-1">Category</label>
            <select v-model="newAssumption.category" class="px-3 py-2 text-sm bg-deep-700 text-white rounded-lg border border-deep-600 outline-none w-full">
              <option v-for="c in ASSUMPTION_CATEGORIES" :key="c" :value="c">{{ c }}</option>
            </select>
          </div>
          <div>
            <label class="block text-xs text-gray-500 mb-1">Description</label>
            <input v-model="newAssumption.description" placeholder="e.g. Gold price stays above $2,500" class="w-full px-3 py-2 text-sm bg-deep-700 text-white rounded-lg border border-deep-600 focus:border-primary-500 outline-none" />
          </div>
          <div>
            <label class="block text-xs text-gray-500 mb-1">Confidence</label>
            <select v-model="newAssumption.confidence" class="px-3 py-2 text-sm bg-deep-700 text-white rounded-lg border border-deep-600 outline-none">
              <option v-for="l in CONFIDENCE_LEVELS" :key="l.id" :value="l.id">{{ l.label }}</option>
            </select>
          </div>
          <div>
            <label class="block text-xs text-gray-500 mb-1">Owner</label>
            <input v-model="newAssumption.owner" placeholder="e.g. Chuta" class="w-full px-3 py-2 text-sm bg-deep-700 text-white rounded-lg border border-deep-600 focus:border-primary-500 outline-none" />
          </div>
          <div>
            <label class="block text-xs text-gray-500 mb-1">Evidence / Source</label>
            <input v-model="newAssumption.evidence" placeholder="URL or reference" class="w-full px-3 py-2 text-sm bg-deep-700 text-white rounded-lg border border-deep-600 focus:border-primary-500 outline-none" />
          </div>
          <div class="flex items-end">
            <button @click="addAssumptionRow" class="px-4 py-2 text-sm bg-primary-500/20 text-primary-400 rounded-lg hover:bg-primary-500/30 w-full">+ Add</button>
          </div>
        </div>

        <!-- List -->
        <div v-if="detail.assumptions.length === 0" class="text-sm text-gray-500 py-4">No assumptions recorded. Add one above.</div>
        <div v-for="a in detail.assumptions" :key="a.id" class="flex items-start gap-3 p-2.5 mb-1.5 bg-deep-700 rounded-lg text-sm">
          <template v-if="editingAssumption === a.id">
            <select v-model="editAssumption.category" class="text-xs px-1.5 py-1 rounded bg-deep-600 text-white border border-deep-500 outline-none w-24 shrink-0">
              <option v-for="c in ASSUMPTION_CATEGORIES" :key="c" :value="c">{{ c }}</option>
            </select>
            <input v-model="editAssumption.description" class="flex-1 px-2 py-1 text-sm bg-deep-600 text-white rounded border border-deep-500 outline-none" />
            <select v-model="editAssumption.confidence" class="text-xs px-1.5 py-1 rounded bg-deep-600 text-white border border-deep-500 outline-none w-20">
              <option v-for="l in CONFIDENCE_LEVELS" :key="l.id" :value="l.id">{{ l.id }}</option>
            </select>
            <input v-model="editAssumption.owner" placeholder="Owner" class="text-xs px-2 py-1 bg-deep-600 text-white rounded border border-deep-500 outline-none w-28" />
            <input v-model="editAssumption.evidence" placeholder="Evidence" class="text-xs px-2 py-1 bg-deep-600 text-white rounded border border-deep-500 outline-none w-32" />
            <button @click="saveEditAssumption" class="text-xs text-accent-success hover:text-accent-success/80 shrink-0">💾</button>
            <button @click="cancelEditAssumption" class="text-xs text-gray-500 hover:text-gray-400 shrink-0">✕</button>
          </template>
          <template v-else>
            <span class="text-xs px-1.5 py-0.5 rounded shrink-0 mt-0.5"
              :class="a.confidence === 'C' ? 'bg-accent-success/20 text-accent-success' : a.confidence === 'E' ? 'bg-yellow-900/30 text-yellow-400' : 'bg-red-900/30 text-red-400'"
            >[{{ a.confidence }}]</span>
            <div class="flex-1 min-w-0">
              <span class="text-xs text-gray-500 block mb-0.5">{{ a.category }}{{ a.owner ? ' · ' + a.owner : '' }}</span>
              <span class="text-white">{{ a.description }}</span>
              <span v-if="a.evidence" class="text-xs text-gray-500 ml-2">📎 {{ a.evidence }}</span>
            </div>
            <span class="text-xs px-1.5 py-0.5 rounded shrink-0"
              :class="a.status === 'open' ? 'bg-cyan-900/30 text-cyan-400' : 'bg-gray-700 text-gray-500'"
            >{{ a.status }}</span>
            <button @click="startEditAssumption(a)" class="text-xs text-gray-500 hover:text-primary-400 shrink-0">✏️</button>
            <button @click="deleteAssumptionRow(a.id)" class="text-xs text-red-400 hover:text-red-300 shrink-0">🗑️</button>
          </template>
        </div>
      </div>

      <!-- ── Risks ── -->
      <div class="card">
        <h3 class="font-semibold text-white mb-3">⚠️ Risk &amp; Control Matrix</h3>

        <!-- Add form -->
        <div class="grid grid-cols-1 md:grid-cols-[auto_1fr_auto_auto] gap-2 mb-4 p-3 bg-deep-800 rounded-lg border border-deep-600 items-end">
          <div>
            <label class="block text-xs text-gray-500 mb-1">Risk Type</label>
            <select v-model="newRisk.risk_type" class="px-3 py-2 text-sm bg-deep-700 text-white rounded-lg border border-deep-600 outline-none w-full">
              <option v-for="t in RISK_TYPES" :key="t" :value="t">{{ t }}</option>
            </select>
          </div>
          <div>
            <label class="block text-xs text-gray-500 mb-1">Mitigation / Control</label>
            <input v-model="newRisk.mitigation" placeholder="e.g. KYC checks at onboarding" class="w-full px-3 py-2 text-sm bg-deep-700 text-white rounded-lg border border-deep-600 focus:border-primary-500 outline-none" />
          </div>
          <div>
            <label class="block text-xs text-gray-500 mb-1">Severity</label>
            <select v-model="newRisk.severity" class="px-3 py-2 text-sm bg-deep-700 text-white rounded-lg border border-deep-600 outline-none">
              <option v-for="s in SEVERITY_LEVELS" :key="s" :value="s">{{ s }}</option>
            </select>
          </div>
          <div>
            <label class="block text-xs text-gray-500 mb-1">Owner</label>
            <input v-model="newRisk.owner" placeholder="e.g. Chuta" class="w-full px-3 py-2 text-sm bg-deep-700 text-white rounded-lg border border-deep-600 focus:border-primary-500 outline-none" />
          </div>
          <div class="flex items-end md:col-start-4">
            <button @click="addRiskRow" class="px-4 py-2 text-sm bg-primary-500/20 text-primary-400 rounded-lg hover:bg-primary-500/30 w-full">+ Add</button>
          </div>
        </div>

        <!-- List -->
        <div v-if="detail.risks.length === 0" class="text-sm text-gray-500 py-4">No risks recorded. Add one above.</div>
        <div v-for="r in detail.risks" :key="r.id" class="flex items-start gap-3 p-2.5 mb-1.5 bg-deep-700 rounded-lg text-sm">
          <template v-if="editingRisk === r.id">
            <select v-model="editRisk.risk_type" class="text-xs px-1.5 py-1 rounded bg-deep-600 text-white border border-deep-500 outline-none w-36">
              <option v-for="t in RISK_TYPES" :key="t" :value="t">{{ t }}</option>
            </select>
            <select v-model="editRisk.severity" class="text-xs px-1.5 py-1 rounded bg-deep-600 text-white border border-deep-500 outline-none w-20">
              <option v-for="s in SEVERITY_LEVELS" :key="s" :value="s">{{ s }}</option>
            </select>
            <input v-model="editRisk.mitigation" class="flex-1 px-2 py-1 text-sm bg-deep-600 text-white rounded border border-deep-500 outline-none" />
            <input v-model="editRisk.owner" placeholder="Owner" class="text-xs px-2 py-1 bg-deep-600 text-white rounded border border-deep-500 outline-none w-28" />
            <select v-model="editRisk.status" class="text-xs px-1.5 py-1 rounded bg-deep-600 text-white border border-deep-500 outline-none w-24">
              <option value="open">open</option>
              <option value="mitigated">mitigated</option>
              <option value="closed">closed</option>
            </select>
            <button @click="saveEditRisk" class="text-xs text-accent-success hover:text-accent-success/80 shrink-0">💾</button>
            <button @click="cancelEditRisk" class="text-xs text-gray-500 hover:text-gray-400 shrink-0">✕</button>
          </template>
          <template v-else>
            <span class="text-xs px-1.5 py-0.5 rounded shrink-0 mt-0.5"
              :class="r.severity === 'Critical' ? 'bg-red-900/30 text-red-400' : r.severity === 'High' ? 'bg-orange-900/30 text-orange-400' : r.severity === 'Medium' ? 'bg-yellow-900/30 text-yellow-400' : 'bg-gray-700 text-gray-400'"
            >{{ r.severity }}</span>
            <div class="flex-1 min-w-0">
              <span class="text-xs text-gray-500 block mb-0.5">{{ r.risk_type }}{{ r.owner ? ' · ' + r.owner : '' }}</span>
              <span v-if="r.mitigation" class="text-white">{{ r.mitigation }}</span>
            </div>
            <span class="text-xs px-1.5 py-0.5 rounded shrink-0"
              :class="r.status === 'open' ? 'bg-red-900/30 text-red-400' : r.status === 'mitigated' ? 'bg-yellow-900/30 text-yellow-400' : 'bg-accent-success/20 text-accent-success'"
            >{{ r.status }}</span>
            <button @click="startEditRisk(r)" class="text-xs text-gray-500 hover:text-primary-400 shrink-0">✏️</button>
            <button @click="deleteRiskRow(r.id)" class="text-xs text-red-400 hover:text-red-300 shrink-0">🗑️</button>
          </template>
        </div>
      </div>
    </div>

    <!-- ─── TAB: Discussion Points ─── -->
    <div v-if="activeTab === 'discussion'" class="card">
      <h3 class="font-semibold text-white mb-3">💬 Discussion Points <span class="text-xs text-gray-500 font-normal">(Template §10 — Discussion Points for Partner)</span></h3>

      <!-- Add form -->
      <div class="grid grid-cols-1 md:grid-cols-[auto_1fr_auto] gap-2 mb-4 p-3 bg-deep-800 rounded-lg border border-deep-600">
        <div>
          <label class="block text-xs text-gray-500 mb-1">Category</label>
          <select v-model="newDiscussion.category" class="px-3 py-2 text-sm bg-deep-700 text-white rounded-lg border border-deep-600 outline-none w-full">
            <option v-for="c in DISCUSSION_CATEGORIES" :key="c" :value="c">{{ c }}</option>
          </select>
        </div>
        <div>
          <label class="block text-xs text-gray-500 mb-1">Question / Point</label>
          <input v-model="newDiscussion.question" placeholder="e.g. Confirm partner's regulatory licensing status in target jurisdiction" class="w-full px-3 py-2 text-sm bg-deep-700 text-white rounded-lg border border-deep-600 focus:border-primary-500 outline-none" />
        </div>
        <div>
          <label class="block text-xs text-gray-500 mb-1">Owner</label>
          <input v-model="newDiscussion.owner" placeholder="e.g. Chuta" class="w-full px-3 py-2 text-sm bg-deep-700 text-white rounded-lg border border-deep-600 focus:border-primary-500 outline-none" />
        </div>
        <div class="flex items-end md:col-start-3">
          <button @click="addDiscussionRow" class="px-4 py-2 text-sm bg-primary-500/20 text-primary-400 rounded-lg hover:bg-primary-500/30 w-full">+ Add</button>
        </div>
      </div>

      <!-- List -->
      <div v-if="detail.discussion_points.length === 0" class="text-sm text-gray-500 py-4">No discussion points recorded. Add one above.</div>
      <div v-for="d in detail.discussion_points" :key="d.id" class="flex items-start gap-3 p-2.5 mb-1.5 bg-deep-700 rounded-lg text-sm">
        <template v-if="editingDiscussion === d.id">
          <select v-model="editDiscussion.category" class="text-xs px-1.5 py-1 rounded bg-deep-600 text-white border border-deep-500 outline-none w-28">
            <option v-for="c in DISCUSSION_CATEGORIES" :key="c" :value="c">{{ c }}</option>
          </select>
          <input v-model="editDiscussion.question" class="flex-1 px-2 py-1 text-sm bg-deep-600 text-white rounded border border-deep-500 outline-none" />
          <input v-model="editDiscussion.owner" placeholder="Owner" class="text-xs px-2 py-1 bg-deep-600 text-white rounded border border-deep-500 outline-none w-28" />
          <select v-model="editDiscussion.status" class="text-xs px-1.5 py-1 rounded bg-deep-600 text-white border border-deep-500 outline-none w-24">
            <option value="open">open</option>
            <option value="resolved">resolved</option>
          </select>
          <input v-model="editDiscussion.resolution" placeholder="Resolution" class="text-xs px-2 py-1 bg-deep-600 text-white rounded border border-deep-500 outline-none w-32" />
          <button @click="saveEditDiscussion" class="text-xs text-accent-success hover:text-accent-success/80 shrink-0">💾</button>
          <button @click="cancelEditDiscussion" class="text-xs text-gray-500 hover:text-gray-400 shrink-0">✕</button>
        </template>
        <template v-else>
          <span class="text-xs px-1.5 py-0.5 rounded shrink-0 bg-deep-600 text-gray-400">{{ d.category }}</span>
          <div class="flex-1 min-w-0">
            <p class="text-white">{{ d.question }}<span v-if="d.owner" class="text-xs text-gray-500 ml-2">— {{ d.owner }}</span></p>
            <div v-if="d.resolution" class="text-xs text-gray-500 mt-0.5">✅ {{ d.resolution }}</div>
          </div>
          <span class="text-xs px-1.5 py-0.5 rounded shrink-0"
            :class="d.status === 'open' ? 'bg-cyan-900/30 text-cyan-400' : 'bg-accent-success/20 text-accent-success'"
          >{{ d.status }}</span>
          <button @click="startEditDiscussion(d)" class="text-xs text-gray-500 hover:text-primary-400 shrink-0">✏️</button>
          <button @click="deleteDiscussionRow(d.id)" class="text-xs text-red-400 hover:text-red-300 shrink-0">🗑️</button>
        </template>
      </div>
    </div>

    <!-- ─── TAB: Responsibilities ─── -->
    <div v-if="activeTab === 'responsibilities'" class="space-y-6">
      <!-- §7.5 Risk & Control Responsibilities -->
      <div class="card">
        <div class="flex items-center justify-between mb-1">
          <h3 class="font-semibold text-white">🛡️ Risk &amp; Control Responsibilities <span class="text-xs text-gray-500 font-normal">(Template §7.5)</span></h3>
          <button @click="seedResponsibilities" class="text-xs px-3 py-1.5 bg-deep-700 text-gray-300 rounded-lg hover:bg-deep-600">🌱 Seed route defaults</button>
        </div>
        <p class="text-xs text-gray-500 mb-3">Every control domain must have a responsible party before external release. Responsibilities follow the selected partnership route.</p>
        <div v-if="missingControlDomains.length > 0" class="mb-3 p-2.5 bg-yellow-900/20 border border-yellow-800/30 rounded-lg text-xs text-yellow-400">
          ⚠️ Unguarded domains: {{ missingControlDomains.join(', ') }}
        </div>
        <div v-for="r in detail.responsibilities.filter(x => x.domain)" :key="r.id" class="flex items-start gap-3 p-2.5 mb-1.5 bg-deep-700 rounded-lg text-sm">
          <span class="text-xs px-1.5 py-0.5 rounded shrink-0 mt-0.5" :class="partyColor(r.party)">{{ r.party }}</span>
          <span class="text-xs text-gray-400 w-48 shrink-0 mt-1">{{ r.domain }}</span>
          <div class="flex-1 min-w-0">
            <span class="text-gray-300">{{ r.description }}</span>
          </div>
          <button @click="deleteResponsibilityRow(r.id)" class="text-xs text-red-400 hover:text-red-300 shrink-0 mt-1">Remove</button>
        </div>
        <div v-if="detail.responsibilities.filter(x => x.domain).length === 0" class="text-sm text-gray-500 py-3">
          No control responsibilities assigned yet. Click "Seed route defaults" to populate from the selected partnership route, or add manually below.
        </div>
        <div class="mt-4 pt-4 border-t border-deep-600 grid grid-cols-1 md:grid-cols-[auto_1fr_auto] gap-2 items-end">
          <div>
            <label class="block text-xs text-gray-500 mb-1">Party</label>
            <select v-model="newResp.party" class="px-3 py-2 text-sm bg-deep-700 text-white rounded-lg border border-deep-600 outline-none">
              <option value="UTribe">UTribe</option>
              <option value="Partner">Partner</option>
              <option value="Joint">Joint</option>
              <option value="NA">NA</option>
            </select>
          </div>
          <div>
            <label class="block text-xs text-gray-500 mb-1">Control domain</label>
            <select v-model="newResp.domain" class="w-full px-3 py-2 text-sm bg-deep-700 text-white rounded-lg border border-deep-600 outline-none">
              <option :value="null">— Select —</option>
              <option v-for="d in CONTROL_DOMAINS" :key="d" :value="d">{{ d }}</option>
            </select>
          </div>
          <div class="md:col-span-3">
            <label class="block text-xs text-gray-500 mb-1">Responsibility</label>
            <div class="flex gap-2">
              <input v-model="newResp.description" placeholder="e.g. UTribe operates custody via approved regulated custodians" class="flex-1 px-3 py-2 text-sm bg-deep-700 text-white rounded-lg border border-deep-600 focus:border-primary-500 outline-none" />
              <button @click="addResponsibilityRow(newResp.domain, newResp.description, newResp.party)" class="px-4 py-2 text-sm bg-primary-500/20 text-primary-400 rounded-lg hover:bg-primary-500/30">Add</button>
            </div>
          </div>
        </div>
      </div>

      <!-- §2.4 / 2.5 Roles & Responsibilities -->
      <div class="card">
        <h3 class="font-semibold text-white mb-1">🤝 Roles &amp; Responsibilities <span class="text-xs text-gray-500 font-normal">(Template §2.4 / 2.5)</span></h3>
        <p class="text-xs text-gray-500 mb-3">UTribe, Partner and Joint responsibilities for this partnership. Control-domain items (custody, AML, etc.) are tracked in the section above.</p>
        <div v-for="party in ['UTribe', 'Partner', 'Joint']" :key="party" class="mb-4">
          <div class="flex items-center gap-2 mb-2">
            <span class="text-xs px-2 py-0.5 rounded font-medium" :class="partyColor(party)">{{ party }}</span>
            <span class="text-xs text-gray-500">{{ party === 'Joint' ? 'Joint Responsibilities' : party === 'UTribe' ? 'UTribe Responsibilities' : detail.project.partner_name + ' Responsibilities' }}</span>
          </div>
          <div v-for="r in detail.responsibilities.filter(x => !x.domain && x.party === party)" :key="r.id" class="flex items-start gap-3 p-2.5 mb-1.5 bg-deep-700 rounded-lg text-sm">
            <span class="flex-1 text-gray-300">{{ r.description }}</span>
            <button @click="deleteResponsibilityRow(r.id)" class="text-xs text-red-400 hover:text-red-300 shrink-0">Remove</button>
          </div>
          <div v-if="detail.responsibilities.filter(x => !x.domain && x.party === party).length === 0" class="text-xs text-gray-600 italic mb-2">None added.</div>
          <div class="flex gap-2">
            <input v-model="newRole.party" class="hidden" />
            <input v-model="newRole.description" placeholder="e.g. Partner leads launch planning with joint education" class="flex-1 px-3 py-2 text-sm bg-deep-700 text-white rounded-lg border border-deep-600 focus:border-primary-500 outline-none" @keyup.enter="addResponsibilityRow(null, newRole.description, party); newRole.description = ''" />
            <button @click="addResponsibilityRow(null, newRole.description, party); newRole.description = ''" class="px-3 py-2 text-sm bg-deep-600 text-gray-300 rounded-lg hover:bg-deep-500">Add</button>
          </div>
        </div>
      </div>
    </div>

    <!-- ─── TAB: Terms ─── -->
    <div v-if="activeTab === 'terms'" class="space-y-6">
      <div class="card">
        <div class="flex items-center justify-between mb-1">
          <h3 class="font-semibold text-white">📑 Commercial &amp; Partnership Terms <span class="text-xs text-gray-500 font-normal">(Template §9)</span></h3>
          <button @click="openTermsDraft" class="text-xs px-3 py-1.5 bg-deep-700 text-gray-300 rounded-lg hover:bg-deep-600">✏️ Edit</button>
        </div>
        <p class="text-xs text-gray-500 mb-4">All payment and reconciliation terms require Finance / Commercial and Legal approval (Legal_Commercial in the Approvals tab).</p>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div><span class="text-gray-500 block text-xs">Proposed term</span><span class="text-white">{{ detail.project.contract_term || '—' }}</span></div>
          <div><span class="text-gray-500 block text-xs">Commercial review</span><span class="text-white">{{ detail.terms?.commercial_review || '—' }}</span></div>
          <div><span class="text-gray-500 block text-xs">Review data required</span><span class="text-white">{{ detail.terms?.review_data_required || '—' }}</span></div>
          <div><span class="text-gray-500 block text-xs">Reconsideration / change approval</span><span class="text-white">{{ detail.terms?.review_reconsideration || '—' }} {{ detail.terms?.review_approval_process ? '· ' + detail.terms.review_approval_process : '' }}</span></div>
          <div><span class="text-gray-500 block text-xs">Reconciliation cadence</span><span class="text-white">{{ detail.terms?.recon_cadence || '—' }}</span></div>
          <div><span class="text-gray-500 block text-xs">Payment cadence</span><span class="text-white">{{ detail.terms?.payment_cadence || '—' }}</span></div>
          <div><span class="text-gray-500 block text-xs">Dispute window</span><span class="text-white">{{ detail.terms?.dispute_window || '—' }}</span></div>
          <div><span class="text-gray-500 block text-xs">Settlement mechanism</span><span class="text-white">{{ detail.terms?.settlement_mechanism || '—' }}</span></div>
        </div>
      </div>

      <div class="card">
        <h3 class="font-semibold text-white mb-3">🎯 Success Metrics <span class="text-xs text-gray-500 font-normal">(§9.4 — ≥1 required for release)</span></h3>
        <div v-for="m in detail.success_metrics || []" :key="m.id" class="flex items-start gap-3 p-2.5 mb-1.5 bg-deep-700 rounded-lg text-sm">
          <div class="flex-1">
            <span class="text-white">{{ m.metric }}</span>
            <span v-if="m.measurement_basis" class="text-xs text-gray-500 ml-2">Basis: {{ m.measurement_basis }}</span>
            <span v-if="m.target" class="text-xs text-gray-500 ml-2">Target: {{ m.target }}</span>
            <span v-if="m.linked_model" class="text-xs px-1.5 py-0.5 rounded bg-deep-600 text-gray-400 ml-2">Model {{ m.linked_model }}</span>
          </div>
          <button @click="deleteMetricRow(m.id)" class="text-xs text-red-400 hover:text-red-300 shrink-0">Remove</button>
        </div>
        <div v-if="(detail.success_metrics || []).length === 0" class="text-sm text-gray-500 py-2">No success metrics defined yet.</div>
        <div class="mt-3 grid grid-cols-2 md:grid-cols-4 gap-2 items-end">
          <div class="col-span-2"><label class="block text-xs text-gray-500 mb-1">Metric</label><input v-model="newMetric.metric" placeholder="e.g. AUM, active customers, transaction volume" class="w-full px-3 py-2 text-sm bg-deep-700 text-white rounded-lg border border-deep-600 focus:border-primary-500 outline-none" /></div>
          <div><label class="block text-xs text-gray-500 mb-1">Measurement basis</label><input v-model="newMetric.measurement_basis" placeholder="e.g. Trailing AUM" class="w-full px-3 py-2 text-sm bg-deep-700 text-white rounded-lg border border-deep-600 outline-none" /></div>
          <div><label class="block text-xs text-gray-500 mb-1">Target</label><input v-model="newMetric.target" placeholder="e.g. $10M by Q4" class="w-full px-3 py-2 text-sm bg-deep-700 text-white rounded-lg border border-deep-600 outline-none" /></div>
          <div class="col-span-2 md:col-span-1"><label class="block text-xs text-gray-500 mb-1">Linked model</label><select v-model="newMetric.linked_model" class="w-full px-3 py-2 text-sm bg-deep-700 text-white rounded-lg border border-deep-600 outline-none"><option value="">All</option><option v-for="m in ['A','B','C','D']" :key="m" :value="m">{{ m }}</option></select></div>
          <button @click="addMetricRow" class="col-span-2 md:col-span-1 px-4 py-2 text-sm bg-primary-500/20 text-primary-400 rounded-lg hover:bg-primary-500/30 md:col-start-4">+ Add Metric</button>
        </div>
      </div>

      <!-- Terms edit modal -->
      <div v-if="Object.keys(termsDraft).length > 0" class="fixed inset-0 bg-black/60 flex items-start justify-center z-50 p-4 overflow-y-auto" @click.self="termsDraft = {}">
        <div class="bg-deep-800 border border-deep-600 rounded-xl p-6 w-full max-w-2xl my-8">
          <h3 class="font-display font-semibold text-white mb-4">✏️ Edit Commercial &amp; Partnership Terms</h3>
          <div class="space-y-4">
            <div><label class="label">Commercial Review — what is reviewed</label><input v-model="termsDraft.commercial_review" class="input-field" placeholder="e.g. Quarterly review of volume, economics and AUM" /></div>
            <div class="grid grid-cols-2 gap-3">
              <div><label class="label">Performance data required</label><input v-model="termsDraft.review_data_required" class="input-field" placeholder="e.g. Monthly volume/AUM reports" /></div>
              <div><label class="label">Change approval process</label><input v-model="termsDraft.review_approval_process" class="input-field" placeholder="e.g. Finance/Commercial sign-off" /></div>
            </div>
            <div><label class="label">Circumstances for reconsideration</label><input v-model="termsDraft.review_reconsideration" class="input-field" placeholder="e.g. Material change in economics or regulatory status" /></div>
            <div class="grid grid-cols-2 gap-3">
              <div><label class="label">Reconciliation cadence</label><input v-model="termsDraft.recon_cadence" class="input-field" placeholder="e.g. Monthly" /></div>
              <div><label class="label">Payment cadence</label><input v-model="termsDraft.payment_cadence" class="input-field" placeholder="e.g. Quarterly" /></div>
              <div><label class="label">Dispute window</label><input v-model="termsDraft.dispute_window" class="input-field" placeholder="e.g. 30 days" /></div>
              <div><label class="label">Settlement mechanism</label><input v-model="termsDraft.settlement_mechanism" class="input-field" placeholder="e.g. Bank transfer / stablecoin" /></div>
            </div>
            <div class="pt-3 border-t border-deep-600">
              <label class="flex items-center gap-2 mb-2 text-sm text-gray-300"><input type="checkbox" v-model="termsDraft.pilot_required" class="text-primary-500 rounded" /> Pilot phase applicable</label>
              <div v-if="termsDraft.pilot_required" class="grid grid-cols-2 gap-3">
                <div><label class="label">Target segment</label><input v-model="termsDraft.pilot_target_segment" class="input-field" /></div>
                <div><label class="label">Duration</label><input v-model="termsDraft.pilot_duration" class="input-field" placeholder="e.g. 3 months" /></div>
                <div class="col-span-2"><label class="label">Scope</label><input v-model="termsDraft.pilot_scope" class="input-field" /></div>
                <div class="col-span-2"><label class="label">Success measures</label><input v-model="termsDraft.pilot_success_measures" class="input-field" /></div>
                <div><label class="label">Decision gate</label><input v-model="termsDraft.pilot_decision_gate" class="input-field" /></div>
                <div><label class="label">Expansion criteria</label><input v-model="termsDraft.pilot_expansion_criteria" class="input-field" /></div>
              </div>
            </div>
            <div class="pt-3 border-t border-deep-600">
              <label class="flex items-center gap-2 mb-2 text-sm text-gray-300"><input type="checkbox" v-model="termsDraft.exclusivity_requested" class="text-primary-500 rounded" /> Exclusivity requested <span class="text-xs text-gray-500">(default: none)</span></label>
              <div v-if="termsDraft.exclusivity_requested" class="grid grid-cols-2 gap-3">
                <div><label class="label">Scope</label><input v-model="termsDraft.excl_scope" class="input-field" /></div>
                <div><label class="label">Geography</label><input v-model="termsDraft.excl_geography" class="input-field" /></div>
                <div><label class="label">Product</label><input v-model="termsDraft.excl_product" class="input-field" /></div>
                <div><label class="label">Customer segment</label><input v-model="termsDraft.excl_customer_segment" class="input-field" /></div>
                <div><label class="label">Duration</label><input v-model="termsDraft.excl_duration" class="input-field" /></div>
                <div><label class="label">Performance conditions</label><input v-model="termsDraft.excl_performance_conditions" class="input-field" /></div>
                <div class="col-span-2"><label class="label">Conflict check (other active partnerships)</label><input v-model="termsDraft.excl_conflict_check" class="input-field" /></div>
              </div>
            </div>
            <div class="flex gap-3 justify-end pt-2">
              <button @click="termsDraft = {}" class="btn-secondary text-sm">Cancel</button>
              <button @click="saveTermsDraft" class="btn-primary text-sm" :disabled="termsSaving">{{ termsSaving ? 'Saving...' : 'Save Terms' }}</button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- ─── TAB: Modules ─── -->
    <div v-if="activeTab === 'modules'" class="space-y-6">
      <div class="card">
        <h3 class="font-semibold text-white mb-3">🧩 Conditional Modules</h3>
        <div class="space-y-2">
          <div v-for="m in [
            { type: 'extended_fees', label: 'Extended Fee Structure', desc: 'Additional fee categories beyond the primary mechanism' },
            { type: 'integration_economics', label: 'Integration / Implementation Economics', desc: 'Costs and fees for integration and implementation' },
            { type: 'growth_incentives', label: 'Tiered Growth Incentives', desc: 'Progressive economics for volume or AUM thresholds' },
            { type: 'pilot', label: 'Pilot Phase', desc: 'Defined pilot with success measures and decision gate' },
            { type: 'exclusivity', label: 'Exclusivity', desc: 'Scope, geography, and duration of exclusivity' },
          ]" :key="m.type"
            class="flex items-center justify-between p-3 bg-deep-700 rounded-lg"
          >
            <div>
              <span class="text-sm text-white font-medium">{{ m.label }}</span>
              <p class="text-xs text-gray-500">{{ m.desc }}</p>
            </div>
            <button @click="cpoApi.toggleModule(props.id, { module_type: m.type, is_active: !detail.active_modules.includes(m.type) }).then(load)"
              class="px-3 py-1.5 text-xs rounded-lg transition-colors"
              :class="detail.active_modules.includes(m.type) ? 'bg-primary-500/20 text-primary-400' : 'bg-deep-600 text-gray-500 hover:bg-deep-500'"
            >{{ detail.active_modules.includes(m.type) ? '✅ Active' : '⬜ Inactive' }}</button>
          </div>
        </div>
      </div>
    </div>

    <!-- ─── TAB: Generate ─── -->
    <div v-if="activeTab === 'generate'" class="space-y-6">
      <div class="card">
        <h3 class="font-semibold text-white mb-4">🚪 Release Gate</h3>
        <button @click="runRelease" class="px-4 py-2 text-sm bg-cyan-500/20 text-cyan-400 rounded-lg hover:bg-cyan-500/30 transition-colors mb-4">🔍 Run Release Audit</button>
        <div class="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm mb-4">
          <div class="stat-card">
            <div class="stat-value">{{ detail.preflight.filter(p => p.is_checked).length }}/{{ detail.preflight.length }}</div>
            <div class="stat-label">Pre-Flight</div>
          </div>
          <div class="stat-card">
            <div class="stat-value" :class="detail.unresolved_p_count === 0 ? 'text-accent-success' : 'text-accent-danger'">{{ detail.unresolved_p_count }}</div>
            <div class="stat-label">Unresolved [P]</div>
          </div>
          <div class="stat-card">
            <div class="stat-value" :class="approvalSummary.pending === 0 ? 'text-accent-success' : 'text-yellow-400'">{{ approvalSummary.approved }}/{{ approvalSummary.total }}</div>
            <div class="stat-label">Approvals</div>
          </div>
          <div class="stat-card">
            <div class="stat-value">{{ detail.project.commercial_model || '?' }}</div>
            <div class="stat-label">Model Selected</div>
          </div>
        </div>
      </div>

      <div class="card">
        <h3 class="font-semibold text-white mb-4">📄 Generate External Proposal</h3>
        <p class="text-gray-400 text-sm mb-4">Once the release gate passes, generate a clean external proposal document with all internal guidance stripped. The document can be printed to PDF.</p>
        <button @click="generateDoc" class="px-6 py-3 text-sm bg-primary-500/20 text-primary-400 rounded-lg hover:bg-primary-500/30 transition-colors font-semibold"
          :disabled="detail.unresolved_p_count > 0"
        >🚀 Generate &amp; Print</button>
        <div class="flex gap-3 mt-4">
          <button @click="exportDocx" class="px-5 py-2.5 text-sm bg-accent-success/20 text-accent-success rounded-lg hover:bg-accent-success/30 transition-colors font-semibold">📄 Download Word (.DOCX)</button>
          <button @click="printDoc" class="px-5 py-2.5 text-sm bg-deep-700 text-gray-300 rounded-lg hover:bg-deep-600 transition-colors font-semibold">🖨️ Print Document</button>
        </div>
        <p v-if="detail.unresolved_p_count > 0" class="text-xs text-red-400 mt-2">🔴 Resolve all [P] placeholders before generating the external document.</p>
      </div>
    </div>

    <!-- ─── TAB: Audit ─── -->
    <div v-if="activeTab === 'audit'" class="card">
      <h3 class="font-semibold text-white mb-3">📊 Audit Trail</h3>
      <div v-if="detail.audit.length === 0" class="text-sm text-gray-500 py-4">No audit events recorded.</div>
      <div class="space-y-1 max-h-[600px] overflow-y-auto">
        <div v-for="e in detail.audit" :key="e.created_at + e.event_type" class="flex gap-3 p-2 text-sm border-b border-deep-700">
          <span class="text-xs text-gray-500 shrink-0 w-28">{{ new Date(e.created_at).toLocaleString('en-GB') }}</span>
          <span class="text-xs font-mono text-gray-500 shrink-0 w-24">{{ e.event_type }}</span>
          <span class="text-gray-400">{{ e.description }}</span>
          <span v-if="e.actor" class="text-xs text-gray-600 ml-auto shrink-0">by {{ e.actor }}</span>
        </div>
      </div>
    </div>
  </div>
</template>
