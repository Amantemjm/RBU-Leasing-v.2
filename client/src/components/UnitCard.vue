<script setup>
// Public-facing property card for a published unit listing: a photo carousel,
// a price-forward summary, and an icon spec row. Used by the Available Units
// grid. All content comes from the public listing DTO (no auth).
import { computed, ref, watch } from "vue";
import { publicUnits } from "../lib/resource.js";
import { formatDetail } from "../lib/listingFormat.js";

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

const d = computed(() => props.card.details || {});
const has = (k) => d.value[k] != null && d.value[k] !== "";

const title = computed(() => {
  const c = props.card;
  return c.headline || c.details?.propertyName || c.details?.unitNumber || "Unit";
});
const price = computed(() => (has("rentalRate") ? formatDetail("rentalRate", d.value.rentalRate) : null));
const typeChip = computed(() => props.card.type || d.value.unitType || null);
const amenities = computed(() => (Array.isArray(d.value.amenities) ? d.value.amenities.slice(0, 3) : []));
</script>

<template>
  <article class="unit-card">
    <div class="photo">
      <img
        v-if="hasPhoto"
        :src="publicUnits.photoUrl(current)"
        :alt="title"
        loading="lazy"
        @error="broken = true"
      />
      <div v-else class="placeholder" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" stroke-width="1.4">
          <rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="8.5" cy="9.5" r="1.6" /><path d="m4 18 5-5 4 4 3-3 4 4" />
        </svg>
        <span>No photo yet</span>
      </div>

      <span v-if="typeChip" class="type-chip">{{ typeChip }}</span>

      <template v-if="showArrows">
        <button type="button" class="arrow arrow--prev" aria-label="Previous photo" @click="prev">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6" /></svg>
        </button>
        <button type="button" class="arrow arrow--next" aria-label="Next photo" @click="next">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6" /></svg>
        </button>
        <div class="dots" aria-hidden="true">
          <span v-for="(p, i) in photoIds" :key="p" :class="['dot', { on: i === index }]"></span>
        </div>
      </template>
    </div>

    <div class="body">
      <p v-if="price" class="price">{{ price }}<span class="per">/mo</span></p>
      <p v-else class="price price--tba">Rate on request</p>

      <h3 class="title">{{ title }}</h3>

      <p v-if="card.location" class="location">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" /><circle cx="12" cy="10" r="3" /></svg>
        {{ card.location }}
      </p>

      <div class="specs">
        <span v-if="has('bedrooms')" class="spec">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 17v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5M2 17h20M2 17v3M22 17v3M6 10V8a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v2" /></svg>
          {{ d.bedrooms }} <span class="spec__u">bd</span>
        </span>
        <span v-if="has('bathrooms')" class="spec">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12h16v3a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4v-3ZM6 12V6a2 2 0 0 1 2-2 2 2 0 0 1 2 2M6 19l-1 2M18 19l1 2" /></svg>
          {{ d.bathrooms }} <span class="spec__u">ba</span>
        </span>
        <span v-if="has('floorArea')" class="spec">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 4h16v16H4zM4 9h4M4 15h4M9 4v4M15 4v4" /></svg>
          {{ d.floorArea }} <span class="spec__u">sqm</span>
        </span>
      </div>

      <ul v-if="amenities.length" class="amenities">
        <li v-for="a in amenities" :key="a">{{ a }}</li>
      </ul>

      <RouterLink :to="`/units-for-lease/${card.unitId}`" class="view-details">
        View details
        <svg viewBox="0 0 16 16" width="14" height="14" fill="none" aria-hidden="true"><path d="M3 8h9M8.5 4l4 4-4 4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" /></svg>
      </RouterLink>
    </div>
  </article>
</template>

