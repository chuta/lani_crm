<script setup lang="ts">
import { ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'

const router = useRouter()
const route = useRoute()
const mobileMenuOpen = ref(false)

const navItems = [
  { path: '/pipeline', label: 'Pipeline', icon: '📋' },
  { path: '/intake', label: 'Intake', icon: '📝' },
  { path: '/prospecting', label: 'Prospecting', icon: '🔍' },
  { path: '/proposals', label: 'Proposals', icon: '📄' },
  { path: '/executive', label: 'Executive', icon: '👁️' },
  { path: '/archetypes', label: 'Archetypes', icon: '📚' },
  { path: '/claims-library', label: 'Claims', icon: '📜' },
]

const guideUrl = '/partnerships/PARTNERSHIP-OS-USER-GUIDE-v1.0.docx'

const loggingOut = ref(false)

async function logout() {
  loggingOut.value = true
  try {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' })
  } catch {
    // proceed even if the server call fails — clear locally
  }
  window.location.href = '/auth/login?return=/partnerships/'
}
</script>

<template>
  <div class="min-h-screen bg-deep-900">
    <!-- Header -->
    <header class="bg-deep-800 border-b border-deep-600 sticky top-0 z-50">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div class="flex items-center justify-between h-16">
          <div class="flex items-center gap-3">
            <svg class="w-8 h-8 text-white" viewBox="0 0 100 100" fill="none">
              <!-- Upper left wing -->
              <path d="M50 38 C44 20, 30 8, 10 18 C-2 26, 8 44, 30 46 C36 46.5, 44 45, 50 42" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>
              <!-- Upper right wing -->
              <path d="M50 38 C56 20, 70 8, 90 18 C102 26, 92 44, 70 46 C64 46.5, 56 45, 50 42" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>
              <!-- Lower left wing -->
              <path d="M50 42 C44 46, 32 50, 18 58 C6 66, 10 80, 22 84 C34 88, 44 74, 48 62" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>
              <!-- Lower right wing -->
              <path d="M50 42 C56 46, 68 50, 82 58 C94 66, 90 80, 78 84 C66 88, 56 74, 52 62" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>
              <!-- Body -->
              <line x1="50" y1="38" x2="50" y2="60" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>
              <!-- Antennae -->
              <path d="M50 38 C48 30, 42 22, 38 16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
              <path d="M50 38 C52 30, 58 22, 62 16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
              <!-- Antenna tips -->
              <circle cx="38" cy="16" r="2.5" fill="currentColor"/>
              <circle cx="62" cy="16" r="2.5" fill="currentColor"/>
            </svg>
            <div>
              <h1 class="text-lg font-display font-semibold text-white leading-tight">Partnership Pipeline</h1>
              <p class="text-xs text-gray-500">BD-to-Technology Operating Model</p>
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
            <a
              :href="guideUrl"
              download
              class="px-3 py-2 rounded-lg text-sm font-medium transition-colors text-accent-gold hover:text-accent-gold hover:bg-accent-gold/10 flex items-center gap-1.5"
            >
              📖 User Guide
            </a>
            <span class="w-px h-6 bg-deep-600 mx-1"></span>
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
        <a
          :href="guideUrl"
          download
          @click="mobileMenuOpen = false"
          class="block px-3 py-2 rounded-lg text-sm font-medium transition-colors text-accent-gold hover:text-accent-gold hoverable hover:bg-accent-gold/10"
        >
          📖 User Guide
        </a>
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

    <!-- Main -->
    <main class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <router-view />
    </main>
  </div>
</template>