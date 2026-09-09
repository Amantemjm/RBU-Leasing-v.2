<script setup>
// Public browse page (/available-units): a browsable grid of available units,
// driven by the public listings API (no auth). Reached from the landing page's
// "I'm a Lessee → Get Started".
import { ref, computed, onMounted, watch } from "vue";
import { publicUnits } from "../lib/resource.js";
import UnitCard from "../components/UnitCard.vue";
import PublicShell from "../components/PublicShell.vue";

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
  <PublicShell main-label="Available units" skip-label="Skip to available units">
    <div class="featured">
      <div class="featured__head">
        <div>
          <p class="section-eyebrow">Now leasing</p>
          <h1 class="section-title">Available Units</h1>
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
    </div>
  </PublicShell>
</template>

<style scoped>

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
@keyframes shimmer { from { background-position: 100% 0; } to { background-position: 0 0; } }

@media (max-width: 720px) {
  .featured__head { align-items: stretch; }
}
@media (prefers-reduced-motion: reduce) {
  .skeleton .sk-photo, .skeleton .sk-line { animation: none; }
}

</style>
