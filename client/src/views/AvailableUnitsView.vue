<script setup>
// Public front page: browse published unit listings across the estates, with
// estate/type filters. Driven entirely by the public listings API (no auth).
import { ref, computed, onMounted, watch } from "vue";
import { publicUnits } from "../lib/resource.js";
import UnitCard from "../components/UnitCard.vue";
import logoUrl from "../assets/ortigas-logo.svg";

const all = ref([]);
const units = ref([]);
const loading = ref(true);
const error = ref("");

const estateId = ref("");
const type = ref("");

const estateOptions = computed(() => {
  const seen = new Map();
  for (const c of all.value) {
    const e = c.estate;
    if (e && e.id && !seen.has(e.id)) seen.set(e.id, e.name || e.id);
  }
  return Array.from(seen, ([id, name]) => ({ id, name }));
});

const typeOptions = computed(() => {
  const seen = new Set();
  for (const c of all.value) {
    if (c.type) seen.add(c.type);
  }
  return Array.from(seen);
});

async function load() {
  loading.value = true;
  error.value = "";
  try {
    all.value = await publicUnits.list();
    units.value = all.value;
  } catch (e) {
    error.value = "Unable to load units right now. Please try again later.";
  } finally {
    loading.value = false;
  }
}

async function applyFilters() {
  error.value = "";
  try {
    units.value = await publicUnits.list({
      estateId: estateId.value || undefined,
      type: type.value || undefined,
    });
  } catch (e) {
    error.value = "Unable to load units right now. Please try again later.";
  }
}

function clearFilters() {
  estateId.value = "";
  type.value = "";
}

watch([estateId, type], () => {
  applyFilters();
});

onMounted(load);

const isFiltered = computed(() => !!(estateId.value || type.value));
</script>

<template>
  <div class="portal">
    <header class="nav">
      <RouterLink to="/" class="brand">
        <img :src="logoUrl" alt="" class="brand__logo" />
        <span class="brand__name">Ortigas Land</span>
        <span class="brand__sub">Leasing</span>
      </RouterLink>
      <nav class="nav__actions">
        <RouterLink to="/inquiry?as=LESSOR" class="nav__list">List your unit</RouterLink>
        <RouterLink to="/login" class="nav__signin">Sign in</RouterLink>
      </nav>
    </header>

    <section class="hero">
      <div class="hero__glow" aria-hidden="true"></div>
      <div class="hero__inner">
        <p class="eyebrow">Residential &amp; Office Leasing</p>
        <h1 class="hero__title">Find a space that fits<br />the way you live and work.</h1>
        <p class="hero__lede">Move-in-ready units across Ortigas Land's managed estates — vetted, photographed, and ready to lease.</p>
      </div>

      <form class="searchbar" role="search" @submit.prevent>
        <label class="field">
          <span>Location</span>
          <select v-model="estateId" aria-label="Filter by estate">
            <option value="">All estates</option>
            <option v-for="e in estateOptions" :key="e.id" :value="e.id">{{ e.name }}</option>
          </select>
        </label>
        <span class="searchbar__div" aria-hidden="true"></span>
        <label class="field">
          <span>Unit type</span>
          <select v-model="type" aria-label="Filter by unit type">
            <option value="">All types</option>
            <option v-for="t in typeOptions" :key="t" :value="t">{{ t }}</option>
          </select>
        </label>
        <button v-if="isFiltered" type="button" class="searchbar__clear" @click="clearFilters">Clear</button>
      </form>
    </section>

    <main class="results">
      <div class="results__head">
        <p class="count">
          {{ loading ? "Finding available units…" : `${units.length} unit${units.length === 1 ? "" : "s"} available` }}
        </p>
      </div>

      <p v-if="error" class="error-line">{{ error }}</p>

      <div v-if="loading" class="grid" aria-hidden="true">
        <div v-for="n in 6" :key="n" class="skeleton">
          <div class="sk-photo"></div>
          <div class="sk-body">
            <div class="sk-line sk-line--price"></div>
            <div class="sk-line"></div>
            <div class="sk-line sk-line--short"></div>
          </div>
        </div>
      </div>

      <div v-else-if="units.length" class="grid">
        <UnitCard v-for="c in units" :key="c.unitId" :card="c" />
      </div>

      <div v-else class="empty">
        <svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" stroke-width="1.3" aria-hidden="true">
          <path d="M3 21h18M5 21V8l7-4 7 4v13" /><path d="M9.5 21v-5h5v5" /><path d="M9 11h.01M15 11h.01" />
        </svg>
        <h2>{{ isFiltered ? "No units match your filters" : "No units are available yet" }}</h2>
        <p>{{ isFiltered
          ? "Try widening your search or clearing the filters."
          : "Check back soon — new listings appear here once they're photographed and approved." }}</p>
        <button v-if="isFiltered" type="button" class="empty__clear" @click="clearFilters">Clear filters</button>
      </div>
    </main>

    <footer class="foot">
      <div class="foot__brand">
        <img :src="logoUrl" alt="" />
        <span>Ortigas Land · Leasing</span>
      </div>
      <p class="foot__estates">Capitol Commons · Circulo Verde · Greenhills Center · Ortigas East</p>
      <p class="foot__meta">Own a unit to lease out? <RouterLink to="/inquiry?as=LESSOR">List your unit</RouterLink>.</p>
    </footer>
  </div>
