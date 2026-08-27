<script setup>
import { ref, reactive, onMounted } from "vue";
import { useRouter, useRoute } from "vue-router";
import { units, estates, towers, submitUnit } from "../lib/resource.js";

const router = useRouter();
const route = useRoute();
const error = ref("");
const submitting = ref(false);
const done = ref(false);
const estateOptions = ref([]);
const towerOptions = ref([]);
const editId = ref(route.query.id || null);

const form = reactive({
  estateId: "", towerId: "", unitNumber: "", floor: "", slotNo: "",
  type: "", baseRent: "",
});

// The unit types actually used in the leasing records. Offered as suggestions
// rather than a fixed list: the same records also carry one-offs like lofts and
// bi-level units, so the field stays free text.
const UNIT_TYPES = ["Studio", "1 Bedroom", "2 Bedrooms", "3 Bedrooms", "Loft", "Penthouse"];

async function loadTowers(estateId) {
  towerOptions.value = estateId
    ? (await towers.list({ estateId })).map((t) => ({ value: t.id, label: t.name }))
    : [];
}
async function onEstateChange() {
  form.towerId = "";
  await loadTowers(form.estateId);
}

onMounted(async () => {
  estateOptions.value = (await estates.list()).map((e) => ({ value: e.id, label: e.name }));

  if (editId.value) {
    const u = await units.get(editId.value);
    form.unitNumber = u.unitNumber || ""; form.floor = u.floor || ""; form.slotNo = u.slotNo || "";
    form.type = u.type || ""; form.baseRent = u.baseRent != null ? String(u.baseRent) : "";
    if (u.tower?.estate?.id) {
      form.estateId = u.tower.estate.id;
      await loadTowers(form.estateId);
      form.towerId = u.towerId || "";
    }
  }
});

