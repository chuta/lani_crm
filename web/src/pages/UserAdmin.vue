<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { apiFetch } from '../lib/http'
import type { AppRole } from '../lib/auth'
import { useAuth } from '../lib/auth'

type UserRow = {
  id: string
  email: string
  full_name: string | null
  role: AppRole
  created_at: string
}

const auth = useAuth()
const users = ref<UserRow[]>([])
const loading = ref(true)
const error = ref('')
const savingId = ref('')

async function load() {
  loading.value = true
  error.value = ''
  try {
    const res = await apiFetch('/api/partnerships/users')
    const body = await res.json()
    if (!res.ok) throw new Error(body.message || body.error || 'Failed to load users')
    users.value = body.users
  } catch (e: any) {
    error.value = e.message
  } finally {
    loading.value = false
  }
}

async function setRole(user: UserRow, role: AppRole) {
  savingId.value = user.id
  error.value = ''
  try {
    const res = await apiFetch(`/api/partnerships/users/${user.id}/role`, {
      method: 'PATCH',
      body: JSON.stringify({ role }),
    })
    const body = await res.json()
    if (!res.ok) throw new Error(body.message || body.error || 'Failed to update role')
    user.role = body.user.role
  } catch (e: any) {
    error.value = e.message
  } finally {
    savingId.value = ''
  }
}

function roleLabel(role: AppRole) {
  return role === 'root_admin' ? 'Root Admin' : role === 'bd_user' ? 'BD User' : 'Pending'
}

onMounted(load)
</script>

<template>
  <div>
    <div class="flex items-center justify-between mb-6">
      <div>
        <h2 class="text-2xl font-display font-bold text-white">Users &amp; access</h2>
        <p class="text-gray-400 mt-1">Approve new accounts and assign Root Admin or BD User roles.</p>
      </div>
      <button class="btn-secondary text-sm" @click="load">🔄 Refresh</button>
    </div>

    <div v-if="error" class="mb-4 p-3 bg-red-900/20 border border-red-800/30 rounded-lg text-red-400 text-sm">{{ error }}</div>
    <div v-if="loading" class="py-12 text-center text-gray-500">Loading users…</div>

    <div v-else class="card p-0 overflow-x-auto">
      <table class="w-full text-sm">
        <thead>
          <tr class="text-left text-gray-500 border-b border-deep-600">
            <th class="py-3 px-4">Email</th>
            <th class="py-3 px-4">Name</th>
            <th class="py-3 px-4">Role</th>
            <th class="py-3 px-4">Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="user in users" :key="user.id" class="border-b border-deep-700 last:border-0">
            <td class="py-3 px-4 text-gray-200">{{ user.email }}</td>
            <td class="py-3 px-4 text-gray-400">{{ user.full_name || '—' }}</td>
            <td class="py-3 px-4">
              <span class="badge" :class="user.role === 'root_admin' ? 'bg-accent-gold/20 text-accent-gold' : user.role === 'bd_user' ? 'bg-accent-teal/20 text-accent-teal' : 'bg-yellow-900/20 text-yellow-400'">
                {{ roleLabel(user.role) }}
              </span>
            </td>
            <td class="py-3 px-4">
              <div class="flex flex-wrap gap-2">
                <button
                  class="px-2 py-1 text-xs rounded-lg bg-deep-700 hover:bg-deep-600 text-gray-300 disabled:opacity-40"
                  :disabled="savingId === user.id || user.role === 'bd_user'"
                  @click="setRole(user, 'bd_user')"
                >Approve as BD User</button>
                <button
                  class="px-2 py-1 text-xs rounded-lg bg-deep-700 hover:bg-deep-600 text-gray-300 disabled:opacity-40"
                  :disabled="savingId === user.id || user.role === 'root_admin'"
                  @click="setRole(user, 'root_admin')"
                >Make Root Admin</button>
                <button
                  class="px-2 py-1 text-xs rounded-lg bg-deep-700 hover:bg-deep-600 text-gray-300 disabled:opacity-40"
                  :disabled="savingId === user.id || user.id === auth.profile?.id || user.role === 'pending'"
                  @click="setRole(user, 'pending')"
                >Revoke</button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
