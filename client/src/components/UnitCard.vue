<script setup>
// Reusable public-facing card for a published unit listing: photo carousel
// plus a labelled summary of catalog details. Used by the Available Units
// grid (sub-project J).
import { computed, ref, watch } from "vue";
import { publicUnits } from "../lib/resource.js";
import { orderedDetails } from "../lib/listingFormat.js";

defineOptions({ name: "UnitCard" });

const props = defineProps({
  card: { type: Object, required: true },
});

const broken = ref(false);

function startIndex() {
  const ids = props.card.photoIds || [];
  const i = ids.indexOf(props.card.coverPhotoId);
  return i >= 0 ? i : 0;
}

const index = ref(startIndex());

watch(
  () => props.card,
  () => {
    index.value = startIndex();
    broken.value = false;
  }
);

const photoIds = computed(() => props.card.photoIds || []);
const current = computed(() => photoIds.value[index.value]);
const hasPhoto = computed(() => photoIds.value.length > 0 && !broken.value);
const showArrows = computed(() => photoIds.value.length > 1);

function step(n) {
  const len = photoIds.value.length;
  if (len === 0) return;
  index.value = (index.value + n + len) % len;
  broken.value = false;
}
function prev() { step(-1); }
function next() { step(1); }

const title = computed(() => {
  const c = props.card;
  return c.headline || c.details?.propertyName || c.details?.unitNumber || "Unit";
});

const details = computed(() => orderedDetails(props.card.details));
</script>

<template>
  <div class="unit-card">
    <div class="photo">
      <img
        v-if="hasPhoto"
        :src="publicUnits.photoUrl(current)"
        :alt="card.headline || 'Unit photo'"
        @error="broken = true"
      />
      <div v-else class="placeholder">No photo available</div>

      <template v-if="showArrows">
        <button type="button" class="arrow arrow--prev" aria-label="Previous photo" @click="prev">◀</button>
        <button type="button" class="arrow arrow--next" aria-label="Next photo" @click="next">▶</button>
        <div class="counter">{{ index + 1 }} / {{ photoIds.length }}</div>
      </template>
    </div>

    <div class="body">
      <h3 class="title">{{ title }}</h3>
      <p v-if="card.location" class="location">{{ card.location }}</p>
      <ul class="details">
        <li v-for="d in details" :key="d.key">
          <span class="details__label">{{ d.label }}:</span> {{ d.value }}
        </li>
      </ul>
      <RouterLink :to="`/units-for-lease/${card.unitId}`" class="view-details">View details</RouterLink>
    </div>
  </div>
</template>

<style scoped>
.unit-card {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
.photo {
  position: relative;
  width: 100%;
  height: 12rem;
  background: var(--paper);
  overflow: hidden;
}
.photo img {
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
  font-size: 0.85rem;
}
.arrow {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  background: var(--surface);
  color: var(--ink-700);
  border: 1px solid var(--line-strong);
  border-radius: 999px;
  width: 2rem;
  height: 2rem;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  padding: 0;
  line-height: 1;
}
.arrow--prev { left: 0.5rem; }
.arrow--next { right: 0.5rem; }
.counter {
  position: absolute;
  bottom: 0.4rem;
  right: 0.5rem;
  background: rgba(0, 0, 0, 0.55);
  color: #fff;
  font-size: 0.7rem;
  padding: 0.1rem 0.45rem;
  border-radius: 999px;
}
.body {
  padding: 0.85rem 1rem 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  flex: 1;
}
.title {
  margin: 0;
  font-size: 1rem;
  font-weight: 650;
}
.location {
  margin: 0;
  color: var(--muted);
  font-size: 0.85rem;
}
.details {
  list-style: none;
  margin: 0.4rem 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  font-size: 0.85rem;
}
.details__label {
  color: var(--muted);
  font-weight: 600;
}
.view-details {
  margin-top: 0.6rem;
  align-self: flex-start;
  background: var(--accent);
  color: #fff;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  padding: 0.45rem 0.9rem;
  font-weight: 550;
  text-decoration: none;
  box-shadow: var(--shadow-sm);
}
.view-details:hover {
  background: var(--accent-600);
}
</style>
