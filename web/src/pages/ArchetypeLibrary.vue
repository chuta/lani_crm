<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { api, type Archetype } from '../lib/api'

const archetypes = ref<Archetype[]>([])
const expanded = ref<string | null>(null)
const loading = ref(true)

onMounted(async () => {
  try {
    const res = await api.listArchetypes()
    archetypes.value = res.archetypes
  } catch (e) {
    console.error('Failed to load archetypes:', e)
  } finally {
    loading.value = false
  }
})

function effortLabel(tier: number): string {
  if (tier <= 0.5) return 'None'
  if (tier <= 1) return 'Low'
  if (tier <= 1.5) return 'Low-Medium'
  if (tier <= 2) return 'Medium'
  if (tier <= 2.5) return 'Medium-High'
  return 'High'
}

function effortColor(tier: number): string {
  if (tier <= 0.5) return 'bg-gray-500/20 text-gray-300'
  if (tier <= 1) return 'bg-accent-success/20 text-accent-success'
  if (tier <= 1.5) return 'bg-blue-500/20 text-blue-300'
  if (tier <= 2) return 'bg-accent-gold/20 text-accent-gold'
  if (tier <= 2.5) return 'bg-orange-500/20 text-orange-300'
  return 'bg-accent-danger/20 text-accent-danger'
}
</script>

<template>
  <div>
    <div class="mb-8">
      <h2 class="text-2xl font-display font-bold text-white">📚 Archetype Library</h2>
      <p class="text-gray-400 mt-1">Section 3 + 7 — Seven integration archetypes, one standard component checklist each</p>
    </div>

    <div v-if="loading" class="text-center py-12 text-gray-500">Loading archetypes…</div>

    <div v-else class="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div
        v-for="a in archetypes"
        :key="a.id"
        class="card cursor-pointer transition-all hover:border-primary-500/40"
        :class="expanded === a.id ? 'border-primary-500/50 row-span-2' : ''"
        @click="expanded = expanded === a.id ? null : a.id"
      >
        <div class="flex items-start justify-between mb-3">
          <div>
            <span class="badge-archetype">Archetype {{ a.id }}</span>
            <h3 class="font-display font-semibold text-white mt-2">{{ a.name }}</h3>
          </div>
          <span class="badge" :class="effortColor(a.effort_tier)">{{ effortLabel(a.effort_tier) }} effort</span>
        </div>

        <p class="text-sm text-gray-400 mb-3">{{ a.one_line_test }}</p>

        <div class="text-xs text-gray-500">
          <span class="font-medium text-gray-400">Precedent:</span> {{ a.precedent_name }}
        </div>

        <!-- Expanded content -->
        <div v-if="expanded === a.id" class="mt-4 pt-4 border-t border-deep-600 space-y-4">
          <div>
            <h4 class="text-sm font-medium text-gray-300 mb-2">Standard Components</h4>
            <ul class="space-y-1">
              <li
                v-for="(comp, i) in JSON.parse(a.standard_components)"
                :key="i"
                class="flex items-start gap-2 text-sm text-gray-400"
              >
                <span class="text-primary-400 mt-0.5 shrink-0">▸</span>
                {{ comp }}
              </li>
            </ul>
          </div>

          <div>
            <h4 class="text-sm font-medium text-gray-300 mb-2">Precedent Template</h4>
            <div class="bg-deep-900 rounded-lg p-4 overflow-auto max-h-[400px]">
              <pre class="text-xs text-gray-400 whitespace-pre-wrap font-mono">{{ a.precedent_template }}</pre>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>