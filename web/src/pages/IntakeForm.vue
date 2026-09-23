<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import {
  api,
  type Account,
  type Archetype,
  type CommercialLane,
  type CommercialModel,
  type CommercialTrigger,
  type Geography,
  type PartnershipRole,
  type QualificationDimension,
  type SectorOverlay,
} from '../lib/api'

const route = useRoute()
const loading = ref(false)
const error = ref('')
const result = ref<any>(null)
const loadingCatalog = ref(true)
const linkedAccount = ref<Account | null>(null)

const archetypes = ref<Archetype[]>([])
const sectors = ref<SectorOverlay[]>([])
const roles = ref<PartnershipRole[]>([])
const geographies = ref<Geography[]>([])
const lanes = ref<CommercialLane[]>([])
const dimensions = ref<QualificationDimension[]>([])
const capabilities = ref<string[]>([])
const triggers = ref<CommercialTrigger[]>([])
const models = ref<CommercialModel[]>([])
const partnerAccounts = ref<Account[]>([])

const form = ref({
  partner_name: '',
  sector: '',
  partnership_role: 'end_client',
  geography: 'NG',
  lane: 'immediate',
  description: '',
  archetype: '',
  decision_maker: '',
  trigger_event: '',
  lani_capability: '',
  potential_partners: '',
  next_action: '',
  expected_decision_date: '',
  consortium_required: false,
  commercial_model: 'direct',
  delivery_partner_account_id: '',
  urgency: '',
  bd_owner: '',
  score_strategic_fit: 3,
  score_access: 3,
  score_commercial: 3,
  score_urgency: 3,
  score_conversion: 3,
})

function scoreKey(id: string) {
  return `score_${id}`
}

onMounted(async () => {
  try {
    const res = await api.listArchetypes()
    archetypes.value = res.archetypes
    sectors.value = res.sectors
    roles.value = res.partnership_roles
    geographies.value = res.geographies
    lanes.value = res.lanes || []
    dimensions.value = res.qualification_dimensions || []
    capabilities.value = res.lani_capabilities || []
    triggers.value = res.commercial_triggers || []
    models.value = res.commercial_models || []
    const partners = await api.listAccounts()
    partnerAccounts.value = partners.accounts

    const accountId = typeof route.query.account === 'string' ? route.query.account : ''
    if (accountId) {
      const acct = await api.getAccount(accountId)
      linkedAccount.value = acct.account
      applyAccount(acct.account)
    }
  } catch (e) {
    console.error('Failed to load catalog:', e)
  } finally {
    loadingCatalog.value = false
  }
})

function applyAccount(account: Account) {
  form.value.partner_name = account.organisation
  form.value.archetype = account.archetype
  form.value.sector = account.sector || ''
  form.value.partnership_role = account.partnership_role || 'end_client'
  form.value.geography = account.geography || 'NG'
  form.value.lane = account.lane || 'immediate'
  form.value.description = account.strategic_problem || ''
  form.value.decision_maker = account.decision_maker || ''
  form.value.trigger_event = account.trigger_event || ''
  form.value.lani_capability = account.lani_capability || ''
  form.value.potential_partners = account.potential_partners || ''
  form.value.next_action = account.next_action || ''
  form.value.expected_decision_date = account.expected_decision_date || ''
  form.value.consortium_required = Boolean(account.consortium_required)
  form.value.commercial_model = account.commercial_model || defaultModelFor(account.partnership_role)
  form.value.delivery_partner_account_id = account.delivery_partner_account_id || ''
  form.value.bd_owner = account.relationship_owner || ''
  form.value.score_strategic_fit = account.score_strategic_fit ?? 3
  form.value.score_access = account.score_access ?? 3
  form.value.score_commercial = account.score_commercial ?? 3
  form.value.score_urgency = account.score_urgency ?? 3
  form.value.score_conversion = account.score_conversion ?? 3
}

const selectedArchetype = computed(() => archetypes.value.find((a) => a.id === form.value.archetype))

