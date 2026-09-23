<script setup lang="ts">
import BrandMark from './BrandMark.vue'

defineProps<{
  kicker?: string
}>()
</script>

<template>
  <div class="auth-shell min-h-screen flex flex-col bg-[#F3F5F1] text-stone-800">
    <div class="h-1 bg-lani-green"></div>
    <div class="flex-1 flex items-center justify-center px-4 py-8">
      <div class="w-full max-w-[440px]">
        <div class="flex flex-col items-center text-center mb-6">
          <BrandMark size="hero" />
          <p class="mt-4 text-sm tracking-wide text-stone-500">B2B Partnership Engine</p>
          <p v-if="kicker" class="mt-1 text-xs text-stone-400">{{ kicker }}</p>
        </div>

        <div class="bg-white rounded-2xl border border-black/[0.06] shadow-[0_18px_50px_rgba(15,23,15,0.08)] p-8">
          <slot />
        </div>

        <p class="text-center text-sm text-stone-500 mt-6">
          <slot name="footer" />
        </p>
      </div>
    </div>
  </div>
</template>
