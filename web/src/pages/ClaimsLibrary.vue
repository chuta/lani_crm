<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { cpoApi } from '../lib/cpo-api'

const claims = ref<any[]>([])
const loading = ref(true)
const error = ref('')
const statusFilter = ref('')
const searchQuery = ref('')
const seedResult = ref('')

const filtered = computed(() => {
  return claims.value.filter(c => {
    if (statusFilter.value && c.status !== statusFilter.value) return false
    if (searchQuery.value) {
      const q = searchQuery.value.toLowerCase()
      return c.claim.toLowerCase().includes(q) || c.category.toLowerCase().includes(q) || c.id.toLowerCase().includes(q)
    }
    return true
  })
})

async function load() {
  loading.value = true
  error.value = ''
  try {
    const res = await cpoApi.listClaims()
    claims.value = res.claims
  } catch (e: any) {
    error.value = e.message
  } finally {
    loading.value = false
  }
}

async function seed() {
  try {
    const res = await cpoApi.seedClaims()
    seedResult.value = `Seeded ${res.inserted} new claims (${res.total} total)`
    await load()
    setTimeout(() => seedResult.value = '', 4000)
  } catch (e: any) {
    seedResult.value = `Error: ${e.message}`
  }
}

async function toggleStatus(claim: any) {
  const next = claim.status === 'Pending' ? 'Approved' : claim.status === 'Approved' ? 'Deprecated' : 'Pending'
  try {
    await cpoApi.updateClaim(claim.id, { status: next })
    claim.status = next
  } catch (e: any) {
    error.value = e.message
  }
}

function statusColor(s: string) {
  return s === 'Approved' ? 'text-accent-success' : s === 'Pending' ? 'text-yellow-400' : 'text-red-400'
}
function statusBg(s: string) {
  return s === 'Approved' ? 'bg-accent-success/20 border-accent-success/30' : s === 'Pending' ? 'bg-yellow-900/20 border-yellow-800/30' : 'bg-red-900/20 border-red-800/30'
}

onMounted(load)
</script>

<template>
  <div>
    <div class="flex flex-wrap items-center justify-between mb-6">
      <div>
        <h2 class="text-2xl font-display font-bold text-white">📜 Claims Library</h2>
        <p class="text-gray-400 mt-1">GW-00 — Approved Claims & Evidence Register v1.1</p>
      </div>
      <div class="flex gap-2">
        <button @click="seed" class="px-3 py-2 text-sm bg-deep-700 text-gray-300 rounded-lg hover:bg-deep-600 transition-colors">🌱 Seed Defaults</button>
        <button @click="load" class="px-3 py-2 text-sm bg-deep-700 text-gray-300 rounded-lg hover:bg-deep-600 transition-colors">🔄 Refresh</button>
      </div>
    </div>

    <div v-if="seedResult" class="mb-4 p-3 bg-primary-900/20 border border-primary-800/30 rounded-lg text-primary-300 text-sm">{{ seedResult }}</div>
    <div v-if="error" class="mb-4 p-3 bg-red-900/20 border border-red-800/30 rounded-lg text-red-400 text-sm">{{ error }}</div>

    <div v-if="loading" class="text-center py-12 text-gray-500">Loading claims library…</div>

    <div v-else>
      <!-- Filters -->
      <div class="flex gap-3 mb-4">
        <input v-model="searchQuery" placeholder="Search claims…" class="px-3 py-1.5 text-sm bg-deep-700 text-gray-200 rounded-lg border border-deep-600 focus:border-primary-500 outline-none flex-1 max-w-xs" />
        <select v-model="statusFilter" class="px-3 py-1.5 text-sm bg-deep-700 text-gray-200 rounded-lg border border-deep-600 focus:border-primary-500 outline-none">
          <option value="">All statuses</option>
          <option value="Approved">🟢 Approved</option>
          <option value="Pending">🟡 Pending</option>
          <option value="Deprecated">🔴 Deprecated</option>
        </select>
        <span class="text-sm text-gray-500 self-center">{{ filtered.length }} / {{ claims.length }} claims</span>
      </div>

      <!-- Claims List -->
      <div class="space-y-2">
        <div v-for="claim in filtered" :key="claim.id"
          class="card flex items-start gap-4 p-4 cursor-pointer hover:border-primary-500/30 transition-colors"
          @click="toggleStatus(claim)"
        >
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2 mb-1">
              <span class="text-xs font-mono text-gray-500">{{ claim.id }}</span>
              <span class="text-xs px-2 py-0.5 rounded-full bg-deep-700 text-gray-400">{{ claim.category }}</span>
              <span class="text-xs text-gray-500">v{{ claim.version }}</span>
              <span class="text-xs text-gray-500">{{ claim.jurisdiction }}</span>
            </div>
            <p class="text-sm text-white/90 leading-relaxed">{{ claim.claim }}</p>
            <div class="flex gap-4 mt-2 text-xs text-gray-500">
              <span v-if="claim.owner">Owner: {{ claim.owner }}</span>
              <span v-if="claim.effective_date">Effective: {{ claim.effective_date }}</span>
              <span v-if="claim.review_date">Review: {{ claim.review_date }}</span>
            </div>
          </div>
          <div class="shrink-0 flex flex-col items-center gap-1">
            <span class="text-xs px-2 py-0.5 rounded-full" :class="statusBg(claim.status)">
              <span :class="statusColor(claim.status)">{{ claim.status }}</span>
            </span>
            <span class="text-xs text-gray-600 mt-1">click to cycle</span>
          </div>
        </div>
        <div v-if="filtered.length === 0" class="text-center py-8 text-gray-500 text-sm">
          No claims match your filter.
        </div>
      </div>
    </div>
  </div>
</template>