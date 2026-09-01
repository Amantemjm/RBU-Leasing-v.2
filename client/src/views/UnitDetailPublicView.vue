<script setup>
// Public unit detail page: photo gallery + full catalog details for a single
// published listing. Driven by the public listings API (no auth).
import { ref, computed, onMounted } from "vue";
import { useRoute } from "vue-router";
import { publicUnits } from "../lib/resource.js";
import { orderedDetails, formatDetail } from "../lib/listingFormat.js";
import logoUrl from "../assets/ortigas-logo.svg";

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

const d = computed(() => unit.value?.details || {});
const has = (k) => d.value[k] != null && d.value[k] !== "";
const title = computed(() => unit.value?.headline || unit.value?.details?.propertyName || "Unit");
const price = computed(() => (has("rentalRate") ? formatDetail("rentalRate", d.value.rentalRate) : null));
const typeChip = computed(() => unit.value?.type || d.value.unitType || null);
const details = computed(() =>
  orderedDetails(unit.value?.details, { exclude: ["location", "rentalRate", "bedrooms", "bathrooms", "floorArea", "unitType"] })
);
</script>

<template>
  <div class="detail-portal">
    <header class="nav">
      <RouterLink to="/" class="brand">
        <img :src="logoUrl" alt="" class="brand__logo" />
        <span class="brand__name">Ortigas Land</span>
        <span class="brand__sub">Leasing</span>
      </RouterLink>
      <RouterLink to="/inquiry?as=LESSEE" class="nav__inquire">Make an inquiry</RouterLink>
    </header>

    <div class="wrap">
      <RouterLink to="/" class="back-link">&larr; Back to Available Units</RouterLink>

      <div v-if="notFound" class="not-found">
        <h1>This unit is no longer available.</h1>
        <p>It may have been leased or unlisted. Browse the units that are still open.</p>
        <RouterLink to="/" class="not-found__cta">See available units</RouterLink>
      </div>

      <div v-else-if="unit" class="detail">
        <div class="gallery">
          <div class="gallery__main">
            <img
              v-if="hasPhoto"
              :src="publicUnits.photoUrl(current)"
              :alt="title"
              @error="broken = true"
            />
            <div v-else class="placeholder">No photo available</div>

            <span v-if="typeChip" class="type-chip">{{ typeChip }}</span>

            <template v-if="showArrows">
              <button type="button" class="arrow arrow--prev" aria-label="Previous photo" @click="prev">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6" /></svg>
              </button>
              <button type="button" class="arrow arrow--next" aria-label="Next photo" @click="next">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6" /></svg>
              </button>
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

        <aside class="info">
          <p v-if="price" class="price">{{ price }}<span class="per">/mo</span></p>
          <p v-else class="price price--tba">Rate on request</p>

          <h1 class="headline">{{ title }}</h1>
          <p v-if="unit.location" class="location">
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" /><circle cx="12" cy="10" r="3" /></svg>
            {{ unit.location }}
          </p>

          <div v-if="has('bedrooms') || has('bathrooms') || has('floorArea')" class="chips">
            <span v-if="has('bedrooms')" class="chip"><b>{{ d.bedrooms }}</b> Bedrooms</span>
            <span v-if="has('bathrooms')" class="chip"><b>{{ d.bathrooms }}</b> Bathrooms</span>
            <span v-if="has('floorArea')" class="chip"><b>{{ d.floorArea }}</b> sqm</span>
          </div>

          <dl v-if="details.length" class="specs">
            <template v-for="row in details" :key="row.key">
              <dt>{{ row.label }}</dt>
              <dd>{{ row.value }}</dd>
            </template>
          </dl>

          <RouterLink to="/inquiry?as=LESSEE" class="inquire-cta">Inquire about this unit</RouterLink>
        </aside>
      </div>
    </div>
  </div>
</template>

<style scoped>
.detail-portal { min-height: 100vh; background: var(--paper); }
.nav {
  position: sticky;
  top: 0;
  z-index: 20;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.7rem clamp(1rem, 4vw, 2.5rem);
  background: var(--surface);
  background: color-mix(in srgb, var(--surface) 88%, transparent);
  backdrop-filter: blur(10px);
  border-bottom: 1px solid var(--line);
}
.brand { display: inline-flex; align-items: baseline; gap: 0.5rem; text-decoration: none; }
.brand__logo { width: 26px; height: 26px; align-self: center; }
.brand__name { font-family: var(--display, Georgia, serif); font-size: 1.15rem; font-weight: 600; color: var(--ink-800); }
.brand__sub { font-size: 0.66rem; text-transform: uppercase; letter-spacing: 0.16em; color: var(--muted); font-weight: 700; }
.nav__inquire {
  color: var(--accent-text); font-weight: 650; font-size: 0.86rem; text-decoration: none;
  padding: 0.5rem 0.85rem; border: 1px solid var(--line-strong); border-radius: var(--radius-sm);
}
.nav__inquire:hover { background: var(--accent-050); }