async function save(submitForApproval) {
  error.value = "";
  submitting.value = true;
  const payload = { submit: submitForApproval };
  for (const [k, v] of Object.entries(form)) {
    if (k === "estateId") continue; // UI-only: narrows the tower list
    if (v !== "" && v !== null && v !== undefined) payload[k] = v;
  }
  try {
    if (editId.value) {
      await units.update(editId.value, payload);
      if (submitForApproval) await submitUnit(editId.value);
    } else {
      await units.create(payload);
    }
    done.value = true;
    setTimeout(() => router.push("/app/my-units"), 1600);
  } catch (e) {
    error.value = e.response?.data?.error || "Submit failed";
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <section class="reg">
    <header class="reg__head">
      <h1>Register a unit for lease</h1>
      <p class="muted">
        Tell us where the unit is and what it is. O-Lease reviews and approves it
        before it appears to prospective lessees.
      </p>
    </header>

    <div v-if="done" class="done">
      <span class="done__tick" aria-hidden="true">✓</span>
      <div>
        <h2>{{ editId ? "Saved" : "Submitted for approval" }}</h2>
        <p class="muted">O-Lease will review it shortly. Taking you back to your units…</p>
      </div>
    </div>

    <form v-else @submit.prevent="save(true)" novalidate>
      <fieldset class="fset">
        <legend class="fset__title">Where it is</legend>
        <div class="fset__grid">
          <div class="field">
            <label for="estateId">Estate</label>
            <select id="estateId" v-model="form.estateId" @change="onEstateChange">
              <option value="">— select —</option>
              <option v-for="e in estateOptions" :key="e.value" :value="e.value">{{ e.label }}</option>
            </select>
            <small class="hint">Pick the estate to narrow the tower list.</small>
          </div>

          <div class="field">
            <label for="towerId">Tower</label>
            <select id="towerId" v-model="form.towerId" :disabled="!form.estateId">
              <option value="">{{ form.estateId ? "— select —" : "Select an estate first" }}</option>
              <option v-for="t in towerOptions" :key="t.value" :value="t.value">{{ t.label }}</option>
            </select>
            <small class="hint">e.g. Ibiza Tower, Viridian in Greenhills</small>
          </div>

          <div class="field">
            <label for="floor">Floor / level</label>
            <input id="floor" type="text" v-model="form.floor" placeholder="e.g. 19" />
            <small class="hint">The floor the unit sits on.</small>
          </div>

          <div class="field">
            <label for="slotNo">Parking slot no. <span class="opt">(optional)</span></label>
            <input id="slotNo" type="text" v-model="form.slotNo" placeholder="e.g. B5-15" />
            <small class="hint">Leave blank if the unit has no parking slot.</small>
          </div>
        </div>
      </fieldset>

      <fieldset class="fset">
        <legend class="fset__title">What it is</legend>
        <div class="fset__grid">
          <div class="field">
            <label for="unitNumber">Unit number <span class="req">*</span></label>
            <input id="unitNumber" type="text" v-model="form.unitNumber" placeholder="e.g. 19A" required />
            <small class="hint">As written on the door — floor plus letter, like 19A or 5I.</small>
          </div>

          <div class="field">
            <label for="type">Unit type</label>
            <input id="type" type="text" v-model="form.type" list="unitTypeOptions" placeholder="e.g. 1 Bedroom" />
            <datalist id="unitTypeOptions">
              <option v-for="t in UNIT_TYPES" :key="t" :value="t"></option>
            </datalist>
            <small class="hint">Choose a suggestion or type your own.</small>
          </div>
        </div>
      </fieldset>

      <fieldset class="fset">
        <legend class="fset__title">Asking rent</legend>
        <div class="fset__grid">
          <div class="field field--rent">
            <label for="baseRent">Monthly rent</label>
            <div class="money">
              <span class="money__sign" aria-hidden="true">₱</span>
              <input id="baseRent" type="number" min="0" step="500" v-model="form.baseRent" placeholder="e.g. 25000" />
            </div>
            <small class="hint">Per month, excluding association dues. You can adjust this later.</small>
          </div>
        </div>
      </fieldset>

      <p v-if="error" class="error">{{ error }}</p>

      <div class="form-actions">
        <button type="button" class="draft" :disabled="submitting" @click="save(false)">Save as draft</button>
        <button type="submit" class="submit" :disabled="submitting" @click.prevent="save(true)">Submit for approval</button>
        <button type="button" class="cancel" @click="router.push('/app/my-units')">Cancel</button>
      </div>
      <p class="foot">Nothing is published until O-Lease approves it.</p>
    </form>
  </section>
</template>

<style scoped>
/* Centred and capped rather than filling the page. Seven fields cannot fill a
   1500px card — stretched that wide it reads as mostly empty. 860px pairs the
   fields two-up with no orphan rows and keeps labels near their inputs. */
.reg { max-width: 860px; margin-inline: auto; }

/* app.css lays every `section > form` out as a 3-column grid, which would put
   these fieldsets side by side in ~325px columns and squash the fields inside
   them. This page arranges its own sections instead. Scoped `.reg form`
   outranks that rule.
   Two columns: "Where it is" spans both (it holds four fields); the two small
   sections share the row beneath rather than stacking, which is what keeps the
   whole form inside the viewport without scrolling. */
.reg form { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.8rem 1rem; padding: 1.3rem 1.5rem; }
.reg .fset:first-of-type { grid-column: 1 / -1; }
.reg .fset { margin: 0; }
/* Narrow: everything back to one column, where height is not the constraint. */
@media (max-width: 780px) {
  .reg form { grid-template-columns: 1fr; }
  .reg .fset { grid-column: 1 / -1; }
}
.reg__head { margin-bottom: 0.8rem; }
.reg__head h1 { margin-bottom: 0.25rem; }
/* The intro is prose — keep it at a readable measure even as the card widens. */
.reg__head .muted { max-width: 62ch; }
.muted { color: var(--muted); }

.fset {
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: var(--surface);
  padding: 0.25rem 1rem 0.9rem;
  margin: 0;
}
.fset__title {
  font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.09em;
  font-weight: 700; color: var(--accent-text); padding: 0 0.4rem;
}
/* Exactly two columns, not an auto-fitting track count. At a fixed card width
   the pairing becomes predictable — Estate|Tower, Floor|Slot, Unit no.|Type —
   instead of the column count shifting with the window and stranding a lone
   field on its own row. */
.fset__grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.7rem 1rem;
}
@media (max-width: 620px) { .fset__grid { grid-template-columns: 1fr; } }

.field { display: flex; flex-direction: column; gap: 0.3rem; }
.hint { font-size: 0.72rem; color: var(--faint); line-height: 1.35; }
.req { color: var(--danger); }
.opt { color: var(--faint); font-weight: 400; }

/* Peso sign sits inside the field so the number reads as money. */
.money { position: relative; display: flex; }
.money__sign {
  position: absolute; left: 0.7rem; top: 50%; transform: translateY(-50%);
  color: var(--muted); font-size: 0.95rem; pointer-events: none;
}
.money input { padding-left: 1.75rem; width: 100%; }
/* A currency box gains nothing from being 1000px wide. */
.money { max-width: 240px; }
.field--rent .hint { max-width: 46ch; }

.foot { margin: 0.4rem 0 0; font-size: 0.76rem; color: var(--faint); }

/* Short windows give back the intro copy and some breathing room first, so the
   form itself stays whole rather than scrolling. */
@media (max-height: 780px) {
  .reg__head { margin-bottom: 0.5rem; }
  .reg form { gap: 0.6rem 1rem; padding: 1rem 1.4rem; }
  .fset__grid { gap: 0.55rem 1rem; }
  .hint { font-size: 0.69rem; }
}
@media (max-height: 700px) {
  .reg__head .muted { display: none; }
  .foot { display: none; }
  .fset { padding: 0.2rem 0.9rem 0.7rem; }
}
/* .app-main reserves 3rem below every page; on a short window that alone is
   enough to push this form over the edge. */
@media (max-height: 680px) {
  .reg { margin-bottom: -2rem; }
  .reg form { gap: 0.5rem 1rem; padding: 0.85rem 1.3rem; }
}

.done {
  display: flex; align-items: center; gap: 0.9rem;
  background: var(--good-050); border: 1px solid var(--good);
  border-radius: var(--radius); padding: 1.1rem 1.25rem;
}
.done__tick {
  flex-shrink: 0; width: 34px; height: 34px; border-radius: 50%;
  display: inline-flex; align-items: center; justify-content: center;
  background: var(--good-solid, var(--good)); color: #fff; font-weight: 700;
}
.done h2 { margin: 0 0 0.15rem; font-size: 1rem; }
.done p { margin: 0; font-size: 0.85rem; }
</style>
