<script setup>
import { ref, reactive, onMounted } from "vue";
import { useRouter } from "vue-router";
import { units, estates, towers } from "../lib/resource.js";

const router = useRouter();
const error = ref("");
const submitting = ref(false);
const done = ref(false);
const estateOptions = ref([]);
const towerOptions = ref([]);

const form = reactive({
  estateId: "", towerId: "", unitNumber: "", floor: "", slotNo: "",
  type: "",
});

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
});

async function submit() {
  error.value = "";
  submitting.value = true;
  const payload = {};
  for (const [k, v] of Object.entries(form)) {
    if (k === "estateId") continue;
    if (v !== "" && v !== null && v !== undefined) payload[k] = v;
  }
  try {
    await units.create(payload);
    done.value = true;
    setTimeout(() => router.push("/app/my-units"), 1200);
  } catch (e) {
    error.value = e.response?.data?.error || "Submit failed";
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <section>
    <h1>Register a unit for lease</h1>
    <p class="muted">Your submission is reviewed and approved by O-Lease before it goes live.</p>
    <p v-if="done" class="ok">Submitted for approval. Redirecting…</p>
    <form v-else @submit.prevent="submit">
      <div class="field">
        <label for="estateId">Estate</label>
        <select id="estateId" v-model="form.estateId" @change="onEstateChange">
          <option value="">— select —</option>
          <option v-for="e in estateOptions" :key="e.value" :value="e.value">{{ e.label }}</option>
        </select>
      </div>
      <div class="field">
        <label for="towerId">Tower</label>
        <select id="towerId" v-model="form.towerId" :disabled="!form.estateId">
          <option value="">{{ form.estateId ? "— select —" : "select an estate first" }}</option>
          <option v-for="t in towerOptions" :key="t.value" :value="t.value">{{ t.label }}</option>
        </select>
      </div>
      <div class="field"><label for="unitNumber">Unit number</label><input id="unitNumber" type="text" v-model="form.unitNumber" /></div>
      <div class="field"><label for="floor">Level</label><input id="floor" type="text" v-model="form.floor" /></div>
      <div class="field"><label for="slotNo">Slot no.</label><input id="slotNo" type="text" v-model="form.slotNo" /></div>
      <div class="field"><label for="type">Unit type</label><input id="type" type="text" v-model="form.type" /></div>
      <p v-if="error" class="error">{{ error }}</p>
      <div class="form-actions">
        <button type="submit" :disabled="submitting">Submit for approval</button>
        <button type="button" class="cancel" @click="router.push('/app/my-units')">Cancel</button>
      </div>
    </form>
  </section>
</template>

<style scoped>
.ok { color: var(--good); font-weight: 500; }
</style>
