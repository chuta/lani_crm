<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import {
  api,
  CONVERSION_GAP_LABELS,
  type Account,
  type CommercialModel,
  type PartnershipRole,
} from '../lib/api'

const router = useRouter()
const accounts = ref<Account[]>([])
const roles = ref<PartnershipRole[]>([])
const models = ref<CommercialModel[]>([])
const roleCounts = ref<Record<string, number>>({})
const missingDiscipline = ref(0)
const loading = ref(true)
const loadError = ref('')
const filterRole = ref('')

const partnerRoles = computed(() =>
  roles.value.filter((r) => r.id !== 'end_client')
)

const groups = computed(() => {
  const active = filterRole.value
    ? partnerRoles.value.filter((r) => r.id === filterRole.value)
    : partnerRoles.value
  return active.map((role) => ({
    role,
    accounts: accounts.value.filter((a) => a.partnership_role === role.id),
  }))
})

onMounted(async () => {
  loading.value = true
  loadError.value = ''
  try {
    const [catalog, res] = await Promise.all([
      api.listArchetypes(),
      api.listAccounts({ partners_only: 'true' }),
    ])
    roles.value = catalog.partnership_roles
    models.value = catalog.commercial_models || []
    accounts.value = res.accounts
    roleCounts.value = res.role_counts || {}
    missingDiscipline.value = res.missing_discipline || 0
  } catch (e: any) {
    loadError.value = e.message || 'Could not load ecosystem'
  } finally {
    loading.value = false
  }
})

function roleLabel(id?: string | null) {
  return roles.value.find((r) => r.id === id)?.name || id || '—'
}
function modelLabel(id?: string | null) {
  return models.value.find((m) => m.id === id)?.name || id || 'Direct engagement'
}
function gapLabel(id: string) {
  return CONVERSION_GAP_LABELS[id] || id
}
function setRoleFilter(id: string) {
  filterRole.value = filterRole.value === id ? '' : id
}
function openAccount(id: string) {
  router.push({ path: '/accounts', query: { open: id } })
}
</script>

<template>
  <div>
    <div class="mb-6">
      <h2 class="text-2xl font-display font-bold text-white">Partnership Ecosystem</h2>
      <p class="text-gray-400 mt-1">
        Channel, delivery, institutional and innovation partners — each with a commercial model.
        Not every organisation is an end client.
      </p>
    </div>

    <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
      <button
        v-for="role in partnerRoles"
        :key="role.id"
        type="button"
        class="card text-left transition-all"
        :class="filterRole === role.id ? 'border-primary-500/50 bg-primary-500/10' : 'hover:border-deep-500'"
        @click="setRoleFilter(role.id)"
      >
        <div class="flex items-start justify-between gap-2">
          <div>
            <div class="text-xs text-gray-500">Partnership role</div>
            <div class="font-display font-semibold text-white mt-0.5">{{ role.name }}</div>
          </div>
          <div class="text-2xl font-bold text-primary-400">{{ roleCounts[role.id] || 0 }}</div>
        </div>
        <p class="text-xs text-gray-500 mt-2">{{ role.model }}</p>
      </button>
    </div>

    <div v-if="missingDiscipline > 0" class="card border-accent-gold/30 mb-6 text-sm text-accent-gold">
      {{ missingDiscipline }} partner {{ missingDiscipline === 1 ? 'record' : 'records' }} missing a next action, decision date, or named delivery partner.
    </div>

    <div v-if="loadError" class="card border-accent-danger/30 text-accent-danger mb-6">{{ loadError }}</div>
    <div v-if="loading" class="py-12 text-center text-gray-500">Loading ecosystem…</div>

    <div v-else-if="accounts.length === 0" class="py-12 text-center text-gray-500">
      No partners yet.
      <router-link to="/accounts" class="text-primary-400 underline">Add an organisation</router-link>
      and set its partnership role to channel, delivery, institutional, or ecosystem.
    </div>

    <div v-else class="space-y-8">
      <section v-for="group in groups" :key="group.role.id">
        <h3 class="font-display font-semibold text-white mb-3">
          {{ group.role.name }}
          <span class="text-sm font-normal text-gray-500 ml-2">{{ group.accounts.length }}</span>
        </h3>
        <p class="text-xs text-gray-500 mb-3">{{ group.role.model }}</p>
        <div v-if="group.accounts.length === 0" class="text-sm text-gray-500">None in this role.</div>
        <div v-else class="card p-0 overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="border-b border-deep-600 text-left">
                <th class="py-3 px-4 text-gray-400 font-medium">Organisation</th>
                <th class="py-3 px-4 text-gray-400 font-medium">Commercial model</th>
                <th class="py-3 px-4 text-gray-400 font-medium">Named partner</th>
                <th class="py-3 px-4 text-gray-400 font-medium">Next action</th>
                <th class="py-3 px-4 text-gray-400 font-medium text-right">Opportunities</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="account in group.accounts"
                :key="account.id"
                class="border-b border-deep-700 hover:bg-deep-700/50 cursor-pointer"
                @click="openAccount(account.id)"
              >
                <td class="py-3 px-4">
                  <div class="font-medium text-white">{{ account.organisation }}</div>
                  <div class="text-xs text-gray-500 mt-0.5">{{ account.archetype }} · {{ roleLabel(account.partnership_role) }}</div>
                  <div v-if="account.conversion_gaps?.length" class="flex flex-wrap gap-1 mt-1">
                    <span
                      v-for="gap in account.conversion_gaps"
                      :key="gap"
                      class="text-[11px] px-1.5 py-0.5 rounded bg-accent-gold/15 text-accent-gold"
                    >{{ gapLabel(gap) }}</span>
                  </div>
                </td>
                <td class="py-3 px-4 text-gray-300">{{ modelLabel(account.commercial_model) }}</td>
                <td class="py-3 px-4 text-gray-300">{{ account.delivery_partner_name || '—' }}</td>
                <td class="py-3 px-4 text-xs text-gray-300 max-w-[200px]">{{ account.next_action || '—' }}</td>
                <td class="py-3 px-4 text-right font-semibold text-primary-400">{{ account.opportunity_count || 0 }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>
  </div>
</template>
