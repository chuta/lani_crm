<script setup lang="ts">
import { ref } from 'vue'
import { RouterLink } from 'vue-router'
import AuthShell from '../components/AuthShell.vue'
import { supabase, isSupabaseConfigured } from '../lib/supabase'
import { authRedirectTo } from '../lib/auth'

const email = ref('')
const fullName = ref('')
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
        shouldCreateUser: true,
        emailRedirectTo: authRedirectTo(),
        data: { full_name: fullName.value.trim() || undefined },
      },
    })
    if (authError) {
      error.value = authError.message
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
  <AuthShell kicker="Access starts after Root Admin approval">
    <div v-if="!isSupabaseConfigured" class="text-red-600 text-sm">
      Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY.
    </div>

    <form v-else-if="!sent" class="space-y-5" @submit.prevent="submit">
      <div>
        <h1 class="text-xl font-display font-semibold text-stone-900">Create an account</h1>
        <p class="text-sm text-stone-500 mt-1">We’ll email a confirmation link. A Root Admin still has to approve access.</p>
      </div>
      <div>
        <label class="label" for="name">Full name</label>
        <input id="name" v-model="fullName" type="text" autocomplete="name" class="input-field" placeholder="Your name" />
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
        {{ sending ? 'Sending link…' : 'Create account' }}
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
        <h1 class="text-xl font-display font-semibold text-stone-900">Confirm your email</h1>
        <p class="text-sm text-stone-600 mt-2">
          Open the message we sent to
          <span class="font-medium text-stone-900">{{ email }}</span>
          to confirm this address.
        </p>
      </div>
      <p class="text-sm text-stone-500">After you confirm, a Root Admin still needs to approve your access before you can use the engine.</p>
      <button type="button" class="text-sm text-lani-green hover:text-lani-dark font-medium" @click="reset">
        Use a different email
      </button>
    </div>

    <template #footer>
      Already have an account?
      <RouterLink to="/login" class="text-lani-green hover:text-lani-dark font-medium">Sign in</RouterLink>
    </template>
  </AuthShell>
</template>
