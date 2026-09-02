<script setup>
// Content Manager hub — the entry point to the manageable content areas.
// Mirrors Costa's content-section list; each card links to a manager.
import { computed } from "vue";
import { useAuthStore } from "../stores/auth.js";

const auth = useAuthStore();

const sections = computed(() => {
  const list = [
    {
      key: "listings",
      to: "/app/content/listings",
      title: "Listings",
      desc: "Upload photos and manage the details of every unit, then publish it to the public Featured Properties.",
      icon: "M3 21h18M5 21V8l7-4 7 4v13M9.5 21v-5h5v5M9 11h.01M15 11h.01",
    },
  ];
  if (auth.role === "ADMIN") {
    list.push({
      key: "forms",
      to: "/app/forms",
      title: "Forms",
      desc: "Build the configurable forms shown across the portal and review their submissions.",
      icon: "M4 4h16v16H4zM4 9h16M9 4v16",
    });
  }
  return list;
});
</script>

<template>
  <section>
    <header>
      <h1>Content Manager</h1>
    </header>
    <p class="lede">Manage the content that appears across the leasing site and portal.</p>

    <div class="sections">
      <RouterLink v-for="s in sections" :key="s.key" :to="s.to" class="section-card">
        <span class="section-card__ic" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path :d="s.icon" /></svg>
        </span>
        <span class="section-card__t">{{ s.title }}</span>
        <span class="section-card__d">{{ s.desc }}</span>
        <span class="section-card__go">Open
          <svg viewBox="0 0 16 16" width="14" height="14" fill="none" aria-hidden="true"><path d="M3 8h9M8.5 4l4 4-4 4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" /></svg>
        </span>
      </RouterLink>
    </div>
  </section>
</template>

<style scoped>
.lede { margin: 0 0 1.5rem; color: var(--muted); font-size: 0.95rem; }
.sections { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 1rem; }
.section-card {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 1.4rem 1.4rem 1.25rem;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  box-shadow: var(--shadow-sm);
  text-decoration: none;
  transition: transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease;
}
.section-card:hover { transform: translateY(-3px); box-shadow: var(--shadow-lg); border-color: var(--accent); }
.section-card__ic { width: 46px; height: 46px; border-radius: 12px; display: inline-flex; align-items: center; justify-content: center; background: var(--accent-050); color: var(--accent); }
.section-card__t { font-family: var(--display, Georgia, serif); font-size: 1.3rem; font-weight: 600; color: var(--ink-800); }
.section-card__d { color: var(--muted); font-size: 0.9rem; line-height: 1.5; flex: 1; }
.section-card__go { display: inline-flex; align-items: center; gap: 0.35rem; color: var(--accent-text); font-weight: 700; font-size: 0.85rem; }
.section-card__go svg { transition: transform 0.18s ease; }
.section-card:hover .section-card__go svg { transform: translateX(3px); }
</style>
