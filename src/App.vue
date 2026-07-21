<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import { RouterView, useRouter } from 'vue-router'
import Lenis from 'lenis'
import 'lenis/dist/lenis.css'

const router = useRouter()

let lenis: Lenis | null = null
let rafId = 0
let removeAfterEach: (() => void) | null = null

onMounted(() => {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  if (reduceMotion) return

  lenis = new Lenis({
    lerp: 0.09,
    wheelMultiplier: 0.92,
    smoothWheel: true,
    syncTouch: false,
  })

  const raf = (time: number) => {
    lenis?.raf(time)
    rafId = requestAnimationFrame(raf)
  }
  rafId = requestAnimationFrame(raf)

  removeAfterEach = router.afterEach(() => {
    lenis?.scrollTo(0, { immediate: true })
  })
})

onUnmounted(() => {
  cancelAnimationFrame(rafId)
  removeAfterEach?.()
  lenis?.destroy()
  lenis = null
})
</script>

<template>
  <RouterView />
</template>

<style>
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: 'Manrope', sans-serif;
  color: var(--lh-ink);
  background: var(--lh-bg);
}
</style>
