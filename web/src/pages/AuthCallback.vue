<script setup lang="ts">
import { onMounted } from 'vue'
import { useRouter } from 'vue-router'
import AuthShell from '../components/AuthShell.vue'
import { supabase } from '../lib/supabase'
import { refreshProfile, useAuth } from '../lib/auth'

const router = useRouter()
const auth = useAuth()

onMounted(async () => {
  if (supabase) {
    const { data } = await supabase.auth.getSession()
    if (data.session) {
      try {
        await refreshProfile()
      } catch {
        // stay on callback and fall through
      }
    }
  }

  if (auth.isRootAdmin.value || auth.isAppUser.value) {
    router.replace('/accounts')
    return
  }
  if (auth.isPending.value) {
    router.replace('/pending')
    return
  }
  router.replace('/login')
})
</script>

<template>
  <AuthShell>
    <div class="flex flex-col items-center text-center gap-3 py-2">
      <div class="w-10 h-10 rounded-full border-2 border-lani-green/30 border-t-lani-green animate-spin" />
      <p class="text-sm text-stone-500">Signing you in…</p>
    </div>
  </AuthShell>
</template>