</template>

<style scoped>
.portal {
  min-height: 100vh;
  background: var(--paper);
  display: flex;
  flex-direction: column;
}

/* ── nav ── */
.nav {
  position: sticky;
  top: 0;
  z-index: 20;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.7rem clamp(1rem, 4vw, 2.5rem);
  background: var(--surface);
  background: color-mix(in srgb, var(--surface) 88%, transparent);
  backdrop-filter: blur(10px);
  border-bottom: 1px solid var(--line);
}
.brand {
  display: inline-flex;
  align-items: baseline;
  gap: 0.5rem;
  text-decoration: none;
}
.brand__logo { width: 26px; height: 26px; align-self: center; }
.brand__name { font-family: var(--display, Georgia, serif); font-size: 1.15rem; font-weight: 600; color: var(--ink-800); }
.brand__sub { font-size: 0.66rem; text-transform: uppercase; letter-spacing: 0.16em; color: var(--muted); font-weight: 700; }
.nav__actions { display: flex; align-items: center; gap: 0.5rem; }
.nav__list {
  background: var(--accent);
  color: #fff;
  text-decoration: none;
  font-weight: 650;
  font-size: 0.86rem;
  padding: 0.5rem 0.95rem;
  border-radius: var(--radius-sm);
  box-shadow: var(--shadow-sm);
  transition: background 0.16s ease;
}
.nav__list:hover { background: var(--accent-600); }
.nav__signin {
  color: var(--ink-700);
  text-decoration: none;
  font-weight: 600;
  font-size: 0.86rem;
  padding: 0.5rem 0.7rem;
  border-radius: var(--radius-sm);
}
.nav__signin:hover { background: var(--accent-050); color: var(--accent-text); }

