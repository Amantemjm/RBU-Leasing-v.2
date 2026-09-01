<script setup>
// Public property card for a published unit: photo carousel, location/building/
// unit, a spec line, and the PHP asking rate. Mirrors the Ortigas Land leasing
// listing card. All content comes from the public listing DTO (no auth).
import { computed, ref, watch } from "vue";
import { publicUnits } from "../lib/resource.js";

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
watch(() => props.card, () => { index.value = startIndex(); broken.value = false; });

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

const building = computed(() => d.value.propertyName || props.card.headline || "Unit");
const sub = computed(() => [props.card.location, has("unitNumber") ? `Unit ${d.value.unitNumber}` : null].filter(Boolean).join(" · "));
const typeChip = computed(() => props.card.type || d.value.unitType || null);
const price = computed(() => (has("rentalRate") ? `PHP ${Number(d.value.rentalRate).toLocaleString("en-PH")}` : null));

const specs = computed(() => {
  const out = [];
  if (has("floorArea")) out.push(`${d.value.floorArea} sqm`);
  if (has("bedrooms")) out.push(`${d.value.bedrooms} BR`);
  if (has("bathrooms")) out.push(`${d.value.bathrooms} BA`);
  return out;
});
const amenities = computed(() => (Array.isArray(d.value.amenities) ? d.value.amenities.slice(0, 3) : []));
</script>

<template>
  <article class="card">
    <div class="photo">
      <img v-if="hasPhoto" :src="publicUnits.photoUrl(current)" :alt="building" loading="lazy" @error="broken = true" />
      <div v-else class="placeholder" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" stroke-width="1.4"><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="8.5" cy="9.5" r="1.6" /><path d="m4 18 5-5 4 4 3-3 4 4" /></svg>
        <span>No photo yet</span>
      </div>
      <span v-if="typeChip" class="type-chip">{{ typeChip }}</span>
      <template v-if="showArrows">
        <button type="button" class="arrow arrow--prev" aria-label="Previous photo" @click="prev"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6" /></svg></button>
        <button type="button" class="arrow arrow--next" aria-label="Next photo" @click="next"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6" /></svg></button>
        <div class="dots" aria-hidden="true"><span v-for="(p, i) in photoIds" :key="p" :class="['dot', { on: i === index }]"></span></div>
      </template>
    </div>

    <div class="body">
      <h3 class="building">{{ building }}</h3>
      <p v-if="sub" class="sub">{{ sub }}</p>

      <p v-if="specs.length || amenities.length" class="specs">
        <span v-for="s in specs" :key="s" class="spec">{{ s }}</span>
        <span v-for="a in amenities" :key="a" class="spec spec--amenity">{{ a }}</span>
      </p>

      <div class="foot">
        <p class="price" v-if="price">{{ price }}<span class="per"> / mo</span></p>
        <p class="price price--tba" v-else>Rate on request</p>
        <RouterLink :to="`/units-for-lease/${card.unitId}`" class="details">Details</RouterLink>
      </div>
    </div>
  </article>
</template>

<style scoped>
.card {
  --brand: #0b463c;
  --brand-600: #00392f;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 14px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  box-shadow: var(--shadow-sm);
  transition: transform 0.2s cubic-bezier(0.22, 1, 0.36, 1), box-shadow 0.2s ease, border-color 0.2s ease;
}
.card:hover { transform: translateY(-4px); box-shadow: var(--shadow-lg); border-color: var(--line-strong); }
.photo { position: relative; width: 100%; aspect-ratio: 4 / 3; background: var(--paper); overflow: hidden; }
.photo img { width: 100%; height: 100%; object-fit: cover; display: block; transition: transform 0.5s cubic-bezier(0.22, 1, 0.36, 1); }
.card:hover .photo img { transform: scale(1.05); }
.placeholder { width: 100%; height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 0.35rem; color: var(--muted); font-size: 0.8rem; }
.type-chip { position: absolute; top: 0.6rem; left: 0.6rem; background: rgba(11, 70, 60, 0.9); color: #fff; font-size: 0.68rem; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; padding: 0.24rem 0.55rem; border-radius: 999px; }
.arrow { position: absolute; top: 42%; transform: translateY(-50%); background: rgba(255, 255, 255, 0.92); color: var(--brand); border: none; border-radius: 999px; width: 2.1rem; height: 2.1rem; display: flex; align-items: center; justify-content: center; cursor: pointer; padding: 0; box-shadow: var(--shadow-md); opacity: 0; transition: opacity 0.18s ease, background 0.16s ease; }
.card:hover .arrow, .card:focus-within .arrow { opacity: 1; }
.arrow:hover { background: #fff; }
.arrow--prev { left: 0.5rem; }
.arrow--next { right: 0.5rem; }
.dots { position: absolute; bottom: 0.55rem; left: 0; right: 0; display: flex; justify-content: center; gap: 0.3rem; }
.dot { width: 6px; height: 6px; border-radius: 999px; background: rgba(255, 255, 255, 0.55); box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.15); transition: width 0.16s ease, background 0.16s ease; }
.dot.on { background: #fff; width: 16px; }

.body { padding: 0.9rem 1.05rem 1.05rem; display: flex; flex-direction: column; gap: 0.3rem; flex: 1; }
.building { margin: 0; font-family: var(--display, Georgia, serif); font-size: 1.12rem; font-weight: 600; color: var(--ink-800); line-height: 1.25; }
.sub { margin: 0; color: var(--muted); font-size: 0.83rem; }
.specs { display: flex; flex-wrap: wrap; gap: 0.4rem; margin: 0.55rem 0 0; padding: 0; }
.spec { font-size: 0.76rem; font-weight: 600; color: var(--ink-700); background: var(--paper); border: 1px solid var(--line); border-radius: 999px; padding: 0.18rem 0.55rem; }
.spec--amenity { color: var(--brand); background: #e7efec; border-color: transparent; font-weight: 550; }
.foot { display: flex; align-items: center; justify-content: space-between; gap: 0.6rem; margin-top: auto; padding-top: 0.9rem; }
.price { margin: 0; font-family: var(--display, Georgia, serif); font-size: 1.25rem; font-weight: 600; color: var(--brand); line-height: 1.1; }
.price .per { font-size: 0.75rem; font-weight: 500; color: var(--muted); }
.price--tba { font-size: 1rem; color: var(--muted); }
.details { background: var(--brand); color: #fff; text-decoration: none; font-weight: 650; font-size: 0.85rem; padding: 0.5rem 1rem; border-radius: var(--radius-sm); white-space: nowrap; transition: background 0.16s ease; }
.details:hover { background: var(--brand-600); }

@media (hover: none) { .arrow { opacity: 1; background: rgba(255, 255, 255, 0.85); } }
@media (prefers-reduced-motion: reduce) {
  .card, .photo img, .arrow { transition: none; }
  .card:hover { transform: none; }
  .card:hover .photo img { transform: none; }
}
</style>