<style scoped>
.unit-card {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  box-shadow: var(--shadow-sm);
  transition: transform 0.2s cubic-bezier(0.22, 1, 0.36, 1), box-shadow 0.2s ease, border-color 0.2s ease;
}
.unit-card:hover {
  transform: translateY(-4px);
  box-shadow: var(--shadow-lg);
  border-color: var(--line-strong);
}
.photo {
  position: relative;
  width: 100%;
  aspect-ratio: 4 / 3;
  background: var(--paper);
  overflow: hidden;
}
.photo img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  transition: transform 0.5s cubic-bezier(0.22, 1, 0.36, 1);
}
.unit-card:hover .photo img { transform: scale(1.05); }
.placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.35rem;
  color: var(--muted);
  font-size: 0.8rem;
}
.type-chip {
  position: absolute;
  top: 0.6rem;
  left: 0.6rem;
  background: rgba(12, 44, 33, 0.82);
  color: #fff;
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  padding: 0.24rem 0.55rem;
  border-radius: 999px;
  backdrop-filter: blur(4px);
}
.arrow {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  background: rgba(255, 255, 255, 0.92);
  color: var(--ink-800);
  border: none;
  border-radius: 999px;
  width: 2.1rem;
  height: 2.1rem;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  padding: 0;
  box-shadow: var(--shadow-md);
  opacity: 0;
  transition: opacity 0.18s ease, background 0.16s ease;
}
.unit-card:hover .arrow, .unit-card:focus-within .arrow { opacity: 1; }
.arrow:hover { background: #fff; }
.arrow--prev { left: 0.5rem; }
.arrow--next { right: 0.5rem; }
.dots {
  position: absolute;
  bottom: 0.55rem;
  left: 0;
  right: 0;
  display: flex;
  justify-content: center;
  gap: 0.3rem;
}
.dot {
  width: 6px;
  height: 6px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.55);
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.15);
  transition: background 0.16s ease, width 0.16s ease;
}
.dot.on { background: #fff; width: 16px; }
.body {
  padding: 0.85rem 1rem 1.05rem;
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  flex: 1;
}
.price {
  margin: 0;
  font-family: var(--display, Georgia, serif);
  font-size: 1.4rem;
  font-weight: 600;
  color: var(--accent-text);
  line-height: 1.1;
}
.price .per { font-family: inherit; font-size: 0.8rem; font-weight: 500; color: var(--muted); }
.price--tba { color: var(--muted); font-size: 1.1rem; }
.title {
  margin: 0.1rem 0 0;
  font-size: 1rem;
  font-weight: 600;
  color: var(--ink-800);
  line-height: 1.3;
}
.location {
  display: flex;
  align-items: center;
  gap: 0.3rem;
  margin: 0;
  color: var(--muted);
  font-size: 0.83rem;
}
.location svg { flex: none; }
.specs {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem 0.9rem;
  margin: 0.45rem 0 0;
  padding: 0.5rem 0 0;
  border-top: 1px solid var(--line);
}
.spec {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--ink-700);
}
.spec svg { color: var(--accent-text); }
.spec__u { color: var(--muted); font-weight: 500; }
.amenities {
  list-style: none;
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem;
  margin: 0.5rem 0 0;
  padding: 0;
}
.amenities li {
  font-size: 0.72rem;
  color: var(--ink-700);
  background: var(--accent-050);
  border-radius: 999px;
  padding: 0.16rem 0.5rem;
}
.view-details {
  margin-top: auto;
  align-self: flex-start;
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  color: var(--accent-text);
  font-weight: 700;
  font-size: 0.88rem;
  text-decoration: none;
  padding-top: 0.7rem;
}
.view-details svg { transition: transform 0.18s ease; }
.view-details:hover svg { transform: translateX(3px); }

@media (hover: none) {
  .arrow { opacity: 1; background: rgba(255, 255, 255, 0.85); }
}
@media (prefers-reduced-motion: reduce) {
  .unit-card, .photo img, .arrow, .view-details svg { transition: none; }
  .unit-card:hover { transform: none; }
  .unit-card:hover .photo img { transform: none; }
}
</style>
