<script setup lang="ts">
import AuthShell from '../components/AuthShell.vue'
import { signOut, useAuth } from '../lib/auth'
import { useRouter } from 'vue-router'

const auth = useAuth()
const router = useRouter()

async function leave() {
  await signOut()
  router.replace('/login')
}
</script>

<template>
  <AuthShell kicker="Your email is confirmed">
    <div class="space-y-4 text-center">
      <div class="mx-auto w-12 h-12 rounded-full bg-amber-50 text-amber-700 flex items-center justify-center">
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 8v5" />
          <circle cx="12" cy="16" r="0.8" fill="currentColor" />
        </svg>
      </div>
      <div>
        <h1 class="text-xl font-display font-semibold text-stone-900">Waiting for approval</h1>
        <p class="text-sm text-stone-600 mt-2">
          <span class="font-medium text-stone-900">{{ auth.profile?.email }}</span>
          is confirmed. A Root Admin still needs to grant access to the Partnership Engine.
        </p>
      </div>
      <p class="text-sm text-stone-500">You can close this page and sign in again after you’re approved.</p>
      <button class="btn-secondary w-full !bg-stone-100 !text-stone-700 !border-stone-200 hover:!bg-stone-200" @click="leave">
        Sign out
      </button>
    </div>
  </AuthShell>
</template>
