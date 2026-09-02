<script setup>
// Content Manager → Listings: a central table of every unit's listing/publish
// state. Manage opens the per-unit photo + details editor; Publish/Unpublish
// pushes a unit to (or from) the public Featured Properties.
import { ref, computed, onMounted } from "vue";
import { useRouter } from "vue-router";
import { unitListings } from "../lib/resource.js";
import { formatDate } from "../lib/formatters.js";

const router = useRouter();
const rows = ref([]);
const loading = ref(true);
const error = ref("");
const q = ref("");
const busy = ref("");

async function load() {
  loading.value = true;
  error.value = "";
  try { rows.value = await unitListings.listAll(); }
  catch (e) { error.value = e.response?.data?.error || "Could not load listings"; }
  finally { loading.value = false; }
}
onMounted(load);

const filtered = computed(() => {
  const term = q.value.trim().toLowerCase();
  if (!term) return rows.value;
  return rows.value.filter((r) =>
    [r.propertyName, r.unitNumber, r.location].filter(Boolean).some((v) => String(v).toLowerCase().includes(term)));
});
const publishedCount = computed(() => rows.value.filter((r) => r.published).length);

function manage(row) { router.push(`/app/units/${row.unitId}/listing`); }

async function togglePublish(row) {
  busy.value = row.unitId;
  error.value = "";
  try {
    if (row.published) await unitListings.unpublish(row.unitId);
    else await unitListings.publish(row.unitId);
    await load();
  } catch (e) {
    error.value = e.response?.data?.error || "Action failed";
  } finally {
    busy.value = "";
  }
}
</script>

<template>
  <section>
    <header>
      <div>
        <p class="eyebrow">Content Manager</p>
        <h1>Listings</h1>
      </div>
      <input v-model="q" type="search" class="search" placeholder="Search property, unit, or location…" aria-label="Search listings" />
    </header>

    <p class="lede">Manage each unit's photos and details, then publish it to the public Featured Properties. {{ publishedCount }} of {{ rows.length }} published.</p>
    <p v-if="error" class="error">{{ error }}</p>

    <div class="panel">
      <table class="listings">
        <thead>
          <tr>
            <th>Property / Unit</th><th>Location</th><th>Status</th><th class="num">Photos</th><th>Updated</th><th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="loading"><td colspan="6" class="muted">Loading…</td></tr>
          <tr v-else-if="!filtered.length"><td colspan="6" class="muted">No listings match your search.</td></tr>
          <tr v-for="r in filtered" :key="r.unitId">
            <td>
              <span class="prop">{{ r.propertyName || "Unit" }}</span>
              <span class="unit">Unit {{ r.unitNumber }}</span>
            </td>
            <td>{{ r.location || "—" }}</td>
            <td class="statuses">
              <span :class="['pill', r.published ? 'pill--pub' : 'pill--draft']">{{ r.published ? "Published" : "Draft" }}</span>
              <span :class="['pill pill--appr', r.approvalStatus.toLowerCase()]">{{ r.approvalStatus }}</span>
            </td>
            <td class="num">{{ r.photoCount }}</td>
            <td>{{ formatDate(r.updatedAt) }}</td>
            <td class="actions">
              <button type="button" class="secondary" @click="manage(r)">Manage</button>
              <button
                type="button"
                :class="r.published ? 'danger' : 'primary'"
                :disabled="busy === r.unitId || (!r.published && (r.approvalStatus !== 'APPROVED' || r.photoCount === 0))"
                :title="!r.published && r.approvalStatus !== 'APPROVED' ? 'Unit must be approved' : (!r.published && r.photoCount === 0 ? 'Add at least one photo' : '')"
                @click="togglePublish(r)">
                {{ r.published ? "Unpublish" : "Publish" }}
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>

<style scoped>
.eyebrow { margin: 0 0 0.15rem; font-size: 0.66rem; text-transform: uppercase; letter-spacing: 0.14em; font-weight: 700; color: var(--accent-text); }
.search { min-width: 16rem; padding: 0.5rem 0.75rem; border: 1px solid var(--line-strong); border-radius: var(--radius-sm); background: var(--surface); font: inherit; color: var(--text); }
.lede { margin: 0 0 1rem; color: var(--muted); font-size: 0.9rem; }
.error { color: var(--danger); background: var(--danger-050); border-radius: var(--radius-sm); padding: 0.55rem 0.8rem; margin: 0 0 1rem; }
.panel { padding: 0; overflow: hidden; }
.listings { width: 100%; border-collapse: collapse; }
.listings th, .listings td { text-align: left; padding: 0.7rem 1rem; border-bottom: 1px solid var(--line); vertical-align: middle; }
.listings th { font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.06em; color: var(--muted); font-weight: 700; background: var(--paper); }
.listings tr:last-child td { border-bottom: none; }
.num { text-align: right; font-variant-numeric: tabular-nums; }
.muted { color: var(--muted); text-align: center; padding: 1.5rem; }
.prop { display: block; font-weight: 600; color: var(--ink-800); }
.unit { display: block; font-size: 0.82rem; color: var(--muted); }
.statuses { display: flex; flex-wrap: wrap; gap: 0.35rem; }
.pill { font-size: 0.68rem; font-weight: 700; letter-spacing: 0.03em; padding: 0.18rem 0.5rem; border-radius: 999px; border: 1px solid var(--line); }
.pill--pub { color: #fff; background: var(--accent); border-color: transparent; }
.pill--draft { color: var(--muted); background: var(--paper); }
.pill--appr { text-transform: capitalize; color: var(--muted); }
.pill--appr.approved { color: var(--good); border-color: var(--good); }
.pill--appr.rejected { color: var(--danger); border-color: var(--danger); }
.pill--appr.submitted { color: var(--accent-text); border-color: var(--accent-text); }
.actions { display: flex; gap: 0.4rem; justify-content: flex-end; }
.actions button { padding: 0.4rem 0.8rem; font-size: 0.82rem; }
</style>
