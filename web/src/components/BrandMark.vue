<script setup lang="ts">
withDefaults(defineProps<{
  size?: 'sm' | 'md' | 'lg' | 'hero'
}>(), { size: 'md' })

const src = `${import.meta.env.BASE_URL}lani_logo.png`
const height = {
  sm: 'h-8',
  md: 'h-10',
  lg: 'h-12',
  hero: 'h-12',
} as const
</script>

<template>
  <img
    :src="src"
    alt="Lani Consulting"
    :class="['w-auto max-w-full object-contain', height[size]]"
  />
</template>
