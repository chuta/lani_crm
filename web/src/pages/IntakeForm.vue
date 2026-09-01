<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { api, type Archetype } from '../lib/api'

const router = useRouter()
const loading = ref(false)
const error = ref('')
const result = ref<any>(null)

const archetypes = ref<Archetype[]>([])
const loadingArchetypes = ref(true)

api.listArchetypes().then(r => {
  archetypes.value = r.archetypes
  loadingArchetypes.value = false
}).catch(() => {
  loadingArchetypes.value = false
})

const form = ref({
  partner_name: '',
  sector: '',
  deal_stage: '',
  description: '',
  archetype: '',
  is_repeat: true,
  novelty_level: 1,
  revenue_potential: 2,
  strategic_fit: 2,
  urgency: '',
  compliance_flags: '',
  bd_owner: 'Chimezie Chuta',
})

const revenueLabels = ['Low', 'Medium', 'High']
const strategicLabels = ['Tactical', 'Important', 'Core Priority']
const noveltyLabels = ['Matches existing archetype', 'Moderate adaptation', 'Genuinely new design']

const selectedArchetypeData = computed(() =>
  archetypes.value.find(a => a.id === form.value.archetype)
)

const effortTier = computed(() => {
  if (!form.value.archetype) return '—'
  const a = archetypes.value.find(a => a.id === form.value.archetype)
  if (!a) return '—'
  const tier = a.effort_tier
  if (tier <= 0.5) return 'None (0.5)'
  if (tier <= 1) return 'Low (1)'
  if (tier <= 1.5) return 'Low-Medium (1.5)'
  if (tier <= 2) return 'Medium (2)'
  if (tier <= 2.5) return 'Medium-High (2.5)'
  return 'High (3)'
})

const noveltyPenalty = computed(() => {
  const n = form.value.novelty_level
  if (n === 1) return 1
  if (n === 2) return 2
  return 3
})

const previewScore = computed(() => {
  if (!form.value.archetype) return null
  const a = archetypes.value.find(a => a.id === form.value.archetype)
  if (!a) return null
  const score = (form.value.revenue_potential * form.value.strategic_fit) / (a.effort_tier * noveltyPenalty.value)
  return Math.round(score * 100) / 100
})

