<template>
  <div class="dashboard">
    <div class="atmosphere" aria-hidden="true" />
    <main class="content">
      <p class="brand">LectiHub</p>
      <h1>Teacher Dashboard</h1>
      <p>Your teaching workspace will appear here.</p>
    </main>
  </div>
</template>

<style scoped>
.dashboard {
  position: relative;
  min-height: 100vh;
  color: var(--lh-ink);
}

.atmosphere {
  position: fixed;
  inset: 0;
  z-index: -1;
  background: var(--lh-atmosphere);
}

.content {
  max-width: 40rem;
  margin: 0 auto;
  padding: 2.5rem 1.5rem;
}

.brand {
  font-family: 'Fraunces', Georgia, serif;
  font-size: 1.4rem;
  font-weight: 600;
  color: var(--lh-accent);
}

h1 {
  font-family: 'Fraunces', Georgia, serif;
  font-size: 2rem;
  font-weight: 550;
  margin-top: 0.75rem;
}

p {
  font-family: 'Manrope', sans-serif;
  margin-top: 0.4rem;
  color: var(--lh-muted);
}
</style>
