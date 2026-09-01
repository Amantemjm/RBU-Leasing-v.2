<script setup>
import { ref, reactive, onMounted, onBeforeUnmount } from "vue";
import { useRoute, useRouter } from "vue-router";
import { unitListings } from "../lib/resource.js";
import { api } from "../lib/api.js";
import { UNIT_LISTING_FIELDS } from "../../../shared/unitListingFields.js";
import { formatDate } from "../lib/formatters.js";

const route = useRoute();
const router = useRouter();
const unitId = route.params.id;

const unit = ref(null);
const listing = ref(null);
const photos = ref([]);
const error = ref("");
const loading = ref(true);
const saving = ref(false);
const publishing = ref(false);

const headline = ref("");
const details = reactive({});
const visibleFields = ref([]);
// key -> comma-separated text for "list"-type fields
const listText = reactive({});

const photoUrls = ref({}); // photoId -> objectURL
const previewIndex = ref(0);

function revokeAll() {
  for (const url of Object.values(photoUrls.value)) {
    try { URL.revokeObjectURL(url); } catch { /* ignore */ }
  }
  photoUrls.value = {};
}

async function loadPhotoBlobs() {
  const entries = {};
  for (const p of photos.value) {
    try {
      const res = await api.get(unitListings.staffImageUrl(unitId, p.id), { responseType: "blob" });
      const blob = res.data instanceof Blob ? res.data : new Blob([res.data]);
      entries[p.id] = URL.createObjectURL(blob);
    } catch { /* skip photo that fails to load */ }
  }
  revokeAll();
  photoUrls.value = entries;
}

function applyDetailsToLocal() {
  const d = listing.value?.details || {};
  for (const f of UNIT_LISTING_FIELDS) {
    const v = d[f.key];
    if (f.type === "list") {
      details[f.key] = Array.isArray(v) ? v : [];
      listText[f.key] = Array.isArray(v) ? v.join(", ") : "";
    } else {
      details[f.key] = v ?? "";
    }
  }
}