.wrap { max-width: 68rem; margin: 0 auto; padding: 1.25rem clamp(1rem, 4vw, 2.5rem) 3.5rem; }
.back-link { display: inline-block; margin-bottom: 1.1rem; color: var(--accent-text); text-decoration: none; font-size: 0.88rem; font-weight: 600; }
.back-link:hover { text-decoration: underline; }

.detail { display: grid; grid-template-columns: minmax(0, 1.5fr) minmax(0, 1fr); gap: clamp(1.25rem, 3vw, 2.25rem); align-items: start; }

/* gallery */
.gallery__main {
  position: relative;
  aspect-ratio: 3 / 2;
  background: var(--paper);
  border-radius: var(--radius);
  overflow: hidden;
  border: 1px solid var(--line);
}
.gallery__main img { width: 100%; height: 100%; object-fit: cover; display: block; }
.placeholder { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; color: var(--muted); font-size: 0.9rem; }
.type-chip {
  position: absolute; top: 0.75rem; left: 0.75rem;
  background: rgba(12, 44, 33, 0.82); color: #fff; font-size: 0.7rem; font-weight: 700;
  letter-spacing: 0.04em; text-transform: uppercase; padding: 0.26rem 0.6rem; border-radius: 999px; backdrop-filter: blur(4px);
}
.arrow {
  position: absolute; top: 50%; transform: translateY(-50%);
  background: rgba(255, 255, 255, 0.92); color: var(--ink-800); border: none; border-radius: 999px;
  width: 2.4rem; height: 2.4rem; display: flex; align-items: center; justify-content: center; cursor: pointer;
  box-shadow: var(--shadow-md); transition: background 0.16s ease;
}
.arrow:hover { background: #fff; }
.arrow--prev { left: 0.6rem; }
.arrow--next { right: 0.6rem; }
.caption { margin: 0.6rem 0 0; color: var(--muted); font-size: 0.85rem; font-style: italic; }
.thumbs { display: flex; flex-wrap: wrap; gap: 0.5rem; margin-top: 0.7rem; }
.thumb {
  width: 4.5rem; height: 3.2rem; padding: 0; border: 2px solid transparent; border-radius: var(--radius-sm);
  overflow: hidden; cursor: pointer; background: var(--paper); opacity: 0.7; transition: opacity 0.16s ease, border-color 0.16s ease;
}
.thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
.thumb:hover { opacity: 1; }
.thumb--active { opacity: 1; border-color: var(--accent); }

/* info */
.info {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  padding: 1.4rem 1.4rem 1.5rem;
  box-shadow: var(--shadow-sm);
  position: sticky;
  top: 5rem;
}
.price { margin: 0; font-family: var(--display, Georgia, serif); font-size: 1.9rem; font-weight: 600; color: var(--accent-text); line-height: 1.1; }
.price .per { font-size: 0.9rem; font-weight: 500; color: var(--muted); }
.price--tba { color: var(--muted); font-size: 1.4rem; }
.headline { margin: 0.5rem 0 0; font-size: 1.2rem; font-weight: 600; color: var(--ink-800); line-height: 1.3; }
.location { display: flex; align-items: center; gap: 0.35rem; margin: 0.4rem 0 0; color: var(--muted); font-size: 0.9rem; }
.chips { display: flex; flex-wrap: wrap; gap: 0.5rem; margin: 1rem 0 0; }
.chip { background: var(--accent-050); color: var(--ink-700); border-radius: 999px; padding: 0.3rem 0.7rem; font-size: 0.82rem; }
.chip b { color: var(--accent-text); font-weight: 700; }
.specs { margin: 1.1rem 0 0; padding: 1.1rem 0 0; border-top: 1px solid var(--line); display: grid; grid-template-columns: auto 1fr; gap: 0.5rem 1rem; }
.specs dt { color: var(--muted); font-size: 0.85rem; font-weight: 600; }
.specs dd { margin: 0; color: var(--ink-800); font-size: 0.88rem; }
.inquire-cta {
  display: block; text-align: center; margin-top: 1.4rem;
  background: var(--accent); color: #fff; text-decoration: none; font-weight: 650;
  padding: 0.7rem 1rem; border-radius: var(--radius-sm); box-shadow: var(--shadow-sm); transition: background 0.16s ease;
}
.inquire-cta:hover { background: var(--accent-600); }

/* not found */
.not-found { text-align: center; padding: 4rem 1rem; }
.not-found h1 { margin: 0 0 0.5rem; font-family: var(--display, Georgia, serif); font-size: 1.5rem; color: var(--ink-800); }
.not-found p { margin: 0 auto 1.4rem; max-width: 26rem; color: var(--muted); }
.not-found__cta {
  background: var(--accent); color: #fff; text-decoration: none; font-weight: 650;
  padding: 0.6rem 1.2rem; border-radius: var(--radius-sm);
}

@media (max-width: 760px) {
  .detail { grid-template-columns: 1fr; }
  .info { position: static; }
}
</style>
