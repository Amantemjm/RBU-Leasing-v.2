<script setup>
// Public front page for Residential Leasing by Ortigas Land: a welcome hero
// with the lessee/lessor choice, plus a browsable grid of featured available
// units. Driven by the public listings API (no auth).
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
  for (const c of all.value) if (c.type) seen.add(c.type);
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
    units.value = await publicUnits.list({ estateId: estateId.value || undefined, type: type.value || undefined });
  } catch (e) {
    error.value = "Unable to load units right now. Please try again later.";
  }
}
function clearFilters() { estateId.value = ""; type.value = ""; }

watch([estateId, type], () => applyFilters());
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
      <div class="hero__inner">
        <p class="eyebrow">Welcome to Residential Leasing by Ortigas Land</p>
        <h1 class="hero__title">Home Lease, Made Simple</h1>
        <p class="hero__lede">
          Looking to move into a new rental property, or have a unit you'd like to list and find the
          perfect tenant? Choose the option that best describes you.
        </p>
        <div class="choices">
          <RouterLink to="/inquiry?as=LESSEE" class="choice">
            <span class="choice__ic" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21h18M5 21V8l7-4 7 4v13" /><path d="M9.5 21v-5h5v5" /><path d="M9 11h.01M15 11h.01" /></svg>
            </span>
            <span class="choice__t">I'm a Lessee</span>
            <span class="choice__d">Find and rent a residence or office</span>
            <span class="choice__go">Get started <svg viewBox="0 0 16 16" width="14" height="14" fill="none" aria-hidden="true"><path d="M3 8h9M8.5 4l4 4-4 4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" /></svg></span>
          </RouterLink>
          <RouterLink to="/inquiry?as=LESSOR" class="choice">
            <span class="choice__ic" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21h18M6 21V7l6-4 6 4v14" /><path d="M10 9h4M10 13h4M10 17h4" /></svg>
            </span>
            <span class="choice__t">I'm a Lessor</span>
            <span class="choice__d">List your unit and find a tenant</span>
            <span class="choice__go">List your unit <svg viewBox="0 0 16 16" width="14" height="14" fill="none" aria-hidden="true"><path d="M3 8h9M8.5 4l4 4-4 4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" /></svg></span>
          </RouterLink>
        </div>
      </div>
    </section>

    <main class="featured">
      <div class="featured__head">
        <div>
          <p class="section-eyebrow">Now leasing</p>
          <h2 class="section-title">Featured properties</h2>
        </div>
        <form class="filters" role="search" @submit.prevent>
          <label class="filter">
            <span>Location</span>
            <select v-model="estateId" aria-label="Filter by estate">
              <option value="">All estates</option>
              <option v-for="e in estateOptions" :key="e.id" :value="e.id">{{ e.name }}</option>
            </select>
          </label>
          <label class="filter">
            <span>Unit type</span>
            <select v-model="type" aria-label="Filter by unit type">
              <option value="">All types</option>
              <option v-for="t in typeOptions" :key="t" :value="t">{{ t }}</option>
            </select>
          </label>
          <button v-if="isFiltered" type="button" class="filters__clear" @click="clearFilters">Clear</button>
        </form>
      </div>

      <p class="count">{{ loading ? "Finding available units…" : `${units.length} unit${units.length === 1 ? "" : "s"} available` }}</p>
      <p v-if="error" class="error-line">{{ error }}</p>

      <div v-if="loading" class="grid" aria-hidden="true">
        <div v-for="n in 6" :key="n" class="skeleton">
          <div class="sk-photo"></div>
          <div class="sk-body"><div class="sk-line sk-line--price"></div><div class="sk-line"></div><div class="sk-line sk-line--short"></div></div>
        </div>
      </div>

      <div v-else-if="units.length" class="grid">
        <UnitCard v-for="c in units" :key="c.unitId" :card="c" />
      </div>

      <div v-else class="empty">
        <svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" stroke-width="1.3" aria-hidden="true"><path d="M3 21h18M5 21V8l7-4 7 4v13" /><path d="M9.5 21v-5h5v5" /><path d="M9 11h.01M15 11h.01" /></svg>
        <h3>{{ isFiltered ? "No units match your filters" : "No units are available yet" }}</h3>
        <p>{{ isFiltered ? "Try widening your search or clearing the filters." : "Check back soon — new listings appear here once they're photographed and approved." }}</p>
        <button v-if="isFiltered" type="button" class="empty__clear" @click="clearFilters">Clear filters</button>
      </div>
    </main>

    <footer class="foot">
      <div class="foot__grid">
        <div class="foot__col foot__col--brand">
          <img :src="logoUrl" alt="" class="foot__logo" />
          <p class="foot__name">Residential Leasing by Ortigas Land</p>
          <p class="foot__addr">7F Estancia West Wing, Meralco Avenue,<br />Pasig City 1605, Philippines</p>
          <p class="foot__phone">(+632) 8631-1231 · (+63) 917 678 4427</p>
        </div>
        <div class="foot__col">
          <h4>Explore</h4>
          <a href="https://www.ortigasland.com" target="_blank" rel="noopener">News</a>
          <a href="https://www.ortigasland.com" target="_blank" rel="noopener">Careers</a>
          <a href="https://www.ortigasland.com" target="_blank" rel="noopener">Privacy Policy</a>
          <a href="https://www.ortigasland.com" target="_blank" rel="noopener">Online Payment</a>
        </div>
        <div class="foot__col">
          <h4>Get connected</h4>
          <p class="foot__social-note">Follow Ortigas Land for updates on projects, estates, and malls.</p>
          <RouterLink to="/inquiry?as=LESSEE" class="foot__cta">Make an inquiry</RouterLink>
        </div>
      </div>
      <p class="foot__copy">© Ortigas Land · Residential Leasing</p>
    </footer>
  </div>
