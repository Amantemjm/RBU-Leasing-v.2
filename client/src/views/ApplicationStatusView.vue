<script setup>
// The one page a restricted session can reach. There is no outbound email
// anywhere in this system, so this is the sole channel by which an applicant
// ever learns their status, reads an officer's remarks, and — on For
// Revision — corrects the unit that came back.
import { reactive, ref, onMounted, computed } from "vue";
import { application, publicRefs } from "../lib/resource.js";
import OnboardingProgress from "../components/OnboardingProgress.vue";

// The server renames the rejectionReason column to `remarks` on the way out —
// one field carries both a rejection reason and revision remarks. The label
// above it is what tells them apart.
const STATUS_LABEL = {
  PENDING: "Pending Review",
  FOR_REVISION: "For Revision",
  APPROVED: "Approved",
  REJECTED: "Rejected",
};

// Everything the server will accept back in `unit`. The form below lets the
// applicant edit every one of these; the merge with pendingUnit still guards
// against dropping anything the form doesn't recognize.
const UNIT_FIELDS = ["estateId", "towerId", "unitNumber", "floor", "slotNo", "type", "baseRent"];

const app = ref(null);
const loading = ref(true);
const loadError = ref("");
const submitting = ref(false);
const formError = ref("");
const estateOptions = ref([]);
const towerOptions = ref([]);

const form = reactive({ estateId: "", towerId: "", unitNumber: "", floor: "", slotNo: "", type: "", baseRent: "" });

const status = computed(() => app.value?.status || "");
const label = computed(() => STATUS_LABEL[status.value] || status.value);
const statuses = computed(() => ({ review: label.value }));

function populateForm(unit) {
  form.estateId = unit?.estateId || "";
  form.towerId = unit?.towerId || "";
  form.unitNumber = unit?.unitNumber || "";
  form.floor = unit?.floor || "";
  form.slotNo = unit?.slotNo || "";
  form.type = unit?.type || "";
  form.baseRent = unit?.baseRent != null ? String(unit.baseRent) : "";
}

async function load() {
  loading.value = true;
  loadError.value = "";
  try {
    app.value = await application.get();
    if (app.value.status === "FOR_REVISION") {
      populateForm(app.value.pendingUnit);
      estateOptions.value = await publicRefs.estates();
      // The saved unit can already carry an estateId — without this, the
      // tower list stays empty and the saved tower renders as unselected.
      if (form.estateId) towerOptions.value = await publicRefs.towers(form.estateId);
    }
  } catch (e) {
    loadError.value = e.response?.data?.error || "Could not load your application.";
  } finally {
    loading.value = false;
  }
}
onMounted(load);

async function onEstateChange() {
  form.towerId = "";
  towerOptions.value = form.estateId ? await publicRefs.towers(form.estateId) : [];
}

