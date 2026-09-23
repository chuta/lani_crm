<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import BrandMark from './components/BrandMark.vue'
import { signOut, useAuth } from './lib/auth'

const router = useRouter()
const route = useRoute()
const auth = useAuth()
const mobileMenuOpen = ref(false)
const loggingOut = ref(false)

const hideChrome = computed(() => Boolean(route.meta.public || route.meta.pending))

const allNavItems = [
  { path: '/accounts', label: 'Account Map', icon: '🗺️' },
  { path: '/ecosystem', label: 'Ecosystem', icon: '🤝' },
  { path: '/pipeline', label: 'Pipeline', icon: '📋' },
  { path: '/intake', label: 'Intake', icon: '📝' },
  { path: '/executive', label: 'Executive', icon: '👁️' },
  { path: '/archetypes', label: 'Library', icon: '📚' },
  { path: '/users', label: 'Users', icon: '👥', admin: true },
]

const navItems = computed(() =>
  allNavItems.filter((item) => !item.admin || auth.isRootAdmin.value),
)

const roleLabel = computed(() => {
  if (auth.isRootAdmin.value) return 'Root Admin'
  if (auth.role.value === 'bd_user') return 'BD User'
  return ''
})

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
  <div class="min-h-screen bg-deep-900">
    <header v-if="!hideChrome" class="bg-deep-800 border-b border-deep-600 sticky top-0 z-50">
      <div class="w-full px-4 sm:px-6 lg:px-8">
        <div class="flex items-center justify-between h-16">
          <div class="flex items-center gap-3">
            <BrandMark size="sm" />
            <div class="hidden sm:block pl-1 border-l border-deep-600">
              <h1 class="text-sm font-display font-semibold text-white leading-tight">B2B Partnership Engine</h1>
              <p class="text-[11px] text-gray-500">Commercial intelligence · Account map · Qualified pipeline</p>
            </div>
          </div>
          <!-- Desktop nav -->
          <nav class="hidden md:flex items-center gap-1">
            <router-link
              v-for="item in navItems"
              :key="item.path"
              :to="item.path"
              class="px-3 py-2 rounded-lg text-sm font-medium transition-colors"
              :class="route.path === item.path
                ? 'bg-primary-500/20 text-primary-400'
                : 'text-gray-400 hover:text-gray-200 hover:bg-deep-700'"
            >
              {{ item.icon }} {{ item.label }}
            </router-link>
            <span class="w-px h-6 bg-deep-600 mx-1"></span>
            <div class="px-2 text-right hidden lg:block">
              <p class="text-xs text-gray-200 leading-tight">{{ auth.profile?.email }}</p>
              <p class="text-[11px] text-gray-500">{{ roleLabel }}</p>
            </div>
            <button
              @click="logout"
              :disabled="loggingOut"
              class="px-3 py-2 rounded-lg text-sm font-medium transition-colors text-gray-400 hover:text-red-400 hover:bg-red-500/10 flex items-center gap-1.5"
            >
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
              {{ loggingOut ? 'Signing out…' : 'Sign out' }}
            </button>
          </nav>
          <!-- Mobile hamburger -->
          <button @click="mobileMenuOpen = !mobileMenuOpen" class="md:hidden p-2 text-gray-400 hover:text-white">
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path v-if="!mobileMenuOpen" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
              <path v-else stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
      <!-- Mobile menu -->
      <div v-if="mobileMenuOpen" class="md:hidden border-t border-deep-600 px-4 py-3 space-y-1">
        <router-link
          v-for="item in navItems"
          :key="item.path"
          :to="item.path"
          @click="mobileMenuOpen = false"
          class="block px-3 py-2 rounded-lg text-sm font-medium transition-colors"
          :class="route.path === item.path
            ? 'bg-primary-500/20 text-primary-400'
            : 'text-gray-400 hover:text-gray-200 hover:bg-deep-700'"
        >
          {{ item.icon }} {{ item.label }}
        </router-link>
        <p class="px-3 pt-2 text-xs text-gray-400">{{ auth.profile?.email }} · {{ roleLabel }}</p>
        <hr class="border-deep-600 my-2" />
        <button
          @click="logout"
          :disabled="loggingOut"
          class="w-full text-left block px-3 py-2 rounded-lg text-sm font-medium transition-colors text-gray-400 hover:text-red-400 hover:bg-red-500/10 flex items-center gap-1.5"
        >
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <polyline points="16 17 21 12 16 7" />
            <line x1="21" y1="12" x2="9" y2="12" />
          </svg>
          {{ loggingOut ? 'Signing out…' : 'Sign out' }}
        </button>
      </div>
    </header>

    <main :class="hideChrome ? '' : 'w-full px-4 sm:px-6 lg:px-8 py-8'">
      <router-view />
    </main>
  </div>
</template>
