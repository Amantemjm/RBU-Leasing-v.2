<script setup>
// Public unit detail page: photo carousel + full catalog details for a
// single published listing. Sub-project J.
import { ref, computed, onMounted } from "vue";
import { useRoute } from "vue-router";
import { publicUnits } from "../lib/resource.js";
import { orderedDetails } from "../lib/listingFormat.js";

const route = useRoute();

const unit = ref(null);
const notFound = ref(false);
const index = ref(0);
const broken = ref(false);

async function load() {
  try {
    unit.value = await publicUnits.get(route.params.id);
    const ids = unit.value.photoIds || [];
    const i = ids.indexOf(unit.value.coverPhotoId);
    index.value = i >= 0 ? i : 0;
  } catch (e) {
    notFound.value = true;
  }
}

onMounted(load);

const photoIds = computed(() => unit.value?.photoIds || []);
const current = computed(() => photoIds.value[index.value]);
const hasPhoto = computed(() => photoIds.value.length > 0 && !broken.value);
const showArrows = computed(() => photoIds.value.length > 1);

const currentCaption = computed(() => {
  const photo = (unit.value?.photos || []).find((p) => p.id === current.value);
  return photo?.caption || "";
});

function step(n) {
  const len = photoIds.value.length;
  if (len === 0) return;
  index.value = (index.value + n + len) % len;
  broken.value = false;
}
function prev() { step(-1); }
function next() { step(1); }
function goTo(i) {
  index.value = i;
  broken.value = false;
}

const title = computed(() => unit.value?.headline || unit.value?.details?.propertyName || "Unit");
const details = computed(() => orderedDetails(unit.value?.details, { exclude: ["location"] }));
</script>

<template>
  <div class="unit-detail-page">
    <RouterLink to="/units-for-lease" class="back-link">&larr; Back to Available Units</RouterLink>

    <p v-if="notFound" class="not-found">This unit is no longer available.</p>

    <template v-else-if="unit">
      <div class="carousel">
        <div class="carousel__main">
          <img
            v-if="hasPhoto"
            :src="publicUnits.photoUrl(current)"
            :alt="title"
            @error="broken = true"
          />
          <div v-else class="placeholder">No photo available</div>

          <template v-if="showArrows">
            <button type="button" class="arrow arrow--prev" aria-label="Previous photo" @click="prev">&#9664;</button>
            <button type="button" class="arrow arrow--next" aria-label="Next photo" @click="next">&#9654;</button>
          </template>
        </div>

        <p v-if="currentCaption" class="caption">{{ currentCaption }}</p>

        <div v-if="showArrows" class="thumbs">
          <button
            v-for="(id, i) in photoIds"
            :key="id"
            type="button"
            class="thumb"
            :class="{ 'thumb--active': i === index }"
            :aria-label="`Photo ${i + 1}`"
            @click="goTo(i)"
          >
            <img :src="publicUnits.photoUrl(id)" alt="" />
          </button>
        </div>
      </div>

      <div class="info">
        <h1 class="headline">{{ title }}</h1>
        <p v-if="unit.location" class="location">{{ unit.location }}</p>

        <dl class="specs">
          <template v-for="d in details" :key="d.key">
            <dt>{{ d.label }}</dt>
            <dd>{{ d.value }}</dd>
          </template>
        </dl>
      </div>
    </template>
  </div>
</template>

<style scoped>
.unit-detail-page {
  max-width: 56rem;
  margin: 0 auto;
  padding: 1.5rem 1.25rem 3rem;
}
.back-link {
  display: inline-block;
  margin-bottom: 1rem;
  color: var(--accent-text, inherit);
  text-decoration: none;
  font-size: 0.85rem;
}
.not-found {
  color: var(--muted, #666);
  padding: 2rem 0;
  text-align: center;
}
.carousel__main {
  position: relative;
  width: 100%;
  height: 22rem;
  background: var(--paper);
  border-radius: var(--radius);
  overflow: hidden;
}
.carousel__main img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--muted);
}
.arrow {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  background: var(--surface);
  color: var(--ink-700);
  border: 1px solid var(--line-strong);
  border-radius: 999px;
  width: 2.5rem;
  height: 2.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  padding: 0;
  line-height: 1;
}
.arrow--prev { left: 0.75rem; }
.arrow--next { right: 0.75rem; }
.caption {
  margin: 0.5rem 0 0;
  color: var(--muted, #666);
  font-size: 0.9rem;
  font-style: italic;
}
.thumbs {
  display: flex;
  gap: 0.5rem;
  margin-top: 0.75rem;
  flex-wrap: wrap;
}
.thumb {
  width: 4rem;
  height: 3rem;
  padding: 0;
  border: 2px solid transparent;
  border-radius: var(--radius-sm);
  overflow: hidden;
  cursor: pointer;
  background: none;
}
.thumb--active {
  border-color: var(--accent);
}
.thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.info {
  margin-top: 1.5rem;
}
.headline {
  margin: 0 0 0.25rem;
  font-family: var(--display, inherit);
}
.location {
  margin: 0 0 1rem;
  color: var(--muted, #666);
}
.specs {
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: 0.4rem 1rem;
  margin: 0;
}
.specs dt {
  color: var(--muted, #666);
  font-weight: 600;
}
.specs dd {
  margin: 0;
}
</style>
