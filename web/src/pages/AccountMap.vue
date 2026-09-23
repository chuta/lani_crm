<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AccountBriefPanel from '../components/AccountBriefPanel.vue'
import AccountCasePanel from '../components/AccountCasePanel.vue'
import AccountCoachPanel from '../components/AccountCoachPanel.vue'
import {
  api,
  CONVERSION_GAP_LABELS,
  type Account,
  type AccountBrief,
  type AccountStage,
  type ApplyableBriefField,
  type Archetype,
  type CaseApplyAccountField,
  type CaseAsk,
  type CaseSectionId,
  type CoachApplyAccountField,
  type CoachFieldId,
  type CoachStall,
  type CommercialCase,
  type CommercialLane,
  type CommercialModel,
  type CommercialTrigger,
  type ConversionAdvice,
  type Deal,
  type FeeBand,
  type Geography,
  type PartnershipRole,
  type QualificationDimension,
  type SectorOverlay,
} from '../lib/api'
import { useAuth } from '../lib/auth'

const auth = useAuth()
const route = useRoute()
const router = useRouter()

const accounts = ref<Account[]>([])
const laneCounts = ref<Record<string, number>>({})
const loading = ref(true)
const loadError = ref('')

const archetypes = ref<Archetype[]>([])
const sectors = ref<SectorOverlay[]>([])
const roles = ref<PartnershipRole[]>([])
const geographies = ref<Geography[]>([])
const lanes = ref<CommercialLane[]>([])
const dimensions = ref<QualificationDimension[]>([])
const stages = ref<AccountStage[]>([])
const capabilities = ref<string[]>([])
const triggers = ref<CommercialTrigger[]>([])
const models = ref<CommercialModel[]>([])
const feeBands = ref<FeeBand[]>([])
const caseAsks = ref<CaseAsk[]>([])
const coachStalls = ref<CoachStall[]>([])
const partnerAccounts = ref<Account[]>([])
const spawned = ref<Deal[]>([])

const searchQuery = ref('')
const filterLane = ref('')
const filterArchetype = ref('')
const filterGeography = ref('')
const filterRole = ref('')

const showAddModal = ref(false)
const adding = ref(false)
const addError = ref('')
const addForm = ref(emptyForm())
const addSourceUrl = ref('')
const addNotes = ref('')
const addBrief = ref<AccountBrief | null>(null)
const addResearching = ref(false)
const addCreatingFromBrief = ref(false)

const selected = ref<Account | null>(null)
const opportunities = ref<Deal[]>([])
const editing = ref(false)
const saving = ref(false)
const archiving = ref(false)
const detailError = ref('')
const editForm = ref<any>(emptyForm())
const detailSourceUrl = ref('')
const detailNotes = ref('')
const detailBrief = ref<AccountBrief | null>(null)
const detailResearching = ref(false)
const detailApplying = ref(false)
const detailCase = ref<CommercialCase | null>(null)
const caseSourceUrl = ref('')
const caseNotes = ref('')
const caseGenerating = ref(false)
const caseApplying = ref(false)
const caseError = ref('')
const detailCoach = ref<ConversionAdvice | null>(null)
const coachPolish = ref(false)
const coachGenerating = ref(false)
const coachApplying = ref(false)
const coachError = ref('')
const aiStatus = ref<{ configured: boolean; provider: string; model?: string }>({ configured: false, provider: 'openai' })

function emptyForm() {
  return {
    organisation: '',
    archetype: '',
    sector: '',
    partnership_role: 'end_client',
    geography: 'NG',
    lane: 'immediate',
    current_stage: 1,
    decision_maker: '',
    contact_email: '',
    relationship_owner: auth.profile.value?.full_name || auth.profile.value?.email || '',
    strategic_problem: '',
    trigger_event: '',
    lani_capability: '',
    potential_partners: '',
    estimated_value: '' as string | number,
    probability: '' as string | number,
    expected_decision_date: '',
    revenue_originated: 0 as string | number,
    revenue_influenced: 0 as string | number,
    next_action: '',
    notes: '',
    consortium_required: false,
    commercial_model: 'direct',
    delivery_partner_account_id: '',
    score_strategic_fit: 3,
    score_access: 3,
    score_commercial: 3,
    score_urgency: 3,
    score_conversion: 3,
  }
}

function scoreKey(id: string) {
  return `score_${id}` as const
}

const previewPriority = computed(() => {
  const f = showAddModal.value ? addForm.value : editForm.value
  const vals = [
    Number(f.score_strategic_fit),
    Number(f.score_access),
    Number(f.score_commercial),
    Number(f.score_urgency),
    Number(f.score_conversion),
  ]
  return Math.round((vals.reduce((a, b) => a + b, 0) / 5) * 100) / 100
})

async function loadCatalog() {
  const res = await api.listArchetypes()
  archetypes.value = res.archetypes
  sectors.value = res.sectors
  roles.value = res.partnership_roles
  geographies.value = res.geographies
  lanes.value = res.lanes || []
  dimensions.value = res.qualification_dimensions || []
  stages.value = res.account_stages || []
  capabilities.value = res.lani_capabilities || []
  triggers.value = res.commercial_triggers || []
  models.value = res.commercial_models || []
  feeBands.value = res.fee_bands || []
  caseAsks.value = res.case_asks || []
  coachStalls.value = res.coach_stalls || []
  const partners = await api.listAccounts()
  partnerAccounts.value = partners.accounts
}

async function loadData() {
  loading.value = true
  loadError.value = ''
  try {
    const params: Record<string, string> = {}
    if (searchQuery.value) params.search = searchQuery.value
    if (filterLane.value) params.lane = filterLane.value
    if (filterArchetype.value) params.archetype = filterArchetype.value
    if (filterGeography.value) params.geography = filterGeography.value
    if (filterRole.value) params.partnership_role = filterRole.value
    const res = await api.listAccounts(params)
    accounts.value = res.accounts
    laneCounts.value = res.lane_counts || {}
  } catch (e: any) {
    loadError.value = e.message || 'Could not load accounts'
  } finally {
    loading.value = false
  }
}

async function openFromQuery() {
  const id = typeof route.query.open === 'string' ? route.query.open : ''
  if (!id) return
  await openDetailById(id)
}

onMounted(async () => {
  try {
    await loadCatalog()
    const ai = await api.getAiStatus()
    aiStatus.value = ai.ai
  } catch (e) {
    console.error('Failed to load catalog', e)
  }
  await loadData()
  await openFromQuery()
})

watch(() => route.query.open, () => { openFromQuery() })