/* ── hero ── */
.hero {
  position: relative;
  background: linear-gradient(160deg, #0c2c21 0%, #103a2b 55%, #17503a 100%);
  color: #eaf3ee;
  padding: clamp(2.75rem, 7vw, 5rem) clamp(1rem, 4vw, 2.5rem) 0;
  overflow: hidden;
}
.hero__glow {
  position: absolute;
  top: -30%;
  right: -10%;
  width: 55%;
  height: 140%;
  background: radial-gradient(closest-side, rgba(92, 196, 146, 0.28), transparent 70%);
  pointer-events: none;
}
.hero__inner { position: relative; max-width: 60rem; margin: 0 auto; }
.eyebrow {
  margin: 0 0 0.85rem;
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.18em;
  font-weight: 700;
  color: #7fdcaf;
}
.hero__title {
  margin: 0;
  font-family: var(--display, Georgia, serif);
  font-weight: 600;
  font-size: clamp(2rem, 5.5vw, 3.5rem);
  line-height: 1.08;
  letter-spacing: -0.01em;
}
.hero__lede {
  margin: 1rem 0 0;
  max-width: 34rem;
  font-size: clamp(0.95rem, 2vw, 1.1rem);
  line-height: 1.55;
  color: #c4dccf;
}

/* signature: search bar straddling the hero and the grid */
.searchbar {
  position: relative;
  z-index: 5;
  max-width: 60rem;
  margin: clamp(2rem, 5vw, 3rem) auto -1.75rem;
  transform: translateY(1.75rem);
  display: flex;
  align-items: stretch;
  gap: 0.5rem;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  box-shadow: var(--shadow-lg);
  padding: 0.5rem 0.5rem 0.5rem 0.35rem;
}
.field {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  padding: 0.35rem 0.75rem;
}
.field > span {
  font-size: 0.64rem;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  font-weight: 700;
  color: var(--muted);
}
.field select {
  border: none;
  background: transparent;
  font: inherit;
  font-size: 0.95rem;
  font-weight: 550;
  color: var(--ink-800);
  padding: 0.1rem 0;
  cursor: pointer;
  border-radius: 4px;
}
.field select:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 3px;
}
.searchbar__div { width: 1px; background: var(--line); margin: 0.4rem 0; }
.searchbar__clear {
  align-self: center;
  margin-right: 0.35rem;
  background: var(--accent-050);
  color: var(--accent-text);
  border: none;
  border-radius: var(--radius-sm);
  padding: 0.6rem 1rem;
  font: inherit;
  font-weight: 650;
  cursor: pointer;
}
.searchbar__clear:hover { background: var(--accent); color: #fff; }

/* ── results ── */
.results {
  flex: 1;
  width: 100%;
  max-width: 76rem;
  margin: 0 auto;
  padding: clamp(2.75rem, 6vw, 3.75rem) clamp(1rem, 4vw, 2.5rem) 3rem;
}
.results__head { margin-bottom: 1.25rem; }
.count {
  margin: 0;
  font-family: var(--display, Georgia, serif);
  font-size: 1.15rem;
  font-weight: 600;
  color: var(--ink-800);
}
.error-line {
  margin: 0 0 1rem;
  color: var(--danger, #b3261e);
  background: var(--danger-050, #fbeae8);
  border-radius: var(--radius-sm);
  padding: 0.6rem 0.85rem;
  font-size: 0.9rem;
}
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(270px, 1fr));
  gap: clamp(1rem, 2.5vw, 1.5rem);
}

/* skeletons */
.skeleton {
  border: 1px solid var(--line);
  border-radius: var(--radius);
  overflow: hidden;
  background: var(--surface);
}
.sk-photo { aspect-ratio: 4 / 3; background: var(--line); }
.sk-body { padding: 0.9rem 1rem 1.1rem; display: flex; flex-direction: column; gap: 0.55rem; }
.sk-line { height: 0.7rem; border-radius: 999px; background: var(--line); }
.sk-line--price { height: 1.2rem; width: 45%; }
.sk-line--short { width: 60%; }
.skeleton .sk-photo, .skeleton .sk-line {
  background: linear-gradient(90deg, var(--line) 25%, var(--paper) 37%, var(--line) 63%);
  background-size: 400% 100%;
  animation: shimmer 1.4s ease infinite;
}

/* empty */
.empty {
  text-align: center;
  padding: 3.5rem 1rem;
  color: var(--muted);
  border: 1px dashed var(--line-strong);
  border-radius: var(--radius);
  background: var(--surface);
}
.empty svg { color: var(--accent-text); opacity: 0.7; }
.empty h2 { margin: 0.75rem 0 0.35rem; font-family: var(--display, Georgia, serif); font-size: 1.25rem; color: var(--ink-800); }
.empty p { margin: 0 auto; max-width: 26rem; font-size: 0.92rem; line-height: 1.5; }
.empty__clear {
  margin-top: 1.1rem;
  background: var(--accent);
  color: #fff;
  border: none;
  border-radius: var(--radius-sm);
  padding: 0.55rem 1.1rem;
  font: inherit;
  font-weight: 650;
  cursor: pointer;
}
.empty__clear:hover { background: var(--accent-600); }

/* ── footer ── */
.foot {
  border-top: 1px solid var(--line);
  background: var(--surface);
  padding: 1.75rem clamp(1rem, 4vw, 2.5rem);
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem 1.5rem;
}
.foot__brand { display: inline-flex; align-items: center; gap: 0.5rem; font-weight: 600; color: var(--ink-800); }
.foot__brand img { width: 22px; height: 22px; }
.foot__estates { margin: 0; color: var(--muted); font-size: 0.82rem; }
.foot__meta { margin: 0; font-size: 0.85rem; color: var(--muted); }
.foot__meta a { color: var(--accent-text); font-weight: 650; text-decoration: none; }
.foot__meta a:hover { text-decoration: underline; }

@keyframes shimmer { from { background-position: 100% 0; } to { background-position: 0 0; } }

@media (max-width: 620px) {
  .searchbar { flex-direction: column; align-items: stretch; gap: 0.15rem; }
  .searchbar__div { width: auto; height: 1px; margin: 0 0.75rem; }
  .searchbar__clear { margin: 0.35rem; }
  .nav__signin { display: none; }
}
@media (prefers-reduced-motion: reduce) {
  .skeleton .sk-photo, .skeleton .sk-line { animation: none; }
}
</style>
