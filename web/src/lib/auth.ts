import { computed, reactive } from 'vue'
import { supabase } from './supabase'
import { apiFetch } from './http'

export type AppRole = 'pending' | 'bd_user' | 'root_admin'

export interface AuthProfile {
  id: string
  email: string
  role: AppRole
  full_name: string | null
}

const state = reactive({
  loading: true,
  session: null as { access_token: string } | null,
  profile: null as AuthProfile | null,
})

async function loadProfile() {
  if (!state.session) {
    state.profile = null
    return
  }
  const res = await apiFetch('/api/partnerships/me')
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    state.profile = null
    const err = new Error(body.message || body.error || 'Could not load profile') as Error & { status?: number }
    err.status = res.status
    throw err
  }
  state.profile = body.user as AuthProfile
}

async function restoreSession() {
  if (!supabase) return
  const { data } = await supabase.auth.getSession()
  let session = data.session
  if (session) {
    const refreshed = await supabase.auth.refreshSession()
    if (refreshed.data.session) session = refreshed.data.session
    else {
      await supabase.auth.signOut()
      session = null
    }
  }
  state.session = session ? { access_token: session.access_token } : null
  if (!state.session) {
    state.profile = null
    return
  }
  try {
    await loadProfile()
  } catch (e: any) {
    if (e?.status === 401) {
      await supabase.auth.signOut()
      state.session = null
      state.profile = null
      return
    }
    state.profile = null
  }
}

export async function initAuth() {
  if (!supabase) {
    state.loading = false
    return
  }

  await restoreSession()

  supabase.auth.onAuthStateChange(async (_event, session) => {
    state.session = session ? { access_token: session.access_token } : null
    if (session) {
      try {
        await loadProfile()
      } catch (e: any) {
        if (e?.status === 401) {
          await supabase.auth.signOut()
          state.session = null
          state.profile = null
          return
        }
        state.profile = null
      }
    } else {
      state.profile = null
    }
  })

  state.loading = false
}

export async function refreshProfile() {
  await loadProfile()
}

export async function signOut() {
  if (supabase) await supabase.auth.signOut()
  state.session = null
  state.profile = null
}

export function useAuth() {
  return {
    loading: computed(() => state.loading),
    session: computed(() => state.session),
    profile: computed(() => state.profile),
    isAuthenticated: computed(() => Boolean(state.session)),
    role: computed(() => state.profile?.role ?? null),
    isPending: computed(() => state.profile?.role === 'pending'),
    isAppUser: computed(() => state.profile?.role === 'bd_user' || state.profile?.role === 'root_admin'),
    isRootAdmin: computed(() => state.profile?.role === 'root_admin'),
  }
}

export function authRedirectTo() {
  return `${window.location.origin}/partnerships/auth/callback`
}
