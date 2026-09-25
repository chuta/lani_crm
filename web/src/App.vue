<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { Lineicons } from '@lineiconshq/vue-lineicons'
import {
  MapPin5Outlined,
  VectorNodes6Outlined,
  Layout26Outlined,
  PlusOutlined,
  BarChart4Outlined,
  Books2Outlined,
  UserMultiple4Outlined,
  ExitOutlined,
} from '@lineiconshq/free-icons'
import BrandMark from './components/BrandMark.vue'
import { signOut, useAuth } from './lib/auth'

const router = useRouter()
const route = useRoute()
const auth = useAuth()
const mobileMenuOpen = ref(false)
const loggingOut = ref(false)

const hideChrome = computed(() => Boolean(route.meta.public || route.meta.pending))

const allNavItems = [
  { path: '/accounts', label: 'Account Map', icon: MapPin5Outlined },
  { path: '/ecosystem', label: 'Ecosystem', icon: VectorNodes6Outlined },
  { path: '/pipeline', label: 'Pipeline', icon: Layout26Outlined },
  { path: '/intake', label: 'Intake', icon: PlusOutlined },
  { path: '/executive', label: 'Executive', icon: BarChart4Outlined },
  { path: '/archetypes', label: 'Library', icon: Books2Outlined },
  { path: '/users', label: 'Users', icon: UserMultiple4Outlined, admin: true },
]

const navItems = computed(() =>
  allNavItems.filter((item) => !item.admin || auth.isRootAdmin.value),
)

const roleLabel = computed(() => {
  if (auth.isRootAdmin.value) return 'Root Admin'
  if (auth.role.value === 'bd_user') return 'BD User'
  return ''
})

const pageTitle = computed(() => {
  if (route.path.startsWith('/deals/')) return 'Pipeline'
  return navItems.value.find((item) => item.path === route.path)?.label || 'LANI'
})

function isActive(path: string) {
  if (route.path === path) return true
  if (path === '/pipeline' && route.path.startsWith('/deals/')) return true
  return false
}

async function logout() {
  loggingOut.value = true
  try {
    await signOut()
    await router.replace('/login')
  } finally {
    loggingOut.value = false
  }
}
</script>

<template>
  <div v-if="hideChrome" class="min-h-screen bg-deep-900">
    <router-view />
  </div>

  <div v-else class="min-h-screen bg-deep-900">
    <div
      v-if="mobileMenuOpen"
      class="fixed inset-0 z-40 bg-black/60 md:hidden"
      @click="mobileMenuOpen = false"
    ></div>

    <aside
      class="fixed inset-y-0 left-0 z-50 flex w-60 flex-col border-r border-deep-600 bg-deep-800 transition-transform md:translate-x-0"
      :class="mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'"
    >
      <div class="h-1 shrink-0 bg-lani-green"></div>
      <div class="px-5 py-5 border-b border-deep-600">
        <BrandMark size="sm" />
        <p class="mt-3 text-sm font-display font-semibold text-white leading-tight">B2B Partnership Engine</p>
        <p class="mt-1 text-[11px] text-gray-500">Commercial intelligence</p>
      </div>

      <nav class="flex-1 overflow-y-auto px-3 py-4 space-y-1">
        <router-link
          v-for="item in navItems"
          :key="item.path"
          :to="item.path"
          class="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors"
          :class="isActive(item.path)
            ? 'bg-lani-green text-white'
            : 'text-gray-400 hover:bg-deep-700 hover:text-gray-100'"
          @click="mobileMenuOpen = false"
        >
          <Lineicons :icon="item.icon" :size="18" stroke-width="1.8" class="shrink-0" />
          {{ item.label }}
        </router-link>
      </nav>

      <div class="border-t border-deep-600 px-3 py-3">
        <div class="px-2 pb-2">
          <p class="truncate text-xs text-gray-200">{{ auth.profile?.email }}</p>
          <p class="text-[11px] text-gray-500">{{ roleLabel }}</p>
        </div>
        <button
          type="button"
          class="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-gray-400 transition-colors hover:bg-red-500/10 hover:text-red-400"
          :disabled="loggingOut"
          @click="logout"
        >
          <Lineicons :icon="ExitOutlined" :size="18" stroke-width="1.8" />
          {{ loggingOut ? 'Signing out…' : 'Sign out' }}
        </button>
      </div>
    </aside>

    <div class="md:pl-60">
      <header class="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-deep-600 bg-deep-900/95 px-4 backdrop-blur md:hidden">
        <button type="button" class="p-2 text-gray-300" @click="mobileMenuOpen = true">
          <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <p class="text-sm font-medium text-white">{{ pageTitle }}</p>
      </header>
      <main class="w-full px-4 py-6 sm:px-6 lg:px-8">
        <router-view />
      </main>
    </div>
  </div>
</template>
