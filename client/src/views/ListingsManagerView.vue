<script setup>
// Content Manager → Listings: a card grid of every unit (mirrors the Villas
// tab). Manage opens the photo + details editor; Publish/Unpublish pushes a
// unit to (or from) the public Featured Properties.
import { ref, computed, onMounted, onBeforeUnmount } from "vue";
import { useRouter } from "vue-router";
import { unitListings } from "../lib/resource.js";
import { api } from "../lib/api.js";
import { formatDate } from "../lib/formatters.js";

const router = useRouter();
const rows = ref([]);
const loading = ref(true);
const error = ref("");
const q = ref("");
const busy = ref("");
const covers = ref({}); // unitId -> object URL

function revokeCovers() {
  for (const url of Object.values(covers.value)) { try { URL.revokeObjectURL(url); } catch { /* ignore */ } }
  covers.value = {};
}

async function loadCovers() {
  const next = {};
  for (const r of rows.value) {
    if (!r.coverPhotoId) continue;
    try {
      const res = await api.get(unitListings.staffImageUrl(r.unitId, r.coverPhotoId), { responseType: "blob" });
      const blob = res.data instanceof Blob ? res.data : new Blob([res.data]);
      next[r.unitId] = URL.createObjectURL(blob);
    } catch { /* leave without a cover */ }
  }
  revokeCovers();
  covers.value = next;
}

async function load() {
  loading.value = true;
  error.value = "";
  try {
    rows.value = await unitListings.listAll();
    await loadCovers();
  } catch (e) {
    error.value = e.response?.data?.error || "Could not load listings";
  } finally {
    loading.value = false;
  }
}
onMounted(load);
onBeforeUnmount(revokeCovers);

const filtered = computed(() => {
  const term = q.value.trim().toLowerCase();
  if (!term) return rows.value;
  return rows.value.filter((r) =>
    [r.propertyName, r.unitNumber, r.location].filter(Boolean).some((v) => String(v).toLowerCase().includes(term)));
});
const publishedCount = computed(() => rows.value.filter((r) => r.published).length);

function specs(r) {
  const out = [];
  if (r.type) out.push(r.type);
  if (r.bedrooms != null) out.push(`${r.bedrooms} BR`);
  if (r.bathrooms != null) out.push(`${r.bathrooms} BA`);
  if (r.floorArea != null) out.push(`${r.floorArea} sqm`);
  return out;
}
function rate(r) { return r.rentalRate != null ? `PHP ${Number(r.rentalRate).toLocaleString("en-PH")}` : null; }
function canPublish(r) { return r.approvalStatus === "APPROVED" && r.photoCount > 0; }

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

    <p v-if="loading" class="muted">Loading…</p>
    <p v-else-if="!filtered.length" class="muted">No listings match your search.</p>

    <div v-else class="grid">
      <article v-for="r in filtered" :key="r.unitId" class="vcard">
        <div class="cover">
          <img v-if="covers[r.unitId]" :src="covers[r.unitId]" :alt="r.propertyName || 'Unit'" />
          <div v-else class="cover__ph" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" stroke-width="1.3"><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="8.5" cy="9.5" r="1.6" /><path d="m4 18 5-5 4 4 3-3 4 4" /></svg>
          </div>
          <div class="badges">
            <span :class="['pill', r.published ? 'pill--pub' : 'pill--draft']">{{ r.published ? "Published" : "Draft" }}</span>
            <span :class="['pill pill--appr', r.approvalStatus.toLowerCase()]">{{ r.approvalStatus }}</span>
          </div>
          <span class="photos">{{ r.photoCount }} photo{{ r.photoCount === 1 ? "" : "s" }}</span>
        </div>

        <div class="vbody">
          <h3 class="title">{{ r.propertyName || "Unit" }}</h3>
          <p class="loc">Unit {{ r.unitNumber }}<template v-if="r.location"> · {{ r.location }}</template></p>
          <p v-if="specs(r).length" class="specs">
            <span v-for="s in specs(r)" :key="s" class="spec">{{ s }}</span>
          </p>
          <p v-if="rate(r)" class="rate">{{ rate(r) }}<span class="per"> / mo</span></p>
          <p class="updated">Updated {{ formatDate(r.updatedAt) }}</p>
        </div>

        <div class="vfoot">
          <button type="button" class="secondary" @click="manage(r)">Manage</button>
          <button
            type="button"
            :class="r.published ? 'danger' : 'primary'"
            :disabled="busy === r.unitId || (!r.published && !canPublish(r))"
            :title="!r.published && r.approvalStatus !== 'APPROVED' ? 'Unit must be approved' : (!r.published && r.photoCount === 0 ? 'Add at least one photo' : '')"
            @click="togglePublish(r)">
            {{ r.published ? "Unpublish" : "Publish" }}
          </button>
        </div>
      </article>
    </div>
  </section>