const previewPriority = computed(() => {
  if (!form.value.archetype) return null
  const vals = [
    form.value.score_strategic_fit,
    form.value.score_access,
    form.value.score_commercial,
    form.value.score_urgency,
    form.value.score_conversion,
  ]
  return Math.round((vals.reduce((a, b) => a + b, 0) / 5) * 100) / 100
})

function defaultModelFor(role: string) {
  return models.value.find((m) => m.default_for === role)?.id || 'direct'
}
function onRoleChange() {
  form.value.commercial_model = defaultModelFor(form.value.partnership_role)
}

async function submitForm() {
  error.value = ''
  result.value = null
  loading.value = true
  try {
    result.value = await api.submitIntake({
      partner_name: form.value.partner_name,
      organisation: form.value.partner_name,
      sector: form.value.sector || undefined,
      partnership_role: form.value.partnership_role,
      geography: form.value.geography,
      lane: form.value.lane,
      description: form.value.description || undefined,
      archetype: form.value.archetype,
      decision_maker: form.value.decision_maker || undefined,
      trigger_event: form.value.trigger_event || undefined,
      lani_capability: form.value.lani_capability || undefined,
      potential_partners: form.value.potential_partners || undefined,
      next_action: form.value.next_action || undefined,
      expected_decision_date: form.value.expected_decision_date || undefined,
      consortium_required: form.value.consortium_required,
      commercial_model: form.value.commercial_model,
      delivery_partner_account_id: form.value.delivery_partner_account_id || undefined,
      urgency: form.value.urgency || undefined,
      bd_owner: form.value.bd_owner || undefined,
      score_strategic_fit: form.value.score_strategic_fit,
      score_access: form.value.score_access,
      score_commercial: form.value.score_commercial,
      score_urgency: form.value.score_urgency,
      score_conversion: form.value.score_conversion,
    })
  } catch (e: any) {
    error.value = e.message || 'Submission failed'
  } finally {
    loading.value = false
  }
}

function resetForm() {
  result.value = null
  form.value.partner_name = ''
  form.value.description = ''
}

function scoreValue(dimId: string) {
  return Number((form.value as any)[scoreKey(dimId)]) || 3
}

function setScore(dimId: string, n: number) {
  ;(form.value as any)[scoreKey(dimId)] = n
}
</script>

