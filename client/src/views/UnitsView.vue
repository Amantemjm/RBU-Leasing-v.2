<script setup>
import { ref, computed, onMounted } from "vue";
import { useRouter } from "vue-router";
import { units, estates } from "../lib/resource.js";
import { formatPHP } from "../lib/formatters.js";
import { useAuthStore } from "../stores/auth.js";
import ResourceTable from "../components/ResourceTable.vue";

const router = useRouter();
const auth = useAuthStore();
const canWrite = computed(() => ["ADMIN", "LEASING_OFFICER"].includes(auth.role));

const estateList = ref([]); // [{ id, name, towers:[{id,name}] }]
const selectedEstateId = ref(""); // "" = All estates
const selectedTowerId = ref(""); // "" = all towers
const rows = ref([]);

const columns = [
  { key: "unitNumber", label: "Unit #" },
  { key: "type", label: "Type" },
  { key: "baseRent", label: "Base rent", format: formatPHP },
  { key: "status", label: "Status" },
];

const selectedEstate = computed(() => estateList.value.find((e) => e.id === selectedEstateId.value) || null);
const towerFilterOptions = computed(() => (selectedEstate.value ? selectedEstate.value.towers : []));

// Group the fetched units by their tower for display.
const groups = computed(() => {
  const map = new Map();
  for (const u of rows.value) {
    const key = u.tower?.id || "__none__";
    const name = u.tower?.name || "Unassigned (no tower)";
    if (!map.has(key)) map.set(key, { key, name, rows: [] });
    map.get(key).rows.push(u);
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
});

async function load() {
  const params = {};
  if (selectedEstateId.value) params.estateId = selectedEstateId.value;
  if (selectedTowerId.value) params.towerId = selectedTowerId.value;
  rows.value = await units.list(params);
}

function selectEstate(estateId) {
  selectedEstateId.value = estateId;
  selectedTowerId.value = "";
  load();
}

onMounted(async () => {
  estateList.value = await estates.list();
  await load();
});

function remove(row) {
  if (!confirm(`Delete unit "${row.unitNumber}"?`)) return;
  units.remove(row.id).then(load).catch((e) => alert(e.response?.data?.error || "Delete failed"));
}
</script>

<template>
  <section class="units">
    <header>
      <h1>Units</h1>
      <button v-if="canWrite" type="button" @click="router.push('/units/new')">New unit</button>
    </header>

    <div class="tabs">
      <button type="button" :class="{ active: selectedEstateId === '' }" @click="selectEstate('')">All</button>
      <button
        v-for="e in estateList"
        :key="e.id"
        type="button"
        :class="{ active: selectedEstateId === e.id }"
        @click="selectEstate(e.id)"
      >
        {{ e.name }}
      </button>
    </div>

    <div v-if="selectedEstate" class="tower-filter">
      <label>Tower
        <select v-model="selectedTowerId" @change="load">
          <option value="">All towers</option>
          <option v-for="t in towerFilterOptions" :key="t.id" :value="t.id">{{ t.name }}</option>
        </select>
      </label>
    </div>

    <p v-if="rows.length === 0" class="muted">No units.</p>

    <div v-for="g in groups" :key="g.key" class="tower-group">
      <h2>{{ g.name }} <span class="count">{{ g.rows.length }} unit{{ g.rows.length === 1 ? "" : "s" }}</span></h2>
      <ResourceTable
        :columns="columns"
        :rows="g.rows"
        :can-write="canWrite"
        @edit="(row) => router.push(`/units/${row.id}`)"
        @delete="remove"
      />
    </div>
  </section>
</template>

<style scoped>
.tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  border-bottom: 1px solid var(--line);
  margin-bottom: 1.25rem;
  padding-bottom: 0.75rem;
}
.tabs button {
  background: var(--surface);
  color: var(--muted);
  border: 1px solid var(--line-strong);
  padding: 0.45rem 0.9rem;
  font-size: 0.85rem;
}
.tabs button.active {
  background: var(--accent);
  color: #fff;
  border-color: var(--accent);
}
.tower-filter {
  margin-bottom: 1.25rem;
  font-size: 0.8rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--muted);
}
.tower-filter select {
  font-family: inherit;
  text-transform: none;
  letter-spacing: 0;
  margin-left: 0.5rem;
  border: 1px solid var(--line-strong);
  border-radius: var(--radius-sm);
  padding: 0.4rem 0.55rem;
}
.tower-group {
  margin-bottom: 1.75rem;
}
.tower-group h2 {
  font-size: 1rem;
  color: var(--ink-800);
  margin-bottom: 0.6rem;
  display: flex;
  align-items: baseline;
  gap: 0.6rem;
}
.tower-group .count {
  font-size: 0.72rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--muted);
  background: var(--paper);
  border: 1px solid var(--line);
  border-radius: 999px;
  padding: 0.12rem 0.5rem;
}
.muted { color: var(--muted); }
</style>
