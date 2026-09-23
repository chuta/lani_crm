<script setup lang="ts">
import { ref } from 'vue'
import { RouterLink } from 'vue-router'
import AuthShell from '../components/AuthShell.vue'
import { supabase, isSupabaseConfigured } from '../lib/supabase'
import { authRedirectTo } from '../lib/auth'

const email = ref('')
const sending = ref(false)
const sent = ref(false)
const error = ref('')

async function submit() {
  error.value = ''
  if (!supabase) {
    error.value = 'Supabase is not configured.'
    return
  }
  sending.value = true
  try {
    const { error: authError } = await supabase.auth.signInWithOtp({
      email: email.value.trim(),
      options: {
        shouldCreateUser: false,
        emailRedirectTo: authRedirectTo(),
      },
    })
    if (authError) {
      const msg = authError.message.toLowerCase()
      if (msg.includes('signups not allowed') || msg.includes('user not found') || msg.includes('unable to validate')) {
        error.value = 'No account found for this email. Create an account first.'
      } else {
        error.value = authError.message
      }
      return
    }
    sent.value = true
  } finally {
    sending.value = false
  }
}

function reset() {
  sent.value = false
  error.value = ''
}
</script>

<template>
  <AuthShell kicker="Commercial intelligence for the LANI BD Team">
    <div v-if="!isSupabaseConfigured" class="text-red-600 text-sm">
      Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY.
    </div>

    <form v-else-if="!sent" class="space-y-5" @submit.prevent="submit">
      <div>
        <h1 class="text-xl font-display font-semibold text-stone-900">Sign in</h1>
        <p class="text-sm text-stone-500 mt-1">We’ll email a one-time link to your work address.</p>
      </div>
      <div>
        <label class="label" for="email">Work email</label>
        <input
          id="email"
          v-model="email"
          type="email"
          required
          autocomplete="email"
          class="input-field"
          placeholder="you@lani.consulting"
        />
      </div>
      <p v-if="error" class="text-sm text-red-600">{{ error }}</p>
      <button type="submit" class="btn-lani" :disabled="sending || !email">
        {{ sending ? 'Sending link…' : 'Email me a sign-in link' }}
      </button>
    </form>

    <div v-else class="space-y-4 text-center">
      <div class="mx-auto w-12 h-12 rounded-full bg-lani-green/10 text-lani-green flex items-center justify-center">
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8">
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <path d="M3 7l9 6 9-6" />
        </svg>
      </div>
      <div>
        <h1 class="text-xl font-display font-semibold text-stone-900">Check your inbox</h1>
        <p class="text-sm text-stone-600 mt-2">
          We sent a sign-in link to
          <span class="font-medium text-stone-900">{{ email }}</span>.
        </p>
      </div>
      <p class="text-sm text-stone-500">The link expires shortly and can only be used once. You can close this tab after you open it.</p>
      <button type="button" class="text-sm text-lani-green hover:text-lani-dark font-medium" @click="reset">
        Use a different email
      </button>
    </div>

    <template #footer>
      New here?
      <RouterLink to="/signup" class="text-lani-green hover:text-lani-dark font-medium">Create an account</RouterLink>
    </template>
  </AuthShell>
</template>