async function resubmit() {
  formError.value = "";
  if (!form.unitNumber.trim()) {
    formError.value = "Unit number is required.";
    return;
  }

  const merged = { ...(app.value?.pendingUnit || {}), ...form };
  const payload = {};
  for (const key of UNIT_FIELDS) {
    const v = merged[key];
    if (v !== "" && v !== null && v !== undefined) payload[key] = v;
  }

  submitting.value = true;
  try {
    await application.resubmit(payload);
    await load(); // flips the page back to Pending Review
  } catch (e) {
    formError.value = e.response?.data?.error || "Could not resubmit. Try again.";
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <section class="appstat">
    <OnboardingProgress current="review" :statuses="statuses" />

    <div v-if="loading" class="muted">Loading…</div>
    <p v-else-if="loadError" class="error">{{ loadError }}</p>

    <template v-else>
      <header class="appstat__head">
        <h1>Your application</h1>
        <span class="badge" :class="status.toLowerCase().replace(/_/g, '-')">{{ label }}</span>
      </header>

      <p v-if="status === 'PENDING'" class="muted">
        O-Lease is reviewing your application. Check back here for updates —
        there is no other way we can reach you.
      </p>

      <p v-if="status === 'APPROVED'" class="muted">
        Your application has been approved.
      </p>

      <p v-if="status === 'FOR_REVISION' && app.remarks" class="remark remark--bad">
        <strong>What needs fixing:</strong> {{ app.remarks }}
      </p>

      <p v-if="status === 'REJECTED' && app.remarks" class="remark remark--bad">
        <strong>Reason:</strong> {{ app.remarks }}
      </p>

      <form v-if="status === 'FOR_REVISION'" @submit.prevent="resubmit" novalidate>
        <fieldset class="fset">
          <legend class="fset__title">Correct the unit</legend>
          <div class="fset__grid">
            <div class="field">
              <label for="estateId">Estate</label>
              <select id="estateId" v-model="form.estateId" @change="onEstateChange">
                <option value="">Select…</option>
                <option v-for="e in estateOptions" :key="e.id" :value="e.id">{{ e.name }}</option>
              </select>
            </div>
            <div class="field">
              <label for="towerId">Tower</label>
              <select id="towerId" v-model="form.towerId" :disabled="!form.estateId">
                <option value="">{{ form.estateId ? "Select…" : "Select an estate first" }}</option>
                <option v-for="t in towerOptions" :key="t.id" :value="t.id">{{ t.name }}</option>
              </select>
            </div>
            <div class="field">
              <label for="unitNumber">Unit number <span class="req">*</span></label>
              <input id="unitNumber" type="text" v-model="form.unitNumber" placeholder="e.g. 19A" />
            </div>
            <div class="field">
              <label for="floor">Floor / level</label>
              <input id="floor" type="text" v-model="form.floor" placeholder="e.g. 19" />
            </div>
            <div class="field">
              <label for="type">Unit type</label>
              <input id="type" type="text" v-model="form.type" placeholder="e.g. 1 Bedroom" />
            </div>
            <div class="field">
              <label for="baseRent">Monthly rent</label>
              <input id="baseRent" type="number" min="0" step="500" v-model="form.baseRent" placeholder="e.g. 25000" />
            </div>
            <div class="field">
              <label for="slotNo">Parking slot no. <span class="opt">(optional)</span></label>
              <input id="slotNo" type="text" v-model="form.slotNo" placeholder="e.g. B5-15" />
            </div>
          </div>
        </fieldset>

        <p v-if="formError" class="error">{{ formError }}</p>

        <div class="form-actions">
          <button type="submit" class="submit" :disabled="submitting">Resubmit for review</button>
        </div>
      </form>
    </template>
  </section>
</template>

<style scoped>
.appstat { max-width: 720px; margin-inline: auto; display: flex; flex-direction: column; gap: 1.1rem; }
.muted { color: var(--muted); }
.error { color: var(--danger); }

.appstat__head { display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; }
.appstat__head h1 { margin: 0; }

.badge {
  font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.05em;
  padding: 0.2rem 0.6rem; border-radius: 999px;
  background: var(--accent-050); color: var(--accent-text);
}
.badge.for-revision, .badge.rejected { background: var(--danger-050); color: var(--danger); }
.badge.approved { background: var(--good-050); color: var(--good); }

.remark { border: 1px solid var(--line); border-radius: var(--radius-sm); padding: 0.75rem 0.9rem; margin: 0; }
.remark--bad { border-color: var(--danger); background: var(--danger-050); color: var(--danger); }

.fset { border: 1px solid var(--line); border-radius: var(--radius); background: var(--surface); padding: 0.25rem 1rem 0.9rem; margin: 0; }
.fset__title { font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.09em; font-weight: 700; color: var(--accent-text); padding: 0 0.4rem; }
.fset__grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.7rem 1rem; }
@media (max-width: 620px) { .fset__grid { grid-template-columns: 1fr; } }

.field { display: flex; flex-direction: column; gap: 0.3rem; }
.req { color: var(--danger); }
.opt { color: var(--faint); font-weight: 400; }

.form-actions { margin-top: 0.9rem; }
</style>