</template>

<style scoped>
.eyebrow { margin: 0 0 0.15rem; font-size: 0.66rem; text-transform: uppercase; letter-spacing: 0.14em; font-weight: 700; color: var(--accent-text); }
.search { min-width: 16rem; padding: 0.5rem 0.75rem; border: 1px solid var(--line-strong); border-radius: var(--radius-sm); background: var(--surface); font: inherit; color: var(--text); }
.lede { margin: 0 0 1.25rem; color: var(--muted); font-size: 0.9rem; }
.error { color: var(--danger); background: var(--danger-050); border-radius: var(--radius-sm); padding: 0.55rem 0.8rem; margin: 0 0 1rem; }
.muted { color: var(--muted); }

.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(270px, 1fr)); gap: clamp(1rem, 2vw, 1.4rem); }
.vcard {
  display: flex; flex-direction: column;
  background: var(--surface); border: 1px solid var(--line); border-radius: 14px; overflow: hidden;
  box-shadow: var(--shadow-sm);
  transition: transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease;
}
.vcard:hover { transform: translateY(-4px); box-shadow: var(--shadow-lg); border-color: var(--line-strong); }
.cover { position: relative; aspect-ratio: 4 / 3; background: var(--paper); overflow: hidden; }
.cover img { width: 100%; height: 100%; object-fit: cover; display: block; }
.cover__ph { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; color: var(--muted); }
.badges { position: absolute; top: 0.55rem; left: 0.55rem; display: flex; flex-wrap: wrap; gap: 0.3rem; }
.photos { position: absolute; bottom: 0.55rem; right: 0.55rem; font-size: 0.68rem; font-weight: 600; color: #fff; background: rgba(11, 44, 33, 0.72); padding: 0.15rem 0.5rem; border-radius: 999px; }
.pill { font-size: 0.66rem; font-weight: 700; letter-spacing: 0.03em; padding: 0.18rem 0.5rem; border-radius: 999px; }
.pill--pub { color: var(--on-accent); background: var(--accent); }
.pill--draft { color: var(--ink-700); background: rgba(255, 255, 255, 0.92); }
.pill--appr { text-transform: capitalize; color: var(--ink-700); background: rgba(255, 255, 255, 0.92); }
.pill--appr.approved { color: var(--good); }
.pill--appr.rejected { color: var(--danger); }

.vbody { padding: 0.85rem 1rem 0.5rem; display: flex; flex-direction: column; gap: 0.25rem; flex: 1; }
.title { margin: 0; font-family: var(--display, Georgia, serif); font-size: 1.1rem; font-weight: 600; color: var(--ink-800); line-height: 1.25; }
.loc { margin: 0; color: var(--muted); font-size: 0.82rem; }
.specs { display: flex; flex-wrap: wrap; gap: 0.35rem; margin: 0.4rem 0 0; }
.spec { font-size: 0.74rem; font-weight: 600; color: var(--ink-700); background: var(--paper); border: 1px solid var(--line); border-radius: 999px; padding: 0.14rem 0.5rem; }
.rate { margin: 0.4rem 0 0; font-family: var(--display, Georgia, serif); font-size: 1.05rem; font-weight: 600; color: var(--accent-text); }
.rate .per { font-size: 0.72rem; font-weight: 500; color: var(--muted); }
.updated { margin: 0.35rem 0 0; font-size: 0.72rem; color: var(--muted); }
.vfoot { display: flex; gap: 0.4rem; padding: 0.65rem 1rem 0.9rem; }
.vfoot button { flex: 1; padding: 0.45rem 0.6rem; font-size: 0.83rem; }
</style>