</template>

<style scoped>
.portal {
  --brand: #0b463c;
  --brand-600: #00392f;
  --brand-tint: #e7efec;
  min-height: 100vh;
  background: var(--surface);
  display: flex;
  flex-direction: column;
}

/* nav */
.nav {
  position: sticky;
  top: 0;
  z-index: 20;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.7rem clamp(1rem, 4vw, 3rem);
  background: var(--surface);
  border-bottom: 1px solid var(--line);
}
.brand { display: inline-flex; align-items: baseline; gap: 0.5rem; text-decoration: none; }
.brand__logo { width: 27px; height: 27px; align-self: center; }
.brand__name { font-family: var(--display, Georgia, serif); font-size: 1.18rem; font-weight: 600; color: var(--brand); }
.brand__sub { font-size: 0.66rem; text-transform: uppercase; letter-spacing: 0.16em; color: var(--muted); font-weight: 700; }
.nav__actions { display: flex; align-items: center; gap: 0.5rem; }
.nav__list { background: var(--brand); color: #fff; text-decoration: none; font-weight: 650; font-size: 0.86rem; padding: 0.5rem 1rem; border-radius: var(--radius-sm); }
.nav__list:hover { background: var(--brand-600); }
.nav__signin { color: var(--brand); text-decoration: none; font-weight: 600; font-size: 0.86rem; padding: 0.5rem 0.7rem; border-radius: var(--radius-sm); }
.nav__signin:hover { background: var(--brand-tint); }

/* hero */
.hero {
  position: relative;
  background:
    radial-gradient(120% 120% at 80% -10%, rgba(255, 255, 255, 0.08), transparent 55%),
    linear-gradient(155deg, #0b463c 0%, #0e5548 55%, #10604f 100%);
  color: #eaf3ee;
  padding: clamp(3rem, 8vw, 5.5rem) clamp(1rem, 4vw, 3rem) clamp(2.5rem, 6vw, 4rem);
  text-align: center;
}
.hero__inner { max-width: 60rem; margin: 0 auto; }
.eyebrow { margin: 0 0 1rem; font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.18em; font-weight: 700; color: #8fdcc0; }
.hero__title { margin: 0; font-family: var(--display, Georgia, serif); font-weight: 600; font-size: clamp(2.2rem, 6vw, 4rem); line-height: 1.05; letter-spacing: -0.01em; }
.hero__lede { margin: 1.15rem auto 0; max-width: 40rem; font-size: clamp(0.98rem, 2vw, 1.12rem); line-height: 1.6; color: #cfe2da; }
.choices { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1rem; max-width: 44rem; margin: 2.25rem auto 0; }
.choice {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  text-align: left;
  padding: 1.35rem 1.4rem;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.18);
  border-radius: 14px;
  text-decoration: none;
  color: #fff;
  transition: transform 0.18s ease, background 0.18s ease, border-color 0.18s ease;
}
.choice:hover { transform: translateY(-3px); background: rgba(255, 255, 255, 0.12); border-color: rgba(255, 255, 255, 0.4); }
.choice__ic { width: 46px; height: 46px; border-radius: 12px; display: inline-flex; align-items: center; justify-content: center; background: rgba(255, 255, 255, 0.14); color: #d6f0e5; }
.choice__t { font-family: var(--display, Georgia, serif); font-size: 1.3rem; font-weight: 600; margin-top: 0.35rem; }
.choice__d { font-size: 0.88rem; color: #cfe2da; }
.choice__go { display: inline-flex; align-items: center; gap: 0.35rem; margin-top: 0.35rem; font-size: 0.82rem; font-weight: 700; color: #9fe6c9; }
.choice__go svg { transition: transform 0.18s ease; }
.choice:hover .choice__go svg { transform: translateX(3px); }

/* featured */
.featured { flex: 1; width: 100%; max-width: 78rem; margin: 0 auto; padding: clamp(2.5rem, 6vw, 4rem) clamp(1rem, 4vw, 3rem) 3.5rem; }
.featured__head { display: flex; align-items: flex-end; justify-content: space-between; gap: 1rem 1.5rem; flex-wrap: wrap; margin-bottom: 0.5rem; }
.section-eyebrow { margin: 0 0 0.2rem; font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.16em; font-weight: 700; color: var(--brand); }
.section-title { margin: 0; font-family: var(--display, Georgia, serif); font-size: clamp(1.5rem, 3.5vw, 2.1rem); font-weight: 600; color: var(--ink-800); }
.filters { display: flex; align-items: stretch; gap: 0.4rem; background: var(--surface); border: 1px solid var(--line-strong); border-radius: var(--radius); padding: 0.35rem; box-shadow: var(--shadow-sm); }
.filter { display: flex; flex-direction: column; gap: 0.1rem; padding: 0.3rem 0.7rem; }
.filter > span { font-size: 0.6rem; text-transform: uppercase; letter-spacing: 0.1em; font-weight: 700; color: var(--muted); }
.filter select { border: none; background: transparent; font: inherit; font-size: 0.9rem; font-weight: 550; color: var(--ink-800); cursor: pointer; border-radius: 4px; }
.filter select:focus-visible { outline: 2px solid var(--brand); outline-offset: 3px; }
.filters__clear { align-self: center; background: var(--brand-tint); color: var(--brand); border: none; border-radius: var(--radius-sm); padding: 0.55rem 0.9rem; font: inherit; font-weight: 650; cursor: pointer; }
.filters__clear:hover { background: var(--brand); color: #fff; }
.count { margin: 1rem 0; font-size: 0.92rem; color: var(--muted); font-weight: 600; }
.error-line { margin: 0 0 1rem; color: var(--danger, #b3261e); background: var(--danger-050, #fbeae8); border-radius: var(--radius-sm); padding: 0.6rem 0.85rem; font-size: 0.9rem; }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(275px, 1fr)); gap: clamp(1rem, 2.5vw, 1.6rem); }

/* skeletons */
.skeleton { border: 1px solid var(--line); border-radius: 14px; overflow: hidden; background: var(--surface); }
.sk-photo { aspect-ratio: 4 / 3; background: var(--line); }
.sk-body { padding: 0.9rem 1rem 1.1rem; display: flex; flex-direction: column; gap: 0.55rem; }
.sk-line { height: 0.7rem; border-radius: 999px; background: var(--line); }
.sk-line--price { height: 1.2rem; width: 45%; }
.sk-line--short { width: 60%; }
.skeleton .sk-photo, .skeleton .sk-line { background: linear-gradient(90deg, var(--line) 25%, var(--paper) 37%, var(--line) 63%); background-size: 400% 100%; animation: shimmer 1.4s ease infinite; }

/* empty */
.empty { text-align: center; padding: 3.5rem 1rem; color: var(--muted); border: 1px dashed var(--line-strong); border-radius: 14px; background: var(--surface); }
.empty svg { color: var(--brand); opacity: 0.7; }
.empty h3 { margin: 0.75rem 0 0.35rem; font-family: var(--display, Georgia, serif); font-size: 1.25rem; color: var(--ink-800); }
.empty p { margin: 0 auto; max-width: 26rem; font-size: 0.92rem; line-height: 1.5; }
.empty__clear { margin-top: 1.1rem; background: var(--brand); color: #fff; border: none; border-radius: var(--radius-sm); padding: 0.55rem 1.1rem; font: inherit; font-weight: 650; cursor: pointer; }

/* footer */
.foot { background: var(--brand); color: #d7e7e0; padding: clamp(2.5rem, 5vw, 3.5rem) clamp(1rem, 4vw, 3rem) 1.5rem; }
.foot__grid { max-width: 78rem; margin: 0 auto; display: grid; grid-template-columns: 1.6fr 1fr 1.2fr; gap: 2rem; }
.foot__logo { width: 34px; height: 34px; filter: brightness(0) invert(1); opacity: 0.92; }
.foot__name { margin: 0.6rem 0 0.5rem; font-family: var(--display, Georgia, serif); font-size: 1.15rem; color: #fff; }
.foot__addr { margin: 0 0 0.4rem; font-size: 0.85rem; line-height: 1.5; }
.foot__phone { margin: 0; font-size: 0.85rem; color: #a9cfc2; }
.foot__col h4 { margin: 0 0 0.75rem; font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.14em; color: #8fbcae; font-weight: 700; }
.foot__col a { display: block; color: #d7e7e0; text-decoration: none; font-size: 0.88rem; padding: 0.25rem 0; }
.foot__col a:hover { color: #fff; }
.foot__social-note { margin: 0 0 0.9rem; font-size: 0.85rem; line-height: 1.5; }
.foot__cta { display: inline-block; background: #fff; color: var(--brand); text-decoration: none; font-weight: 650; font-size: 0.85rem; padding: 0.5rem 1rem; border-radius: var(--radius-sm); }
.foot__copy { max-width: 78rem; margin: 2rem auto 0; padding-top: 1.25rem; border-top: 1px solid rgba(255, 255, 255, 0.14); font-size: 0.78rem; color: #a9cfc2; }

@keyframes shimmer { from { background-position: 100% 0; } to { background-position: 0 0; } }

@media (max-width: 720px) {
  .choices { grid-template-columns: 1fr; }
  .featured__head { align-items: stretch; }
  .foot__grid { grid-template-columns: 1fr; gap: 1.5rem; }
  .nav__signin { display: none; }
}
@media (prefers-reduced-motion: reduce) {
  .choice:hover { transform: none; }
  .skeleton .sk-photo, .skeleton .sk-line { animation: none; }
}
</style>
