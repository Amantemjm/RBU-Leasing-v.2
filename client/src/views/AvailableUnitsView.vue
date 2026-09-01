<script setup>
// Public grid of published unit listings, with estate/type filters.
// Sub-project J.
import { ref, computed, onMounted, watch } from "vue";
import { publicUnits } from "../lib/resource.js";
import UnitCard from "../components/UnitCard.vue";

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
  <div class="units-page">
    <header class="units-page__head">
      <div class="head-actions">
        <RouterLink to="/inquire" class="home-link">Make an inquiry &rarr;</RouterLink>
        <RouterLink to="/inquiry?as=LESSOR" class="cta-list">List your unit</RouterLink>
      </div>
      <h1>Available Units for Lease</h1>
      <p class="lede">Browse published listings across our managed estates.</p>
    </header>

    <div class="filters">
      <label class="filter">
        <span>Estate</span>
        <select v-model="estateId">
          <option value="">All estates</option>
          <option v-for="e in estateOptions" :key="e.id" :value="e.id">{{ e.name }}</option>
        </select>
      </label>
      <label class="filter">
        <span>Type</span>
        <select v-model="type">
          <option value="">All types</option>
          <option v-for="t in typeOptions" :key="t" :value="t">{{ t }}</option>
        </select>
      </label>
      <button type="button" class="clear-btn" @click="clearFilters">Clear</button>
    </div>

    <p v-if="error" class="error-line">{{ error }}</p>

    <p class="result-count">{{ units.length }} unit{{ units.length === 1 ? "" : "s" }} found</p>

    <div v-if="units.length" class="grid">
      <UnitCard v-for="c in units" :key="c.unitId" :card="c" />
    </div>
    <p v-else-if="!loading" class="empty">
      {{ isFiltered ? "No units match your filters." : "No units are currently available." }}
    </p>
  </div>
</template>

<style scoped>
.units-page {
  max-width: 72rem;
  margin: 0 auto;
  padding: 1.5rem 1.25rem 3rem;
}
.units-page__head {
  margin-bottom: 1.25rem;
}
.head-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  flex-wrap: wrap;
  margin-bottom: 0.5rem;
}
.home-link {
  display: inline-block;
  color: var(--accent-text, inherit);
  text-decoration: none;
  font-size: 0.85rem;
}
.home-link:hover { text-decoration: underline; }
.cta-list {
  display: inline-flex;
  align-items: center;
  background: var(--accent, #0c7a4d);
  color: #fff;
  text-decoration: none;
  font-weight: 700;
  font-size: 0.85rem;
  padding: 0.5rem 0.95rem;
  border-radius: var(--radius-sm, 8px);
  box-shadow: var(--shadow-sm, 0 1px 2px rgba(0,0,0,0.12));
  transition: background 0.16s ease;
}
.cta-list:hover { background: var(--accent-600, #0a6641); }
.units-page__head h1 {
  margin: 0 0 0.25rem;
  font-family: var(--display, inherit);
}
.lede {
  margin: 0;
  color: var(--muted, #666);
}
.filters {
  display: flex;
  flex-wrap: wrap;
  align-items: end;
  gap: 1rem;
  margin: 1rem 0;
}
.filter {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  font-size: 0.85rem;
}
.filter select {
  padding: 0.4rem 0.6rem;
  border-radius: var(--radius-sm, 6px);
  border: 1px solid var(--line-strong, #ccc);
}
.clear-btn {
  padding: 0.45rem 0.9rem;
  border-radius: var(--radius-sm, 6px);
  border: 1px solid var(--line-strong, #ccc);
  background: var(--surface, #fff);
  cursor: pointer;
}
.error-line {
  color: #b3261e;
}
.result-count {
  color: var(--muted, #666);
  font-size: 0.85rem;
  margin: 0 0 1rem;
}
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(16rem, 1fr));
  gap: 1.25rem;
}
.empty {
  color: var(--muted, #666);
  padding: 2rem 0;
  text-align: center;
}
</style>