function laneLabel(id?: string | null) {
  return lanes.value.find((l) => l.id === id)?.name || id || '—'
}
function stageLabel(id?: number | null) {
  return stages.value.find((s) => s.id === id)?.label || `Stage ${id ?? '?'}`
}
function roleLabel(id?: string | null) {
  return roles.value.find((r) => r.id === id)?.name || id || '—'
}
function geographyLabel(id?: string | null) {
  return geographies.value.find((g) => g.id === id)?.name || id || '—'
}
function sectorLabel(id?: string | null) {
  return sectors.value.find((s) => s.id === id)?.name || id || '—'
}
function archetypeName(id?: string | null) {
  return archetypes.value.find((a) => a.id === id)?.name || id || '—'
}
function modelLabel(id?: string | null) {
  return models.value.find((m) => m.id === id)?.name || id || 'Direct engagement'
}
function gapLabel(id: string) {
  return CONVERSION_GAP_LABELS[id] || id
}
function defaultModelFor(role: string) {
  return models.value.find((m) => m.default_for === role)?.id || 'direct'
}
function onRoleChange(form: ReturnType<typeof emptyForm>) {
  form.commercial_model = defaultModelFor(form.partnership_role)
}
function partnerOptions(excludeId?: string) {
  return partnerAccounts.value.filter((a) => a.id !== excludeId)
}

function priorityColor(score: number | null | undefined) {
  if (score == null) return 'text-gray-500'
  if (score >= 4) return 'text-accent-success'
  if (score >= 3) return 'text-accent-gold'
  return 'text-gray-400'
}

function money(value: number | null | undefined) {
  if (value == null || value === ('' as any)) return '—'
  return new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 }).format(Number(value))
}

function disciplineError(form: ReturnType<typeof emptyForm>) {
  const stage = Number(form.current_stage) || 1
  if (stage >= 2 && stage <= 5 && !String(form.next_action || '').trim()) return 'Set a next action'
  if (stage >= 4 && stage <= 6 && !String(form.expected_decision_date || '').trim()) return 'Set an expected decision date'
  if (stage >= 4 && stage <= 6 && form.consortium_required && !form.delivery_partner_account_id) {
    return 'Name the delivery partner — consortium is required'
  }
  return ''
}

function payloadFrom(form: ReturnType<typeof emptyForm>) {
  return {
    organisation: form.organisation.trim(),
    archetype: form.archetype,
    sector: form.sector || null,
    partnership_role: form.partnership_role,
    geography: form.geography,
    lane: form.lane,
    current_stage: Number(form.current_stage) || 1,
    decision_maker: form.decision_maker.trim() || null,
    contact_email: form.contact_email.trim() || null,
    relationship_owner: form.relationship_owner.trim() || null,
    strategic_problem: form.strategic_problem.trim() || null,
    trigger_event: form.trigger_event || null,
    lani_capability: form.lani_capability || null,
    potential_partners: form.potential_partners.trim() || null,
    estimated_value: form.estimated_value === '' ? null : Number(form.estimated_value),
    probability: form.probability === '' ? null : Number(form.probability),
    expected_decision_date: form.expected_decision_date || null,
    revenue_originated: Number(form.revenue_originated) || 0,
    revenue_influenced: Number(form.revenue_influenced) || 0,
    next_action: form.next_action.trim() || null,
    notes: form.notes.trim() || null,
    consortium_required: Boolean(form.consortium_required),
    commercial_model: form.commercial_model || defaultModelFor(form.partnership_role),
    delivery_partner_account_id: form.delivery_partner_account_id || null,
    score_strategic_fit: Number(form.score_strategic_fit),
    score_access: Number(form.score_access),
    score_commercial: Number(form.score_commercial),
    score_urgency: Number(form.score_urgency),
    score_conversion: Number(form.score_conversion),
  }
}

function formFromAccount(account: Account) {
  return {
    organisation: account.organisation || '',
    archetype: account.archetype || '',
    sector: account.sector || '',
    partnership_role: account.partnership_role || 'end_client',
    geography: account.geography || 'NG',
    lane: account.lane || 'immediate',
    current_stage: account.current_stage || 1,
    decision_maker: account.decision_maker || '',
    contact_email: account.contact_email || '',
    relationship_owner: account.relationship_owner || '',
    strategic_problem: account.strategic_problem || '',
    trigger_event: account.trigger_event || '',
    lani_capability: account.lani_capability || '',
    potential_partners: account.potential_partners || '',
    estimated_value: account.estimated_value ?? '',
    probability: account.probability ?? '',
    expected_decision_date: account.expected_decision_date || '',
    revenue_originated: account.revenue_originated ?? 0,
    revenue_influenced: account.revenue_influenced ?? 0,
    next_action: account.next_action || '',
    notes: account.notes || '',
    consortium_required: Boolean(account.consortium_required),
    commercial_model: account.commercial_model || defaultModelFor(account.partnership_role),
    delivery_partner_account_id: account.delivery_partner_account_id || '',
    score_strategic_fit: account.score_strategic_fit ?? 3,
    score_access: account.score_access ?? 3,
    score_commercial: account.score_commercial ?? 3,
    score_urgency: account.score_urgency ?? 3,
    score_conversion: account.score_conversion ?? 3,
  }
}

function openAdd() {
  addForm.value = emptyForm()
  addError.value = ''
  addSourceUrl.value = ''
  addNotes.value = ''
  addBrief.value = null
  showAddModal.value = true
}

async function researchAdd() {
  addError.value = ''
  if (!addForm.value.organisation.trim()) {
    addError.value = 'Enter an organisation name before Research.'
    return
  }
  if (!aiStatus.value.configured) {
    addError.value = 'Research is not configured on the API.'
    return
  }
  addResearching.value = true
  try {
    const res = await api.researchBrief({
      organisation: addForm.value.organisation.trim(),
      source_url: addSourceUrl.value.trim() || undefined,
      notes: addNotes.value.trim() || undefined,
      geography: addForm.value.geography,
      partnership_role: addForm.value.partnership_role,
      sector: addForm.value.sector || undefined,
    })
    addBrief.value = res.brief
  } catch (e: any) {
    addError.value = e.message || 'Research failed.'
  } finally {
    addResearching.value = false
  }
}

async function createFromAddBrief(fields: ApplyableBriefField[]) {
  if (!addBrief.value) return
  addError.value = ''
  addCreatingFromBrief.value = true
  try {
    const res = await api.createAccountFromBrief(addBrief.value.id, {
      accepted_fields: fields,
      organisation: addForm.value.organisation.trim() || addBrief.value.organisation || undefined,
      relationship_owner: addForm.value.relationship_owner.trim() || undefined,
    })
    showAddModal.value = false
    addBrief.value = null
    await loadData()
    await loadCatalog()
    await openDetailById(res.account.id)
  } catch (e: any) {
    addError.value = e.message || 'Could not create account from the brief.'
  } finally {
    addCreatingFromBrief.value = false
  }
}