async function submitForm() {
  error.value = ''
  result.value = null
  loading.value = true

  try {
    const res = await api.submitIntake({
      partner_name: form.value.partner_name,
      sector: form.value.sector || undefined,
      deal_stage: form.value.deal_stage || undefined,
      description: form.value.description || undefined,
      archetype: form.value.archetype,
      is_repeat: form.value.is_repeat,
      novelty_level: form.value.novelty_level,
      revenue_potential: form.value.revenue_potential,
      strategic_fit: form.value.strategic_fit,
      urgency: form.value.urgency || undefined,
      compliance_flags: form.value.compliance_flags || undefined,
      bd_owner: form.value.bd_owner || undefined,
    })
    result.value = res
  } catch (e: any) {
    error.value = e.message || 'Submission failed'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div>
    <div class="mb-8">
      <h2 class="text-2xl font-display font-bold text-white">📝 Partnership Intake Form</h2>
      <p class="text-gray-400 mt-1">Section 4.1 — Self-classify your deal against the 7 integration archetypes</p>
    </div>

    <div v-if="result" class="card border-accent-success/30 mb-8">
      <div class="flex items-center gap-2 text-accent-success mb-4">
        <span class="text-xl">✅</span>
        <h3 class="font-display font-semibold">Deal Submitted Successfully</h3>
      </div>
      <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
        <div>
          <div class="label">Priority Score</div>
          <div class="text-3xl font-bold text-primary-400">{{ result.priority_breakdown.priority_score }}</div>
        </div>
        <div>
          <div class="label">Queue Position</div>
          <div class="text-3xl font-bold text-accent-gold">#{{ result.deal.queue_position }}</div>
        </div>
        <div>
          <div class="label">Archetype</div>
          <div class="text-lg font-semibold">{{ result.deal.archetype }}</div>
        </div>
        <div>
          <div class="label">Current Stage</div>
          <div class="badge-stage text-sm">Stage 2 — Intake & Classification</div>
        </div>
      </div>
      <div class="flex gap-3">
        <router-link :to="`/deals/${result.deal.id}`" class="btn-primary text-sm">View Deal</router-link>
        <router-link to="/pipeline" class="btn-secondary text-sm">Go to Pipeline</router-link>
        <button @click="result = null; form.value.partner_name = ''; form.value.description = ''" class="btn-secondary text-sm">Submit Another</button>
      </div>
    </div>

    <div v-if="error" class="card border-accent-danger/30 mb-6">
      <p class="text-accent-danger">{{ error }}</p>
    </div>

    <form v-if="!result" @submit.prevent="submitForm" class="space-y-8">
      <!-- Basic Identification -->
      <div class="card">
        <h3 class="font-display font-semibold text-white mb-4">Basic Identification</h3>
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label class="label">Partner Name *</label>
            <input v-model="form.partner_name" class="input-field" placeholder="e.g. UBA Asset Management" required />
          </div>
          <div>
            <label class="label">Sector</label>
            <input v-model="form.sector" class="input-field" placeholder="e.g. Asset Management" />
          </div>
          <div>
            <label class="label">Deal Stage</label>
            <input v-model="form.deal_stage" class="input-field" placeholder="e.g. Negotiation" />
          </div>
        </div>
      </div>

      <!-- Archetype Classification -->
      <div class="card">
        <h3 class="font-display font-semibold text-white mb-4">Archetype Self-Classification</h3>
        <p class="text-sm text-gray-400 mb-4">Select the archetype that best matches your partnership. Use the one-line test as a diagnostic question.</p>

        <div v-if="loadingArchetypes" class="text-gray-500 text-sm">Loading archetypes…</div>

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
                <span class="badge-archetype">Archetype {{ a.id }}</span>
                <span class="font-medium text-white text-sm">{{ a.name }}</span>
              </div>
              <p class="text-xs text-gray-400 mt-1.5">{{ a.one_line_test }}</p>
              <p class="text-xs text-gray-500 mt-1">Effort: {{ a.effort_tier === 0.5 ? 'None' : a.effort_tier === 1 ? 'Low' : a.effort_tier === 1.5 ? 'Low-Medium' : a.effort_tier === 2 ? 'Medium' : a.effort_tier === 2.5 ? 'Medium-High' : 'High' }}</p>
            </div>
          </label>
        </div>
      </div>

      <!-- Template Usage -->
      <div class="card">
        <h3 class="font-display font-semibold text-white mb-4">Template & Novelty</h3>
        <div class="space-y-4">
          <div>
            <label class="label">Is this a repeat of an existing archetype/template?</label>
            <div class="flex gap-4 mt-1">
              <label class="flex items-center gap-2 cursor-pointer">
                <input type="radio" :value="true" v-model="form.is_repeat" class="text-primary-500" />
                <span class="text-sm">Yes — matches existing template</span>
              </label>
              <label class="flex items-center gap-2 cursor-pointer">
                <input type="radio" :value="false" v-model="form.is_repeat" class="text-primary-500" />
                <span class="text-sm">No — genuinely new requirement</span>
              </label>
            </div>
          </div>
          <div>
            <label class="label">Novelty Level</label>
            <select v-model="form.novelty_level" class="select-field">
              <option :value="1">1 — Matches existing archetype (fast-track)</option>
              <option :value="2">2 — Moderate adaptation needed</option>
              <option :value="3">3 — Genuinely new design required</option>
            </select>
          </div>
        </div>
      </div>

      <!-- Scoring -->
      <div class="card">
        <h3 class="font-display font-semibold text-white mb-4">Priority Scoring</h3>
        <p class="text-sm text-gray-400 mb-4">Priority = (Revenue × Strategic Fit) ÷ (Effort Tier × Novelty Penalty)</p>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label class="label">Revenue Potential</label>
            <div class="flex gap-2">
              <button
                v-for="(label, i) in revenueLabels"
                :key="i"
                type="button"
                @click="form.revenue_potential = i + 1"
                class="flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all"
                :class="form.revenue_potential === i + 1
                  ? 'bg-accent-gold/20 text-accent-gold border border-accent-gold/40'
                  : 'bg-deep-700 text-gray-400 border border-deep-600 hover:border-deep-500'"
              >
                {{ i + 1 }} — {{ label }}
              </button>
            </div>
          </div>
          <div>
            <label class="label">Strategic Fit</label>
            <div class="flex gap-2">
              <button
                v-for="(label, i) in strategicLabels"
                :key="i"
                type="button"
                @click="form.strategic_fit = i + 1"
                class="flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all"
                :class="form.strategic_fit === i + 1
                  ? 'bg-primary-500/20 text-primary-400 border border-primary-500/40'
                  : 'bg-deep-700 text-gray-400 border border-deep-600 hover:border-deep-500'"
              >
                {{ i + 1 }} — {{ label }}
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Context -->
      <div class="card">
        <h3 class="font-display font-semibold text-white mb-4">Additional Context</h3>
        <div class="space-y-4">
          <div>
            <label class="label">Partnership Description</label>
            <textarea v-model="form.description" class="input-field min-h-[80px]" placeholder="Describe the partnership in your own words..." />
          </div>
          <div>
            <label class="label">Urgency / Requested Timeline</label>
            <input v-model="form.urgency" class="input-field" placeholder="e.g. Q3 2026 target" />
          </div>
          <div>
            <label class="label">Compliance / Regulatory Flags</label>
            <textarea v-model="form.compliance_flags" class="input-field min-h-[60px]" placeholder="e.g. BSILC review required, KYC data sharing, cross-border payments" />
          </div>
          <div>
            <label class="label">BD Owner</label>
            <input v-model="form.bd_owner" class="input-field" placeholder="Your name" />
          </div>
        </div>
      </div>

      <!-- Score Preview + Submit -->
      <div class="card border-primary-500/30">
        <div class="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <div class="text-sm text-gray-400 mb-1">Priority Score Preview</div>
            <div v-if="previewScore !== null" class="flex items-center gap-3">
              <span class="text-3xl font-bold font-display" :class="previewScore >= 3 ? 'text-accent-success' : previewScore >= 1.5 ? 'text-accent-gold' : 'text-gray-400'">
                {{ previewScore }}
              </span>
              <span class="text-xs text-gray-500">{{ form.archetype ? `Archetype ${form.archetype} — ${effortTier} effort · ${noveltyPenalty}x novelty penalty` : 'Select an archetype first' }}</span>
            </div>
            <div v-else class="text-gray-500">Select an archetype to see preview</div>
          </div>
          <button type="submit" class="btn-primary text-lg px-8 py-3" :disabled="loading || !form.partner_name || !form.archetype">
            {{ loading ? 'Submitting…' : '🚀 Submit Intake' }}
          </button>
        </div>
      </div>
    </form>
  </div>
</template>