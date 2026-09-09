<script setup>
// Public landing page: a role-selection entry point. A lessee browses available
// units; a lessor signs up as a Unit Owner. Split hero — text + role cards on
// the left, the Ortigas Land cover photo on the right. No listings are shown.
import { RouterLink } from "vue-router";
import PublicShell from "../components/PublicShell.vue";
import heroUrl from "../assets/landing-hero.jpg";
</script>

<template>
  <PublicShell main-label="Get started" skip-label="Skip to the options">
    <section class="hero" aria-label="Introduction">
      <div class="hero__text">
        <p class="eyebrow">Welcome to Residential Leasing by Ortigas Land</p>
        <h1 class="hero__title">Home Lease, Made Simple</h1>
        <p class="hero__lede">
          Looking to move into a new rental property, or have a unit you'd like to list and find the
          perfect tenant? Choose the option that best describes you.
        </p>
        <div class="choices">
          <RouterLink to="/available-units" class="choice">
            <span class="choice__ic" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21h18M5 21V8l7-4 7 4v13" /><path d="M9.5 21v-5h5v5" /><path d="M9 11h.01M15 11h.01" /></svg>
            </span>
            <span class="choice__t">I'm a Lessee</span>
            <span class="choice__d">Find and rent a residence or office</span>
            <span class="choice__go">Get started <svg viewBox="0 0 16 16" width="14" height="14" fill="none" aria-hidden="true"><path d="M3 8h9M8.5 4l4 4-4 4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" /></svg></span>
          </RouterLink>
          <RouterLink to="/signup?as=LESSOR" class="choice">
            <span class="choice__ic" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21h18M6 21V7l6-4 6 4v14" /><path d="M10 9h4M10 13h4M10 17h4" /></svg>
            </span>
            <span class="choice__t">I'm a Lessor</span>
            <span class="choice__d">List your unit and find a tenant</span>
            <span class="choice__go">List your unit <svg viewBox="0 0 16 16" width="14" height="14" fill="none" aria-hidden="true"><path d="M3 8h9M8.5 4l4 4-4 4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" /></svg></span>
          </RouterLink>
        </div>
      </div>

      <div class="hero__media" aria-hidden="true">
        <img :src="heroUrl" alt="" loading="eager" />
      </div>
    </section>
  </PublicShell>
</template>

<style scoped>
.hero {
  max-width: 84rem;
  margin: 0 auto;
  display: grid;
  grid-template-columns: minmax(0, 1.05fr) minmax(0, 0.95fr);
  align-items: center;
  gap: clamp(1.75rem, 4vw, 3.5rem);
  padding: clamp(2.25rem, 5.5vw, 4.5rem) clamp(1rem, 4vw, 3rem);
}
.hero__text { text-align: left; }
.eyebrow { margin: 0 0 1rem; font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.18em; font-weight: 700; color: var(--accent-text); }
.hero__title { margin: 0; color: var(--ink-800); font-family: var(--display, Georgia, serif); font-weight: 600; font-size: clamp(2.1rem, 4.6vw, 3.4rem); line-height: 1.06; letter-spacing: -0.01em; }
.hero__lede { margin: 1.1rem 0 0; max-width: 34rem; font-size: clamp(0.96rem, 1.6vw, 1.1rem); line-height: 1.6; color: var(--muted); }
.choices { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin: 2rem 0 0; }
.choice {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  text-align: left;
  padding: 1.35rem 1.4rem;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 14px;
  text-decoration: none;
  color: var(--text);
  box-shadow: var(--shadow-sm);
  transition: transform 0.18s ease, background 0.18s ease, border-color 0.18s ease;
}
.choice:hover { transform: translateY(-3px); box-shadow: var(--shadow-md); border-color: var(--accent-text); }
.choice__ic { width: 46px; height: 46px; border-radius: 12px; display: inline-flex; align-items: center; justify-content: center; background: var(--accent-050); color: var(--accent-text); }
.choice__t { font-family: var(--display, Georgia, serif); font-size: 1.3rem; font-weight: 600; margin-top: 0.35rem; color: var(--ink-800); }
.choice__d { font-size: 0.88rem; color: var(--muted); }
.choice__go { display: inline-flex; align-items: center; gap: 0.35rem; margin-top: 0.35rem; font-size: 0.82rem; font-weight: 700; color: var(--accent-text); }
.choice__go svg { transition: transform 0.18s ease; }
.choice:hover .choice__go svg { transform: translateX(3px); }

.hero__media img {
  display: block;
  width: 100%;
  aspect-ratio: 16 / 11;
  object-fit: cover;
  border-radius: 18px;
  box-shadow: var(--shadow-lg);
}

@media (max-width: 860px) {
  .hero { grid-template-columns: 1fr; gap: 1.75rem; }
  .hero__media img { aspect-ratio: 16 / 9; }
}
@media (max-width: 520px) { .choices { grid-template-columns: 1fr; } }
@media (prefers-reduced-motion: reduce) { .choice:hover { transform: none; } }
</style>