async function submitAdd() {
  addError.value = ''
  if (!addForm.value.organisation.trim() || !addForm.value.archetype) {
    addError.value = 'Organisation and client archetype are required.'
    return
  }
  const gate = disciplineError(addForm.value)
  if (gate) {
    addError.value = gate
    return
  }
  adding.value = true
  try {
    await api.createAccount(payloadFrom(addForm.value))
    showAddModal.value = false
    await loadData()
  } catch (e: any) {
    addError.value = e.message || 'Could not add account.'
  } finally {
    adding.value = false
  }
}

async function openDetail(account: Account) {
  await openDetailById(account.id)
}

async function loadLatestBrief(accountId: string) {
  try {
    const res = await api.getLatestBrief(accountId)
    detailBrief.value = res.brief
  } catch {
    detailBrief.value = null
  }
}

async function loadLatestCase(accountId: string) {
  try {
    const res = await api.getLatestCase(accountId)
    detailCase.value = res.case
  } catch {
    detailCase.value = null
  }
}

async function loadLatestCoach(accountId: string) {
  try {
    const res = await api.getLatestCoach(accountId)
    detailCoach.value = res.advice
  } catch {
    detailCoach.value = null
  }
}

const caseUnlocked = computed(() => Number(selected.value?.current_stage) >= 2)
const coachUnlocked = computed(() => {
  const stage = Number(selected.value?.current_stage)
  return stage >= 1 && stage <= 5
})

async function openDetailById(id: string) {
  detailError.value = ''
  editing.value = false
  detailSourceUrl.value = ''
  detailNotes.value = ''
  try {
    const res = await api.getAccount(id)
    selected.value = res.account
    opportunities.value = res.opportunities || []
    spawned.value = res.spawned || []
    await loadLatestBrief(id)
    await loadLatestCase(id)
    await loadLatestCoach(id)
    caseError.value = ''
    caseSourceUrl.value = ''
    caseNotes.value = ''
    coachError.value = ''
    coachPolish.value = false
    if (route.query.open !== id) {
      router.replace({ path: '/accounts', query: { open: id } })
    }
  } catch (e: any) {
    detailError.value = e.message || 'Could not load account'
    selected.value = accounts.value.find((a) => a.id === id) || null
    opportunities.value = []
    spawned.value = []
    detailBrief.value = null
    detailCase.value = null
    detailCoach.value = null
  }
}

function closeDetail() {
  selected.value = null
  editing.value = false
  detailError.value = ''
  opportunities.value = []
  spawned.value = []
  detailBrief.value = null
  detailSourceUrl.value = ''
  detailNotes.value = ''
  detailCase.value = null
  caseSourceUrl.value = ''
  caseNotes.value = ''
  caseError.value = ''
  detailCoach.value = null
  coachPolish.value = false
  coachError.value = ''
  if (route.query.open) router.replace({ path: '/accounts' })
}

async function researchDetail() {
  if (!selected.value) return
  detailError.value = ''
  if (!aiStatus.value.configured) {
    detailError.value = 'Research is not configured on the API.'
    return
  }
  detailResearching.value = true
  try {
    const res = await api.researchAccountBrief(selected.value.id, {
      source_url: detailSourceUrl.value.trim() || undefined,
      notes: detailNotes.value.trim() || undefined,
    })
    detailBrief.value = res.brief
  } catch (e: any) {
    detailError.value = e.message || 'Research failed.'
  } finally {
    detailResearching.value = false
  }
}

async function generateDetailCase() {
  if (!selected.value) return
  caseError.value = ''
  if (Number(selected.value.current_stage) < 2) {
    caseError.value = 'Qualify this account first. Commercial Case is blocked at Intelligence.'
    return
  }
  if (!aiStatus.value.configured) {
    caseError.value = 'Research is not configured on the API.'
    return
  }
  caseGenerating.value = true
  try {
    const res = await api.generateCase(selected.value.id, {
      source_url: caseSourceUrl.value.trim() || undefined,
      notes: caseNotes.value.trim() || undefined,
    })
    detailCase.value = res.case
  } catch (e: any) {
    caseError.value = e.message || 'Could not generate the commercial case.'
  } finally {
    caseGenerating.value = false
  }
}

async function generateDetailCoach() {
  if (!selected.value) return
  coachError.value = ''
  const stage = Number(selected.value.current_stage)
  if (stage < 1 || stage > 5) {
    coachError.value = 'Conversion Coach is off for Won, Lost, or On hold accounts.'
    return
  }
  if (coachPolish.value && !aiStatus.value.configured) {
    coachError.value = 'Polish needs research configured on the API. Get rules advice without polish, or add an API key.'
    return
  }
  coachGenerating.value = true
  try {
    const res = await api.generateCoach(selected.value.id, { polish: coachPolish.value })
    detailCoach.value = res.advice
  } catch (e: any) {
    coachError.value = e.message || 'Could not generate Conversion Coach advice.'
  } finally {
    coachGenerating.value = false
  }
}

async function applyDetailCoach(payload: { accepted_fields: CoachFieldId[]; account_fields: CoachApplyAccountField[] }) {
  if (!selected.value || !detailCoach.value) return
  coachError.value = ''
  coachApplying.value = true
  try {
    const res = await api.applyCoach(selected.value.id, detailCoach.value.id, payload)
    detailCoach.value = res.advice
    selected.value = res.account
    editing.value = false
    await loadData()
  } catch (e: any) {
    coachError.value = e.message || 'Could not apply accepted fields.'
  } finally {
    coachApplying.value = false
  }
}

async function applyDetailCase(payload: { accepted_sections: CaseSectionId[]; account_fields: CaseApplyAccountField[] }) {
  if (!selected.value || !detailCase.value) return
  caseError.value = ''
  caseApplying.value = true
  try {
    const res = await api.applyCase(selected.value.id, detailCase.value.id, payload)
    detailCase.value = res.case
    selected.value = res.account
    editing.value = false
    await loadData()
  } catch (e: any) {
    caseError.value = e.message || 'Could not apply accepted sections.'
  } finally {
    caseApplying.value = false
  }
}

async function applyDetailBrief(fields: ApplyableBriefField[]) {
  if (!selected.value || !detailBrief.value) return
  detailError.value = ''
  detailApplying.value = true
  try {
    const res = await api.applyBrief(selected.value.id, detailBrief.value.id, fields)
    selected.value = res.account
    detailBrief.value = res.brief
    editing.value = false
    await loadData()
  } catch (e: any) {
    detailError.value = e.message || 'Could not apply accepted fields.'
  } finally {
    detailApplying.value = false
  }
}