<template>
  <div>
    <div class="mb-8">
      <h2 class="text-2xl font-display font-bold text-white">📝 Opportunity Intake</h2>
      <p class="text-gray-400 mt-1">Creates or updates the organisation on the Account Map, then opens a linked pipeline opportunity.</p>
    </div>

    <div v-if="linkedAccount && !result" class="card border-primary-500/30 mb-6 text-sm text-gray-300">
      Prefilling from account <span class="text-white">{{ linkedAccount.organisation }}</span>.
    </div>

    <div v-if="result" class="card border-accent-success/30 mb-8">
      <div class="flex items-center gap-2 text-accent-success mb-4">
        <span class="text-xl">✅</span>
        <h3 class="font-display font-semibold">Opportunity captured</h3>
      </div>
      <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
        <div>
          <div class="label">Internal sort</div>
          <div class="text-3xl font-bold text-primary-400">{{ result.priority_breakdown.internal_priority ?? result.priority_breakdown.priority_score }}</div>
          <div class="text-xs text-gray-500 mt-1">Average of five scores</div>
        </div>
        <div>
          <div class="label">Queue</div>
          <div class="text-3xl font-bold text-accent-gold">#{{ result.deal.queue_position }}</div>
        </div>
        <div>
          <div class="label">Archetype</div>
          <div class="text-lg font-semibold">{{ result.deal.archetype }}</div>
        </div>
        <div>
          <div class="label">Lane</div>
          <div class="text-lg font-semibold">{{ result.priority_breakdown.lane || result.account?.lane }}</div>
        </div>
      </div>
      <div class="flex flex-wrap gap-3">
        <router-link v-if="result.account?.id" :to="`/accounts?open=${result.account.id}`" class="btn-primary text-sm">Open Account Map</router-link>
        <router-link :to="`/deals/${result.deal.id}`" class="btn-secondary text-sm">View opportunity</router-link>
        <button @click="resetForm" class="btn-secondary text-sm">Submit another</button>
      </div>
    </div>

    <div v-if="error" class="card border-accent-danger/30 mb-6">
      <p class="text-accent-danger">{{ error }}</p>
    </div>

    <form v-if="!result" @submit.prevent="submitForm" class="space-y-8">
      <div class="card">
        <h3 class="font-display font-semibold text-white mb-4">Organisation</h3>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div class="md:col-span-2">
            <label class="label">Organisation name *</label>
            <input v-model="form.partner_name" class="input-field" placeholder="e.g. Federal Ministry of Agriculture" required />
          </div>
          <div>
            <label class="label">Geography *</label>
            <select v-model="form.geography" class="select-field">
              <option v-for="g in geographies" :key="g.id" :value="g.id">{{ g.name }}</option>
            </select>
            <p class="text-xs text-gray-500 mt-1">Nigeria-first. Use ECOWAS or Global only when the mandate is regional or international.</p>
          </div>
          <div>
            <label class="label">Partnership role *</label>
            <select v-model="form.partnership_role" class="select-field" @change="onRoleChange">
              <option v-for="r in roles" :key="r.id" :value="r.id">{{ r.name }}</option>
            </select>
          </div>
          <div>
            <label class="label">Commercial model</label>
            <select v-model="form.commercial_model" class="select-field">
              <option v-for="m in models" :key="m.id" :value="m.id">{{ m.name }}</option>
            </select>
            <p class="text-xs text-gray-500 mt-1">{{ models.find((m) => m.id === form.commercial_model)?.hint }}</p>
          </div>
          <div>
            <label class="label">Sector overlay</label>
            <select v-model="form.sector" class="select-field">
              <option value="">Not specified yet</option>
              <option v-for="s in sectors" :key="s.id" :value="s.id">{{ s.name }}</option>
            </select>
          </div>
          <div>
            <label class="label">Commercial lane *</label>
            <select v-model="form.lane" class="select-field">
              <option v-for="l in lanes" :key="l.id" :value="l.id">{{ l.short }} — {{ l.name }}</option>
            </select>
          </div>
        </div>
      </div>

      <div class="card">
        <h3 class="font-display font-semibold text-white mb-4">Client archetype *</h3>
        <p class="text-sm text-gray-400 mb-4">Use the diagnostic question. This is who the organisation is, not a technical integration type.</p>
        <div v-if="loadingCatalog" class="text-gray-500 text-sm">Loading archetypes…</div>
        <div v-else class="grid grid-cols-1 md:grid-cols-2 gap-3">
          <label
            v-for="a in archetypes"
            :key="a.id"
            class="relative flex items-start p-4 rounded-xl border cursor-pointer transition-all"
            :class="form.archetype === a.id
              ? 'border-primary-500 bg-primary-500/10'
              : 'border-deep-600 bg-deep-700 hover:border-deep-500'"
          >
            <input type="radio" :value="a.id" v-model="form.archetype" class="sr-only" />
            <div class="flex-1">
              <div class="flex items-center gap-2">
                <span class="badge-archetype">{{ a.id }}</span>
                <span class="font-medium text-white text-sm">{{ a.name }}</span>
              </div>
              <p class="text-xs text-gray-400 mt-1.5">{{ a.one_line_test }}</p>
            </div>
          </label>
        </div>
        <p v-if="selectedArchetype" class="text-xs text-gray-500 mt-3">Commercial trigger: {{ selectedArchetype.commercial_trigger }}</p>
      </div>

      <div class="card">
        <h3 class="font-display font-semibold text-white mb-2">Qualification (1–5)</h3>
        <p class="text-sm text-gray-400 mb-4">Score each dimension. The average is used only to sort the Account Map and is labelled internal.</p>
        <div class="space-y-4">
          <div v-for="dim in dimensions" :key="dim.id">
            <div class="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-1 mb-1.5">
              <label class="label mb-0">{{ dim.name }}</label>
              <span class="text-xs text-gray-500">{{ dim.question }}</span>
            </div>
            <div class="flex gap-2">
              <button
                v-for="n in 5"
                :key="n"
                type="button"
                class="flex-1 py-2 rounded-lg text-sm font-medium border transition-all"
                :class="scoreValue(dim.id) === n
                  ? 'bg-primary-500/20 text-primary-400 border-primary-500/40'
                  : 'bg-deep-700 text-gray-400 border-deep-600 hover:border-deep-500'"
                @click="setScore(dim.id, n)"
              >{{ n }}</button>
            </div>
          </div>
        </div>
      </div>

      <div class="card">
        <h3 class="font-display font-semibold text-white mb-4">Context</h3>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div class="md:col-span-2">
            <label class="label">Strategic problem / what is changing</label>
            <textarea v-model="form.description" class="input-field min-h-[80px]" placeholder="What trigger or mandate creates a need for LANI?" />
          </div>
          <div>
            <label class="label">Decision-maker</label>
            <input v-model="form.decision_maker" class="input-field" placeholder="Name and title" />
          </div>
          <div>
            <label class="label">Trigger event</label>
            <select v-model="form.trigger_event" class="select-field">
              <option value="">Not specified</option>
              <option v-for="t in triggers" :key="t.id" :value="t.trigger">{{ t.trigger }}</option>
            </select>
          </div>
          <div>
            <label class="label">LANI capability</label>
            <select v-model="form.lani_capability" class="select-field">
              <option value="">Not specified</option>
              <option v-for="c in capabilities" :key="c" :value="c">{{ c }}</option>
            </select>
          </div>
          <div>
            <label class="label">Potential partners (notes)</label>
            <input v-model="form.potential_partners" class="input-field" placeholder="Consortium or channel names" />
          </div>
          <div>
            <label class="label">Named delivery partner</label>
            <select v-model="form.delivery_partner_account_id" class="select-field">
              <option value="">Optional until Proposal — required if consortium</option>
              <option v-for="p in partnerAccounts" :key="p.id" :value="p.id">{{ p.organisation }}</option>
            </select>
          </div>
          <div>
            <label class="label">Urgency / requested timeline</label>
            <input v-model="form.urgency" class="input-field" placeholder="e.g. RFP in Q4, programme start January" />
          </div>
          <div>
            <label class="label">Next action *</label>
            <input v-model="form.next_action" class="input-field" required placeholder="What happens next, and by when" />
          </div>
          <div>
            <label class="label">Expected decision date</label>
            <input v-model="form.expected_decision_date" type="date" class="input-field" />
          </div>
          <div>
            <label class="label">Relationship owner</label>
            <input v-model="form.bd_owner" class="input-field" placeholder="Your name" />
          </div>
          <div class="md:col-span-2">
            <label class="flex items-center gap-2 text-sm text-gray-300">
              <input v-model="form.consortium_required" type="checkbox" class="rounded border-deep-500" />
              Needs a consortium / delivery partner — not LANI capability alone
            </label>
          </div>
        </div>
      </div>

      <div class="card border-primary-500/30">
        <div class="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <div class="text-sm text-gray-400 mb-1">Internal sort preview</div>
            <div v-if="previewPriority !== null" class="flex items-center gap-3">
              <span class="text-3xl font-bold font-display" :class="previewPriority >= 4 ? 'text-accent-success' : previewPriority >= 3 ? 'text-accent-gold' : 'text-gray-400'">
                {{ previewPriority }}
              </span>
              <span class="text-xs text-gray-500">Average of five scores · {{ form.archetype ? `Archetype ${form.archetype} · ${form.geography}` : 'Select an archetype first' }}</span>
            </div>
            <div v-else class="text-gray-500">Select an archetype to continue</div>
          </div>
          <button type="submit" class="btn-primary text-lg px-8 py-3" :disabled="loading || !form.partner_name || !form.archetype || !form.next_action.trim()">
            {{ loading ? 'Submitting…' : 'Submit intake' }}
          </button>
        </div>
      </div>
    </form>
  </div>
</template>