function onListTextBlur(key) {
  details[key] = listText[key]
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

async function load() {
  error.value = "";
  try {
    const res = await unitListings.get(unitId);
    unit.value = res.unit;
    listing.value = res.listing;
    photos.value = res.photos || [];
    headline.value = res.listing?.headline || "";
    visibleFields.value = Array.isArray(res.listing?.visibleFields) ? [...res.listing.visibleFields] : [];
    applyDetailsToLocal();
    if (previewIndex.value >= photos.value.length) previewIndex.value = 0;
    await loadPhotoBlobs();
  } catch (e) {
    error.value = e.response?.data?.error || "Could not load this listing";
  } finally {
    loading.value = false;
  }
}

onMounted(load);
onBeforeUnmount(revokeAll);

function isFieldVisible(key) {
  return visibleFields.value.includes(key);
}
function toggleVisible(key) {
  if (isFieldVisible(key)) visibleFields.value = visibleFields.value.filter((k) => k !== key);
  else visibleFields.value = [...visibleFields.value, key];
}

async function save() {
  error.value = "";
  saving.value = true;
  try {
    const payload = { details: { ...details }, visibleFields: [...visibleFields.value], headline: headline.value || null };
    await unitListings.update(unitId, payload);
    await load();
  } catch (e) {
    error.value = e.response?.data?.error || "Save failed";
  } finally {
    saving.value = false;
  }
}

async function onFileChange(evt) {
  const file = evt.target.files?.[0];
  evt.target.value = "";
  if (!file) return;
  error.value = "";
  try {
    await unitListings.addPhoto(unitId, file);
    await load();
  } catch (e) {
    error.value = e.response?.data?.error || "Upload failed";
  }
}

async function setCover(photoId) {
  error.value = "";
  try {
    await unitListings.setCover(unitId, photoId);
    await load();
  } catch (e) {
    error.value = e.response?.data?.error || "Could not set cover photo";
  }
}

async function saveCaption(photo) {
  error.value = "";
  try {
    await unitListings.caption(unitId, photo.id, photo.caption || null);
    await load();
  } catch (e) {
    error.value = e.response?.data?.error || "Could not save caption";
  }
}

async function removePhoto(photoId) {
  error.value = "";
  try {
    await unitListings.deletePhoto(unitId, photoId);
    await load();
  } catch (e) {
    error.value = e.response?.data?.error || "Could not delete photo";
  }
}

async function move(index, dir) {
  const to = index + dir;
  if (to < 0 || to >= photos.value.length) return;
  const ordered = [...photos.value];
  const [item] = ordered.splice(index, 1);
  ordered.splice(to, 0, item);
  const orderedIds = ordered.map((p) => p.id);
  error.value = "";
  try {
    await unitListings.reorder(unitId, orderedIds);
    await load();
  } catch (e) {
    error.value = e.response?.data?.error || "Could not reorder photos";
  }
}

function prevPreview() {
  if (photos.value.length === 0) return;
  previewIndex.value = (previewIndex.value - 1 + photos.value.length) % photos.value.length;
}
function nextPreview() {
  if (photos.value.length === 0) return;
  previewIndex.value = (previewIndex.value + 1) % photos.value.length;
}

async function togglePublish() {
  error.value = "";
  publishing.value = true;
  try {
    if (listing.value?.published) await unitListings.unpublish(unitId);
    else await unitListings.publish(unitId);
    await load();
  } catch (e) {
    error.value = e.response?.data?.error || "Could not update publish state";
  } finally {
    publishing.value = false;
  }
}
</script>

<template>
  <section class="unit-listing">
    <header>
      <h1>Listing &amp; photos<span v-if="unit"> — {{ unit.unitNumber }}</span></h1>
      <button type="button" class="ghost" @click="router.push('/app/units/' + unitId)">Back to unit</button>
    </header>

    <p v-if="error" class="error">{{ error }}</p>

    <template v-if="!loading && unit && listing">
      <section class="panel publish-panel">
        <div class="publish-status">
          <span :class="['status-tag', listing.published ? 'published' : 'draft']">
            {{ listing.published ? "Published" : "Draft" }}
          </span>
          <span v-if="listing.published && listing.publishedAt" class="muted">
            since {{ formatDate(listing.publishedAt) }}
          </span>
        </div>
        <button
          type="button"
          class="primary"
          :disabled="publishing || (!listing.published && photos.length === 0)"
          :title="!listing.published && photos.length === 0 ? 'Add at least one photo before publishing' : ''"
          @click="togglePublish"
        >
          {{ listing.published ? "Unpublish" : "Publish" }}
        </button>
      </section>

      <section class="panel">
        <h2>Photos</h2>
        <input type="file" accept="image/*" @change="onFileChange" />

        <div v-if="photos.length" class="preview">
          <button type="button" class="ghost" @click="prevPreview">◀</button>
          <div class="preview-frame">
            <img v-if="photoUrls[photos[previewIndex]?.id]" :src="photoUrls[photos[previewIndex]?.id]" alt="Unit photo preview" />
          </div>
          <button type="button" class="ghost" @click="nextPreview">▶</button>
        </div>

        <div class="grid">
          <div v-for="(p, i) in photos" :key="p.id" class="photo-card">
            <div class="thumb">
              <img v-if="photoUrls[p.id]" :src="photoUrls[p.id]" alt="Unit photo" />
            </div>
            <input
              class="caption"
              type="text"
              placeholder="Caption"
              v-model="p.caption"
              @blur="saveCaption(p)"
            />
            <div class="photo-actions">
              <button
                type="button"
                :class="['ghost', { active: listing.coverPhotoId === p.id }]"
                @click="setCover(p.id)"
              >
                {{ listing.coverPhotoId === p.id ? "★ Cover" : "Set cover" }}
              </button>
              <button type="button" class="ghost" :disabled="i === 0" @click="move(i, -1)">↑</button>
              <button type="button" class="ghost" :disabled="i === photos.length - 1" @click="move(i, 1)">↓</button>
              <button type="button" class="danger" @click="removePhoto(p.id)">Delete</button>
            </div>
          </div>
          <p v-if="photos.length === 0" class="muted">No photos yet.</p>
        </div>
      </section>

      <section class="panel">
        <h2>Details</h2>
        <div class="field">
          <label for="headline">Headline</label>
          <input id="headline" type="text" v-model="headline" />
        </div>

        <div v-for="f in UNIT_LISTING_FIELDS" :key="f.key" class="field">
          <label :for="f.key">{{ f.label }}</label>
          <textarea v-if="f.type === 'textarea'" :id="f.key" v-model="details[f.key]" rows="3"></textarea>
          <input
            v-else-if="f.type === 'number'"
            :id="f.key"
            type="number"
            v-model="details[f.key]"
          />
          <input
            v-else-if="f.type === 'list'"
            :id="f.key"
            type="text"
            v-model="listText[f.key]"
            placeholder="Comma-separated"
            @blur="onListTextBlur(f.key)"
          />
          <input v-else :id="f.key" type="text" v-model="details[f.key]" />
        </div>

        <h3>Visible on card</h3>
        <div class="visible-fields">
          <label v-for="f in UNIT_LISTING_FIELDS" :key="f.key" class="checkbox">
            <input type="checkbox" :checked="isFieldVisible(f.key)" @change="toggleVisible(f.key)" />
            {{ f.label }}
          </label>
        </div>

        <div class="form-actions">
          <button type="button" class="primary" :disabled="saving" @click="save">Save</button>
        </div>
      </section>
    </template>
  </section>
</template>

<style scoped>
.unit-listing header { display: flex; align-items: center; justify-content: space-between; gap: 1rem; }
.panel {
  background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius);
  padding: 1rem 1.25rem; margin: 1rem 0;
}
.muted { color: var(--muted); }
.publish-panel { display: flex; align-items: center; justify-content: space-between; gap: 1rem; }
.publish-status { display: flex; align-items: center; gap: 0.6rem; }
.status-tag {
  font-size: 0.66rem; text-transform: uppercase; letter-spacing: 0.06em; font-weight: 700;
  padding: 0.15rem 0.45rem; border-radius: 999px; background: var(--paper); border: 1px solid var(--line); color: var(--muted);
}
.status-tag.published { color: #fff; background: var(--good); border-color: var(--good); }
.status-tag.draft { color: var(--warn); border-color: var(--warn); }
.preview { display: flex; align-items: center; gap: 0.75rem; margin: 0.75rem 0; }
.preview-frame {
  width: 100%; max-width: 24rem; height: 14rem; display: flex; align-items: center; justify-content: center;
  background: var(--paper); border: 1px solid var(--line); border-radius: var(--radius-sm); overflow: hidden;
}
.preview-frame img { max-width: 100%; max-height: 100%; object-fit: contain; }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(11rem, 1fr)); gap: 0.75rem; margin-top: 0.75rem; }
.photo-card { border: 1px solid var(--line); border-radius: var(--radius-sm); padding: 0.5rem; display: flex; flex-direction: column; gap: 0.4rem; }
.thumb { width: 100%; height: 7rem; background: var(--paper); border-radius: var(--radius-sm); overflow: hidden; display: flex; align-items: center; justify-content: center; }
.thumb img { width: 100%; height: 100%; object-fit: cover; }
.caption { font: inherit; padding: 0.3rem 0.4rem; border: 1px solid var(--line-strong); border-radius: var(--radius-sm); }
.photo-actions { display: flex; flex-wrap: wrap; gap: 0.3rem; }
.field { display: flex; flex-direction: column; gap: 0.35rem; margin: 0.6rem 0; }
.field label { font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.06em; font-weight: 600; color: var(--muted); }
.field input, .field textarea {
  font-family: inherit; font-size: 0.95rem; color: var(--text); background: var(--surface);
  border: 1px solid var(--line-strong); border-radius: var(--radius-sm); padding: 0.5rem 0.65rem; width: 100%;
}
.visible-fields { display: flex; flex-wrap: wrap; gap: 0.6rem 1rem; margin: 0.5rem 0 1rem; }
.checkbox { display: flex; align-items: center; gap: 0.4rem; font-size: 0.9rem; }
.form-actions { display: flex; justify-content: flex-end; }
.primary { background: var(--accent); color: #fff; border: 1px solid transparent; box-shadow: var(--shadow-sm); border-radius: var(--radius-sm); padding: 0.55rem 1rem; font: inherit; font-weight: 550; cursor: pointer; }
.primary:hover:not(:disabled) { background: var(--accent-600); }
.primary:disabled { opacity: 0.55; cursor: not-allowed; }
.ghost { background: var(--surface); color: var(--ink-700); border: 1px solid var(--line-strong); border-radius: var(--radius-sm); padding: 0.4rem 0.75rem; font: inherit; cursor: pointer; }
.ghost.active { border-color: var(--accent); color: var(--accent-text); font-weight: 600; }
.ghost:disabled { opacity: 0.5; cursor: not-allowed; }
.danger { background: var(--surface); color: var(--danger); border: 1px solid var(--danger); border-radius: var(--radius-sm); padding: 0.4rem 0.75rem; font: inherit; font-weight: 550; cursor: pointer; }
.danger:hover { background: var(--danger-050); }
</style>