function startEdit() {
  if (!selected.value) return
  editing.value = true
  detailError.value = ''
  editForm.value = formFromAccount(selected.value)
}

function cancelEdit() {
  editing.value = false
  detailError.value = ''
}

async function saveEdit() {
  if (!selected.value) return
  if (!editForm.value.organisation?.trim()) {
    detailError.value = 'Organisation is required.'
    return
  }
  const gate = disciplineError(editForm.value)
  if (gate) {
    detailError.value = gate
    return
  }
  saving.value = true
  detailError.value = ''
  try {
    const res = await api.updateAccount(selected.value.id, payloadFrom(editForm.value))
    selected.value = res.account
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
  if (!confirm(`Archive ${selected.value.organisation}? It will be hidden from the account map.`)) return
  archiving.value = true
  detailError.value = ''
  try {
    await api.archiveAccount(selected.value.id)
    closeDetail()
    await loadData()
  } catch (e: any) {
    detailError.value = e.message || 'Could not archive account.'
  } finally {
    archiving.value = false
  }
}

function setLaneFilter(id: string) {
  filterLane.value = filterLane.value === id ? '' : id
  loadData()
}

/** Score helpers for the five qualification dimensions. */

function accountScore(account: Account, dimId: string) {
  return Number((account as any)[scoreKey(dimId)]) || 0
}

function scoreValue(form: any, dimId: string): number {
  return Number(form[scoreKey(dimId)]) || 3
}

function setScore(form: any, dimId: string, value: number) {
  form[scoreKey(dimId)] = value
}

const PIPELINE_STAGES = ['Intelligence', 'Qualified', 'In conversation', 'Proposal', 'Verbal / commit', 'Won', 'Lost / no fit', 'On hold']
</script>

<template>
  <div>
    <div class="mb-6 flex items-start justify-between gap-4">
      <div>
        <h2 class="text-2xl font-display font-bold text-white">Account Map</h2>
        <p class="text-gray-400 mt-1">Prioritised organisations by commercial lane. Five qualification scores are shown; the average is internal sort only.</p>
      </div>
      <button @click="openAdd" class="btn-primary text-sm flex items-center gap-1.5 shrink-0">
        <span>+</span> Add account
      </button>
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

    <div class="flex flex-wrap gap-3 mb-6">
      <input v-model="searchQuery" @change="loadData" class="input-field w-72" placeholder="Search organisation, owner, problem…" />
      <select v-model="filterArchetype" @change="loadData" class="select-field w-48">
        <option value="">All archetypes</option>
        <option v-for="a in archetypes" :key="a.id" :value="a.id">{{ a.id }} — {{ a.name }}</option>
      </select>
      <select v-model="filterGeography" @change="loadData" class="select-field w-40">
        <option value="">All geographies</option>
        <option v-for="g in geographies" :key="g.id" :value="g.id">{{ g.name }}</option>
      </select>
      <select v-model="filterRole" @change="loadData" class="select-field w-44">
        <option value="">All roles</option>
        <option v-for="r in roles" :key="r.id" :value="r.id">{{ r.name }}</option>
      </select>
      <button @click="loadData" class="btn-secondary text-sm">Refresh</button>
    </div>

    <div v-if="loadError" class="card border-accent-danger/30 text-accent-danger mb-6">{{ loadError }}</div>
    <div v-if="loading" class="py-12 text-center text-gray-500">Loading account map…</div>

    <div v-else-if="accounts.length === 0" class="py-12 text-center text-gray-500">
      No accounts yet.
      <button @click="openAdd" class="text-primary-400 underline cursor-pointer">Add the first organisation</button>
    </div>

    <div v-else class="card p-0 overflow-x-auto">
      <table class="w-full text-sm">
        <thead>
          <tr class="border-b border-deep-600 text-left">
            <th class="py-3 px-4 text-gray-400 font-medium">Organisation</th>
            <th class="py-3 px-4 text-gray-400 font-medium">Lane</th>
            <th class="py-3 px-4 text-gray-400 font-medium">Qualification</th>
            <th class="py-3 px-4 text-gray-400 font-medium">Decision-maker</th>
            <th class="py-3 px-4 text-gray-400 font-medium">Next action</th>
            <th class="py-3 px-4 text-gray-400 font-medium">Value</th>
            <th class="py-3 px-4 text-gray-400 font-medium text-right" title="Average of five scores — used only to sort this table">Internal</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="account in accounts"
            :key="account.id"
            class="border-b border-deep-700 hover:bg-deep-700/50 transition-colors cursor-pointer"
            @click="openDetail(account)"
          >
            <td class="py-3 px-4">
              <div class="font-medium text-white">{{ account.organisation }}</div>
              <div class="text-xs text-gray-500 mt-0.5">
                {{ account.archetype }} · {{ geographyLabel(account.geography) }} · {{ roleLabel(account.partnership_role) }}
                <span v-if="account.consortium_required" class="ml-1 text-accent-gold">· Consortium</span>
              </div>
              <div v-if="account.conversion_gaps?.length" class="flex flex-wrap gap-1 mt-1">
                <span
                  v-for="gap in account.conversion_gaps"
                  :key="gap"
                  class="text-[11px] px-1.5 py-0.5 rounded bg-accent-gold/15 text-accent-gold"
                >{{ gapLabel(gap) }}</span>
              </div>
            </td>
            <td class="py-3 px-4">
              <div class="text-gray-200">{{ laneLabel(account.lane) }}</div>
              <div class="text-xs text-gray-500">{{ stageLabel(account.current_stage) }}</div>
            </td>
            <td class="py-3 px-4">
              <div class="flex gap-1 text-[11px] font-medium">
                <span class="px-1.5 py-0.5 rounded bg-deep-700 text-gray-300" title="Strategic fit">S{{ account.score_strategic_fit }}</span>
                <span class="px-1.5 py-0.5 rounded bg-deep-700 text-gray-300" title="Access">A{{ account.score_access }}</span>
                <span class="px-1.5 py-0.5 rounded bg-deep-700 text-gray-300" title="Commercial">C{{ account.score_commercial }}</span>
                <span class="px-1.5 py-0.5 rounded bg-deep-700 text-gray-300" title="Urgency">U{{ account.score_urgency }}</span>
                <span class="px-1.5 py-0.5 rounded bg-deep-700 text-gray-300" title="Conversion">V{{ account.score_conversion }}</span>
              </div>
            </td>
            <td class="py-3 px-4 text-gray-300">{{ account.decision_maker || '—' }}</td>
            <td class="py-3 px-4 text-xs text-gray-300 max-w-[180px]">{{ account.next_action || '—' }}</td>
            <td class="py-3 px-4 text-gray-300">{{ money(account.estimated_value) }}</td>
            <td class="py-3 px-4 text-right">
              <span class="text-xs text-gray-500 mr-1">sort</span>
              <span class="font-semibold" :class="priorityColor(account.internal_priority)">{{ account.internal_priority }}</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Add account -->
    <div v-if="showAddModal" class="fixed inset-0 z-[70] flex items-start justify-center bg-black/60 p-4 overflow-y-auto" @click.self="showAddModal = false">
      <div class="bg-deep-800 border border-deep-600 rounded-xl p-6 w-full max-w-3xl my-8">
        <div class="flex items-center justify-between mb-6">
          <h3 class="text-lg font-display font-semibold text-white">Add account</h3>
          <button class="text-gray-400 hover:text-white text-xl leading-none" @click="showAddModal = false">×</button>
        </div>
        <form class="space-y-5" @submit.prevent="submitAdd">
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div class="md:col-span-2">
              <label class="label">Organisation *</label>
              <input v-model="addForm.organisation" class="input-field" required placeholder="e.g. Federal Ministry of Agriculture" />
            </div>
            <div class="md:col-span-2 rounded-lg border border-deep-600 bg-deep-900/40 p-4 space-y-3">
              <div class="flex items-center justify-between gap-3">
                <div>
                  <h4 class="font-medium text-white">Research</h4>
                  <p class="text-xs text-gray-500">Draft a brief, then tick fields to create at Intelligence. The form below stays for a manual add.</p>
                </div>
                <button
                  type="button"
                  class="btn-primary text-sm"
                  :disabled="addResearching || !addForm.organisation.trim() || !aiStatus.configured"
                  @click="researchAdd"
                >
                  {{ addResearching ? 'Researching…' : 'Research' }}
                </button>
              </div>
              <p v-if="!aiStatus.configured" class="text-xs text-accent-gold">Research is not configured on the API.</p>
              <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label class="label">Public page (optional)</label>
                  <input v-model="addSourceUrl" type="url" class="input-field" placeholder="https://" />
                </div>
                <div>
                  <label class="label">Owner notes (optional)</label>
                  <input v-model="addNotes" class="input-field" placeholder="What you already know" />
                </div>
              </div>
              <AccountBriefPanel
                v-if="addBrief"
                mode="create"
                :brief="addBrief"
                :busy="addCreatingFromBrief"
                :archetypes="archetypes"
                :sectors="sectors"
                :roles="roles"
                :geographies="geographies"
                :lanes="lanes"
                :models="models"
                @apply="createFromAddBrief"
              />
            </div>
            <div>
              <label class="label">Client archetype *</label>
              <select v-model="addForm.archetype" class="select-field" required>
                <option value="" disabled>Select A–F</option>
                <option v-for="a in archetypes" :key="a.id" :value="a.id">{{ a.id }} — {{ a.name }}</option>
              </select>
            </div>
            <div>
              <label class="label">Partnership role</label>
              <select v-model="addForm.partnership_role" class="select-field" @change="onRoleChange(addForm)">
                <option v-for="r in roles" :key="r.id" :value="r.id">{{ r.name }}</option>
              </select>
            </div>
            <div>
              <label class="label">Commercial model</label>
              <select v-model="addForm.commercial_model" class="select-field">
                <option v-for="m in models" :key="m.id" :value="m.id">{{ m.name }}</option>
              </select>
              <p class="text-xs text-gray-500 mt-1">{{ models.find((m) => m.id === addForm.commercial_model)?.hint }}</p>
            </div>
            <div>
              <label class="label">Named delivery partner</label>
              <select v-model="addForm.delivery_partner_account_id" class="select-field">
                <option value="">Not named yet</option>
                <option v-for="p in partnerOptions()" :key="p.id" :value="p.id">{{ p.organisation }}</option>
              </select>
            </div>
            <div>
              <label class="label">Geography</label>
              <select v-model="addForm.geography" class="select-field">
                <option v-for="g in geographies" :key="g.id" :value="g.id">{{ g.name }}</option>
              </select>
            </div>
            <div>
              <label class="label">Sector overlay</label>
              <select v-model="addForm.sector" class="select-field">
                <option value="">Not specified yet</option>
                <option v-for="s in sectors" :key="s.id" :value="s.id">{{ s.name }}</option>
              </select>
            </div>
            <div>
              <label class="label">Commercial lane</label>
              <select v-model="addForm.lane" class="select-field">
                <option v-for="l in lanes" :key="l.id" :value="l.id">{{ l.short }} — {{ l.name }}</option>
              </select>
            </div>
            <div>
              <label class="label">Account stage</label>
              <select v-model.number="addForm.current_stage" class="select-field">
                <option v-for="s in stages" :key="s.id" :value="s.id">{{ s.label }}</option>
              </select>
            </div>
            <div>
              <label class="label">Decision-maker</label>
              <input v-model="addForm.decision_maker" class="input-field" placeholder="Name and title" />
            </div>
            <div>
              <label class="label">Relationship owner</label>
              <input v-model="addForm.relationship_owner" class="input-field" />
            </div>
            <div>
              <label class="label">Trigger event</label>
              <select v-model="addForm.trigger_event" class="select-field">
                <option value="">Not specified</option>
                <option v-for="t in triggers" :key="t.id" :value="t.trigger">{{ t.trigger }}</option>
              </select>
            </div>
            <div>
              <label class="label">LANI capability</label>
              <select v-model="addForm.lani_capability" class="select-field">
                <option value="">Not specified</option>
                <option v-for="c in capabilities" :key="c" :value="c">{{ c }}</option>
              </select>
            </div>
            <div class="md:col-span-2">
              <label class="label">Strategic problem</label>
              <textarea v-model="addForm.strategic_problem" class="input-field min-h-[72px]" placeholder="What is changing, and why LANI?" />
            </div>
            <div class="md:col-span-2">
              <label class="label">Potential partners</label>
              <input v-model="addForm.potential_partners" class="input-field" placeholder="Names of likely consortium or channel partners" />
            </div>
            <div>
              <label class="label">Estimated value (NGN)</label>
              <input v-model="addForm.estimated_value" type="number" min="0" class="input-field" />
            </div>
            <div>
              <label class="label">Probability (%)</label>
              <input v-model="addForm.probability" type="number" min="0" max="100" class="input-field" />
            </div>
            <div>
              <label class="label">Expected decision date</label>
              <input v-model="addForm.expected_decision_date" type="date" class="input-field" />
            </div>
            <div>
              <label class="label">Next action <span v-if="addForm.current_stage >= 2 && addForm.current_stage <= 5" class="text-accent-gold">*</span></label>
              <input v-model="addForm.next_action" class="input-field" placeholder="What happens next, and by when" />
            </div>
            <div class="md:col-span-2">
              <label class="flex items-center gap-2 text-sm text-gray-300">
                <input v-model="addForm.consortium_required" type="checkbox" class="rounded border-deep-500" />
                Needs a consortium / delivery partner — not LANI capability alone
              </label>
            </div>
          </div>

          <div>
            <h4 class="font-medium text-white mb-1">Qualification (1–5)</h4>
            <p class="text-xs text-gray-500 mb-3">Show all five. Average {{ previewPriority }} is internal sort only.</p>
            <div class="space-y-3">
              <div v-for="dim in dimensions" :key="dim.id">
                <div class="flex items-baseline justify-between gap-2 mb-1">
                  <label class="label mb-0">{{ dim.name }}</label>
                  <span class="text-xs text-gray-500">{{ dim.question }}</span>
                </div>
                <div class="flex gap-1">
                  <button
                    v-for="n in 5"
                    :key="n"
                    type="button"
                    class="flex-1 py-1.5 rounded-lg text-sm font-medium border"
                    :class="scoreValue(addForm, dim.id) === n
                      ? 'bg-primary-500/20 text-primary-400 border-primary-500/40'
                      : 'bg-deep-700 text-gray-400 border-deep-600 hover:border-deep-500'"
                    @click="setScore(addForm, dim.id, n)"
                  >{{ n }}</button>
                </div>
              </div>
            </div>
          </div>

          <p v-if="addError" class="text-sm text-red-400">{{ addError }}</p>
          <div class="flex justify-end gap-3 pt-2">
            <button type="button" class="btn-secondary" @click="showAddModal = false">Cancel</button>
            <button type="submit" class="btn-primary" :disabled="adding || !addForm.organisation.trim() || !addForm.archetype">
              {{ adding ? 'Adding…' : 'Add account' }}
            </button>
          </div>
        </form>
      </div>
    </div>

    <!-- Detail -->
    <div v-if="selected" class="fixed inset-0 z-[70] flex items-start justify-center bg-black/60 p-4 overflow-y-auto" @click.self="closeDetail">
      <div class="bg-deep-800 border border-deep-600 rounded-xl p-6 w-full max-w-3xl my-8">
        <div class="flex items-start justify-between gap-4 mb-6">
          <div>
            <h3 class="text-lg font-display font-semibold text-white">{{ selected.organisation }}</h3>
            <p class="text-sm text-gray-500 mt-1">{{ archetypeName(selected.archetype) }} · {{ geographyLabel(selected.geography) }} · {{ laneLabel(selected.lane) }}</p>
          </div>
          <div class="flex items-center gap-2 shrink-0">
            <button v-if="!editing" class="btn-secondary text-sm" @click="startEdit">✏️ Edit</button>
            <button class="btn-secondary text-sm text-red-400 hover:text-red-300" :disabled="archiving" @click="archiveSelected">
              {{ archiving ? 'Archiving…' : '🗑️ Archive' }}
            </button>
            <button class="text-gray-400 hover:text-white text-xl leading-none px-1" @click="closeDetail">×</button>
          </div>
        </div>

        <div v-if="!editing" class="space-y-5 text-sm">
          <div class="rounded-lg border border-deep-600 bg-deep-900/40 p-4 space-y-3">
            <div class="flex items-center justify-between gap-3">
              <div>
                <h4 class="font-medium text-white">Research</h4>
                <p class="text-xs text-gray-500">Review the draft, then tick fields to write back. Nothing auto-saves.</p>
              </div>
              <button
                type="button"
                class="btn-primary text-sm"
                :disabled="detailResearching || !aiStatus.configured"
                @click="researchDetail"
              >
                {{ detailResearching ? 'Researching…' : 'Research' }}
              </button>
            </div>
            <p v-if="!aiStatus.configured" class="text-xs text-accent-gold">Research is not configured on the API.</p>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label class="label">Public page (optional)</label>
                <input v-model="detailSourceUrl" type="url" class="input-field" placeholder="https://" />
              </div>
              <div>
                <label class="label">Owner notes (optional)</label>
                <input v-model="detailNotes" class="input-field" placeholder="What you already know" />
              </div>
            </div>
            <AccountBriefPanel
              v-if="detailBrief"
              mode="apply"
              :brief="detailBrief"
              :current="selected"
              :busy="detailApplying"
              :archetypes="archetypes"
              :sectors="sectors"
              :roles="roles"
              :geographies="geographies"
              :lanes="lanes"
              :models="models"
              @apply="applyDetailBrief"
            />
          </div>

          <div v-if="coachUnlocked" class="rounded-lg border border-deep-600 bg-deep-900/40 p-4 space-y-3">
            <div class="flex items-center justify-between gap-3">
              <div>
                <h4 class="font-medium text-white">Conversion Coach</h4>
                <p class="text-xs text-gray-500">Stall, why, and next action on stages 1–5. Tick to accept. Stage and value never write back.</p>
              </div>
              <button
                type="button"
                class="btn-primary text-sm"
                :disabled="coachGenerating"
                @click="generateDetailCoach"
              >
                {{ coachGenerating ? (coachPolish ? 'Polishing…' : 'Evaluating…') : 'Get advice' }}
              </button>
            </div>
            <label class="flex items-center gap-2 text-sm" :class="aiStatus.configured ? 'text-gray-300 cursor-pointer' : 'text-gray-600'">
              <input
                v-model="coachPolish"
                type="checkbox"
                class="rounded border-deep-500"
                :disabled="!aiStatus.configured || coachGenerating"
              />
              Polish next action and why
              <span v-if="!aiStatus.configured" class="text-xs text-gray-500">(needs API key)</span>
            </label>
            <div v-if="coachError" class="p-3 bg-red-900/20 border border-red-800/30 rounded-lg text-red-400 text-sm">{{ coachError }}</div>
            <AccountCoachPanel
              v-if="detailCoach"
              :advice="detailCoach"
              :current="selected"
              :busy="coachApplying"
              :stalls="coachStalls"
              :asks="caseAsks"
              @apply="applyDetailCoach"
            />
          </div>

          <div class="rounded-lg border border-deep-600 bg-deep-900/40 p-4 space-y-3">
            <div class="flex items-center justify-between gap-3">
              <div>
                <h4 class="font-medium text-white">Commercial Case</h4>
                <p class="text-xs text-gray-500">Pursuit memo after Qualified. Accept sections. Stage does not move.</p>
              </div>
              <button
                v-if="caseUnlocked"
                type="button"
                class="btn-primary text-sm"
                :disabled="caseGenerating || !aiStatus.configured"
                @click="generateDetailCase"
              >
                {{ caseGenerating ? 'Generating…' : 'Generate Case' }}
              </button>
            </div>
            <div v-if="!caseUnlocked" class="rounded-lg border border-accent-gold/30 bg-accent-gold/10 p-3 text-sm text-accent-gold">
              Blocked at Intelligence. Apply a Brief, then move this account to Qualified to generate a pursuit memo.
            </div>
            <template v-else>
              <p v-if="!aiStatus.configured" class="text-xs text-accent-gold">Research is not configured on the API.</p>
              <div v-if="caseError" class="p-3 bg-red-900/20 border border-red-800/30 rounded-lg text-red-400 text-sm">{{ caseError }}</div>
              <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label class="label">Public page (optional)</label>
                  <input v-model="caseSourceUrl" type="url" class="input-field" placeholder="https://" />
                </div>
                <div>
                  <label class="label">Owner notes (optional)</label>
                  <input v-model="caseNotes" class="input-field" placeholder="What you already know" />
                </div>
              </div>
              <AccountCasePanel
                v-if="detailCase"
                :case-record="detailCase"
                :current="selected"
                :busy="caseApplying"
                :models="models"
                :fee-bands="feeBands"
                :asks="caseAsks"
                @apply="applyDetailCase"
              />
            </template>
          </div>

          <div class="flex flex-wrap gap-2">
            <span class="badge bg-primary-500/20 text-primary-300 border-primary-500/30">{{ stageLabel(selected.current_stage) }}</span>
            <span class="badge bg-deep-700 text-gray-300">{{ roleLabel(selected.partnership_role) }}</span>
            <span class="badge bg-deep-700 text-gray-300">{{ modelLabel(selected.commercial_model) }}</span>
            <span v-if="selected.consortium_required" class="badge bg-accent-gold/20 text-accent-gold border-accent-gold/30">Consortium required</span>
            <span v-else class="badge bg-deep-700 text-gray-400">LANI capability</span>
          </div>
          <div v-if="selected.conversion_gaps?.length" class="rounded-lg border border-accent-gold/30 bg-accent-gold/10 p-3 text-sm text-accent-gold">
            Conversion discipline:
            {{ selected.conversion_gaps.map(gapLabel).join(' · ') }}
          </div>

          <div>
            <div class="label mb-2">Qualification scores</div>
            <div class="grid grid-cols-1 sm:grid-cols-5 gap-2">
              <div v-for="dim in dimensions" :key="dim.id" class="rounded-lg bg-deep-700/60 p-3">
                <div class="text-[11px] text-gray-500">{{ dim.name }}</div>
                <div class="text-xl font-semibold text-white mt-1">{{ accountScore(selected, dim.id) }}</div>
              </div>
            </div>
            <p class="text-xs text-gray-500 mt-2">Internal sort average <span :class="priorityColor(selected.internal_priority)" class="font-medium">{{ selected.internal_priority }}</span> — not a public ranking.</p>
          </div>

          <dl class="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
            <div><dt class="text-xs text-gray-500 mb-1">Decision-maker</dt><dd class="text-gray-200">{{ selected.decision_maker || '—' }}</dd></div>
            <div>
              <dt class="text-xs text-gray-500 mb-1">Contact</dt>
              <dd class="text-gray-200">
                <a v-if="selected.contact_email" :href="'mailto:' + selected.contact_email" class="text-accent-teal hover:underline">{{ selected.contact_email }}</a>
                <span v-else>—</span>
              </dd>
            </div>
            <div><dt class="text-xs text-gray-500 mb-1">Relationship owner</dt><dd class="text-gray-200">{{ selected.relationship_owner || '—' }}</dd></div>
            <div><dt class="text-xs text-gray-500 mb-1">Trigger</dt><dd class="text-gray-200">{{ selected.trigger_event || '—' }}</dd></div>
            <div><dt class="text-xs text-gray-500 mb-1">LANI capability</dt><dd class="text-gray-200">{{ selected.lani_capability || '—' }}</dd></div>
            <div><dt class="text-xs text-gray-500 mb-1">Sector</dt><dd class="text-gray-200">{{ sectorLabel(selected.sector) }}</dd></div>
            <div class="sm:col-span-2"><dt class="text-xs text-gray-500 mb-1">Strategic problem</dt><dd class="text-gray-200 whitespace-pre-wrap">{{ selected.strategic_problem || '—' }}</dd></div>
            <div class="sm:col-span-2"><dt class="text-xs text-gray-500 mb-1">Potential partners</dt><dd class="text-gray-200">{{ selected.potential_partners || '—' }}</dd></div>
            <div><dt class="text-xs text-gray-500 mb-1">Named delivery partner</dt><dd class="text-gray-200">{{ selected.delivery_partner_name || '—' }}</dd></div>
            <div><dt class="text-xs text-gray-500 mb-1">Commercial model</dt><dd class="text-gray-200">{{ modelLabel(selected.commercial_model) }}</dd></div>
            <div><dt class="text-xs text-gray-500 mb-1">Estimated value</dt><dd class="text-gray-200">{{ money(selected.estimated_value) }}</dd></div>
            <div><dt class="text-xs text-gray-500 mb-1">Probability</dt><dd class="text-gray-200">{{ selected.probability != null ? selected.probability + '%' : '—' }}</dd></div>
            <div><dt class="text-xs text-gray-500 mb-1">Expected decision</dt><dd class="text-gray-200">{{ selected.expected_decision_date || '—' }}</dd></div>
            <div><dt class="text-xs text-gray-500 mb-1">Next action</dt><dd class="text-gray-200">{{ selected.next_action || '—' }}</dd></div>
            <div><dt class="text-xs text-gray-500 mb-1">Revenue originated</dt><dd class="text-gray-200">{{ money(selected.revenue_originated) }}</dd></div>
            <div><dt class="text-xs text-gray-500 mb-1">Revenue influenced</dt><dd class="text-gray-200">{{ money(selected.revenue_influenced) }}</dd></div>
            <div class="sm:col-span-2"><dt class="text-xs text-gray-500 mb-1">Notes</dt><dd class="text-gray-200 whitespace-pre-wrap">{{ selected.notes || '—' }}</dd></div>
          </dl>

          <div>
            <div class="flex items-center justify-between mb-2">
              <h4 class="font-medium text-white">Linked opportunities</h4>
              <router-link :to="`/intake?account=${selected.id}`" class="text-xs text-primary-400 hover:underline">+ New opportunity from this account</router-link>
            </div>
            <div v-if="opportunities.length === 0" class="text-xs text-gray-500">No pipeline opportunities yet.</div>
            <ul v-else class="space-y-2">
              <li v-for="opp in opportunities" :key="opp.id">
                <router-link :to="`/deals/${opp.id}`" class="block rounded-lg bg-deep-700/50 px-3 py-2 hover:bg-deep-700">
                  <span class="text-white">{{ opp.partner_name }}</span>
                  <span class="text-xs text-gray-500 ml-2">{{ PIPELINE_STAGES[opp.current_stage - 1] }}</span>
                </router-link>
              </li>
            </ul>
          </div>

          <div v-if="spawned.length">
            <h4 class="font-medium text-white mb-2">Opportunities this partner is named on</h4>
            <ul class="space-y-2">
              <li v-for="opp in spawned" :key="opp.id">
                <router-link :to="`/deals/${opp.id}`" class="block rounded-lg bg-deep-700/50 px-3 py-2 hover:bg-deep-700">
                  <span class="text-white">{{ opp.partner_name }}</span>
                  <span class="text-xs text-gray-500 ml-2">{{ PIPELINE_STAGES[opp.current_stage - 1] }}</span>
                </router-link>
              </li>
            </ul>
          </div>
        </div>

        <form v-else class="space-y-5" @submit.prevent="saveEdit">
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div class="md:col-span-2">
              <label class="label">Organisation *</label>
              <input v-model="editForm.organisation" class="input-field" required />
            </div>
            <div>
              <label class="label">Client archetype</label>
              <select v-model="editForm.archetype" class="select-field">
                <option v-for="a in archetypes" :key="a.id" :value="a.id">{{ a.id }} — {{ a.name }}</option>
              </select>
            </div>
            <div>
              <label class="label">Partnership role</label>
              <select v-model="editForm.partnership_role" class="select-field">
                <option v-for="r in roles" :key="r.id" :value="r.id">{{ r.name }}</option>
              </select>
            </div>
            <div>
              <label class="label">Commercial model</label>
              <select v-model="editForm.commercial_model" class="select-field">
                <option v-for="m in models" :key="m.id" :value="m.id">{{ m.name }}</option>
              </select>
            </div>
            <div>
              <label class="label">Named delivery partner</label>
              <select v-model="editForm.delivery_partner_account_id" class="select-field">
                <option value="">Not named yet</option>
                <option v-for="p in partnerOptions(selected.id)" :key="p.id" :value="p.id">{{ p.organisation }}</option>
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
                <option value="">Not specified yet</option>
                <option v-for="s in sectors" :key="s.id" :value="s.id">{{ s.name }}</option>
              </select>
            </div>
            <div>
              <label class="label">Commercial lane</label>
              <select v-model="editForm.lane" class="select-field">
                <option v-for="l in lanes" :key="l.id" :value="l.id">{{ l.short }} — {{ l.name }}</option>
              </select>
            </div>
            <div>
              <label class="label">Account stage</label>
              <select v-model.number="editForm.current_stage" class="select-field">
                <option v-for="s in stages" :key="s.id" :value="s.id">{{ s.label }}</option>
              </select>
            </div>
            <div>
              <label class="label">Decision-maker</label>
              <input v-model="editForm.decision_maker" class="input-field" />
            </div>
            <div>
              <label class="label">Relationship owner</label>
              <input v-model="editForm.relationship_owner" class="input-field" />
            </div>
            <div>
              <label class="label">Contact email</label>
              <input v-model="editForm.contact_email" type="email" class="input-field" />
            </div>
            <div>
              <label class="label">Trigger event</label>
              <select v-model="editForm.trigger_event" class="select-field">
                <option value="">Not specified</option>
                <option v-for="t in triggers" :key="t.id" :value="t.trigger">{{ t.trigger }}</option>
              </select>
            </div>
            <div>
              <label class="label">LANI capability</label>
              <select v-model="editForm.lani_capability" class="select-field">
                <option value="">Not specified</option>
                <option v-for="c in capabilities" :key="c" :value="c">{{ c }}</option>
              </select>
            </div>
            <div class="md:col-span-2">
              <label class="label">Strategic problem</label>
              <textarea v-model="editForm.strategic_problem" class="input-field min-h-[72px]" />
            </div>
            <div class="md:col-span-2">
              <label class="label">Potential partners</label>
              <input v-model="editForm.potential_partners" class="input-field" />
            </div>
            <div>
              <label class="label">Estimated value (NGN)</label>
              <input v-model="editForm.estimated_value" type="number" min="0" class="input-field" />
            </div>
            <div>
              <label class="label">Probability (%)</label>
              <input v-model="editForm.probability" type="number" min="0" max="100" class="input-field" />
            </div>
            <div>
              <label class="label">Expected decision date</label>
              <input v-model="editForm.expected_decision_date" type="date" class="input-field" />
            </div>
            <div>
              <label class="label">Next action <span v-if="editForm.current_stage >= 2 && editForm.current_stage <= 5" class="text-accent-gold">*</span></label>
              <input v-model="editForm.next_action" class="input-field" />
            </div>
            <div>
              <label class="label">Revenue originated (NGN)</label>
              <input v-model="editForm.revenue_originated" type="number" min="0" class="input-field" />
            </div>
            <div>
              <label class="label">Revenue influenced (NGN)</label>
              <input v-model="editForm.revenue_influenced" type="number" min="0" class="input-field" />
            </div>
            <div class="md:col-span-2">
              <label class="label">Notes</label>
              <textarea v-model="editForm.notes" class="input-field min-h-[72px]" />
            </div>
            <div class="md:col-span-2">
              <label class="flex items-center gap-2 text-sm text-gray-300">
                <input v-model="editForm.consortium_required" type="checkbox" class="rounded border-deep-500" />
                Needs a consortium / delivery partner — not LANI capability alone
              </label>
            </div>
          </div>

          <div>
            <h4 class="font-medium text-white mb-1">Qualification (1–5)</h4>
            <p class="text-xs text-gray-500 mb-3">Average {{ previewPriority }} is internal sort only.</p>
            <div class="space-y-3">
              <div v-for="dim in dimensions" :key="'e-' + dim.id">
                <div class="flex items-baseline justify-between gap-2 mb-1">
                  <label class="label mb-0">{{ dim.name }}</label>
                  <span class="text-xs text-gray-500">{{ dim.question }}</span>
                </div>
                <div class="flex gap-1">
                  <button
                    v-for="n in 5"
                    :key="n"
                    type="button"
                    class="flex-1 py-1.5 rounded-lg text-sm font-medium border"
                    :class="scoreValue(editForm, dim.id) === n
                      ? 'bg-primary-500/20 text-primary-400 border-primary-500/40'
                      : 'bg-deep-700 text-gray-400 border-deep-600 hover:border-deep-500'"
                    @click="setScore(editForm, dim.id, n)"
                  >{{ n }}</button>
                </div>
              </div>
            </div>
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
