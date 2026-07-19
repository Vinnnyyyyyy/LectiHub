<template>
  <div class="dashboard">
    <div class="atmosphere" aria-hidden="true" />

    <header class="topbar">
      <div>
        <p class="brand">LectiHub</p>
        <p class="greeting">Welcome back, {{ displayName }}</p>
      </div>
      <button type="button" class="logout" @click="handleLogout">Log out</button>
    </header>

    <main class="content">
      <section class="intro">
        <h1>Student Dashboard</h1>
        <p>Your place for scheduling, upcoming classes, notifications, and lesson history.</p>
      </section>

      <ScheduleBookingSection />

      <div class="panels">
        <section class="panel" style="--delay: 80ms">
          <h2>Upcoming classes</h2>
          <p>See what’s next on your learning calendar.</p>
          <p class="empty">No upcoming classes yet.</p>
        </section>

        <section class="panel" style="--delay: 160ms">
          <h2>Notifications</h2>
          <p>Stay current on schedule changes and reminders.</p>
          <p class="empty">You’re all caught up.</p>
        </section>

        <section class="panel" style="--delay: 240ms">
          <h2>Lesson history</h2>
          <p>Review past sessions and what you covered.</p>
          <p class="empty">No lessons recorded yet.</p>
        </section>
      </div>
    </main>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import ScheduleBookingSection from '../components/ScheduleBookingSection.vue'

const authStore = useAuthStore()
const router = useRouter()

const displayName = computed(
  () => authStore.fullName || authStore.username || 'student',
)

async function handleLogout() {
  authStore.logout()
  await router.push('/login')
}
</script>

<style scoped>
.dashboard {
  position: relative;
  min-height: 100vh;
  color: var(--lh-ink);
  overflow-x: hidden;
}

.atmosphere {
  position: fixed;
  inset: 0;
  z-index: -1;
  background: var(--lh-atmosphere);
}

.topbar {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 1rem;
  padding: 1.4rem 1.5rem 0.5rem;
  animation: fade-down 0.45s ease both;
}

.brand {
  font-family: 'Fraunces', Georgia, serif;
  font-size: 1.45rem;
  font-weight: 600;
  letter-spacing: -0.03em;
  color: var(--lh-accent);
}

.greeting {
  font-family: 'Manrope', sans-serif;
  font-size: 0.92rem;
  color: var(--lh-muted);
  margin-top: 0.15rem;
}

.logout {
  font-family: 'Manrope', sans-serif;
  font-size: 0.88rem;
  font-weight: 700;
  padding: 0.55rem 0.9rem;
  border-radius: 0.65rem;
  border: 1px solid var(--lh-line);
  background: var(--lh-panel-solid);
  color: var(--lh-ink);
  cursor: pointer;
  transition:
    background 0.18s ease,
    transform 0.18s ease,
    border-color 0.18s ease;
}

.logout:hover {
  border-color: var(--lh-line-strong);
  transform: translateY(-1px);
}

.content {
  max-width: 68rem;
  margin: 0 auto;
  padding: 1rem 1.5rem 2.5rem;
  display: grid;
  gap: 1.1rem;
}

.intro {
  animation: fade-up 0.5s ease both;
}

.intro h1 {
  font-family: 'Fraunces', Georgia, serif;
  font-size: clamp(1.7rem, 3vw, 2.2rem);
  font-weight: 550;
  letter-spacing: -0.03em;
  color: var(--lh-ink);
}

.intro p {
  font-family: 'Manrope', sans-serif;
  margin-top: 0.4rem;
  max-width: 36rem;
  color: var(--lh-muted);
  line-height: 1.5;
}

.panels {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1rem;
}

.panel {
  padding: 1.25rem 1.2rem;
  border: 1px solid var(--lh-line);
  border-radius: 1rem;
  background: var(--lh-panel);
  backdrop-filter: blur(10px);
  animation: fade-up 0.55s ease both;
  animation-delay: var(--delay);
}

.panel h2 {
  font-family: 'Fraunces', Georgia, serif;
  font-size: 1.2rem;
  font-weight: 550;
  color: var(--lh-accent);
}

.panel p {
  font-family: 'Manrope', sans-serif;
  font-size: 0.92rem;
  line-height: 1.45;
  margin-top: 0.35rem;
  color: var(--lh-muted);
}

.empty {
  margin-top: 1rem !important;
  padding-top: 0.85rem;
  border-top: 1px solid var(--lh-line);
  color: var(--lh-faint) !important;
  font-style: italic;
}

@keyframes fade-up {
  from {
    opacity: 0;
    transform: translateY(12px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes fade-down {
  from {
    opacity: 0;
    transform: translateY(-8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@media (max-width: 720px) {
  .panels {
    grid-template-columns: 1fr;
  }

  .topbar {
    align-items: center;
  }
}
</style>
