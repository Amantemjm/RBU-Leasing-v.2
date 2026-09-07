<script setup>
// Available units, inside the portal. The same published listings the public
// gallery shows, so a signed-in lessee can look without logging out. Read-only
// on purpose — each card opens the unit's own page, and enquiring stays a
// separate conversation with the leasing team.
import { ref, computed, onMounted } from "vue";
import { publicUnits } from "../lib/resource.js";
import UnitCard from "../components/UnitCard.vue";

const all = ref([]);
const loading = ref(true);
const error = ref("");

const estateId = ref("");
const type = ref("");

onMounted(async () => {
  try { all.value = await publicUnits.list(); }
  catch { error.value = "Could not load available units. Try again shortly."; }
  finally { loading.value = false; }
});

const estateOptions = computed(() => {
  const seen = new Map();
  for (const c of all.value) if (c.estate?.id) seen.set(c.estate.id, c.estate.name);
  return [...seen].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
});
const typeOptions = computed(() =>
  [...new Set(all.value.map((c) => c.type).filter(Boolean))].sort(),
);

const units = computed(() =>
  all.value.filter(
    (c) =>
      (!estateId.value || c.estate?.id === estateId.value) &&
      (!type.value || c.type === type.value),
  ),
);
const isFiltered = computed(() => !!estateId.value || !!type.value);
function clearFilters() { estateId.value = ""; type.value = ""; }
</script>

<template>
  <section>
    <header>
      <div>
        <h1>Available Units</h1>
        <p class="sub">Published listings across the portfolio.</p>
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
    </header>

    <p v-if="error" class="error-line">{{ error }}</p>
    <p class="count">
      {{ loading ? "Finding available units…" : `${units.length} unit${units.length === 1 ? "" : "s"} available` }}
    </p>

    <div v-if="!loading && units.length" class="grid">
      <UnitCard v-for="c in units" :key="c.unitId" :card="c" />
    </div>

    <div v-else-if="!loading && !error" class="panel empty">
      <p>{{ isFiltered ? "No units match those filters." : "No units are available just yet." }}</p>
      <button v-if="isFiltered" type="button" class="secondary" @click="clearFilters">Clear filters</button>
    </div>
  </section>
</template>

<style scoped>
.sub { margin: 0.2rem 0 0; color: var(--muted); font-size: 0.9rem; }
.filters { display: flex; align-items: flex-end; gap: 0.65rem; flex-wrap: wrap; }
.filter span { display: block; font-size: 0.7rem; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: var(--muted); margin-bottom: 0.25rem; }
.filters__clear { background: none; border: none; color: var(--accent-text); cursor: pointer; font-size: 0.85rem; padding: 0.4rem 0.2rem; }
.count { margin: 0.9rem 0; color: var(--muted); font-size: 0.88rem; }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(17rem, 1fr)); gap: 1.1rem; }
.empty { display: grid; place-items: center; gap: 0.7rem; padding: 2.5rem 1rem; text-align: center; color: var(--muted); }
</style>
