<script setup>
import { ref, computed, onMounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import { units, owners } from "../lib/resource.js";
import ResourceForm from "../components/ResourceForm.vue";

const route = useRoute();
const router = useRouter();
const id = route.params.id;
const isEdit = !!id;
const record = ref({});
const ownerOptions = ref([]);
const error = ref("");
const submitting = ref(false);

const STATUS = ["VACANT", "OCCUPIED"].map((v) => ({ value: v, label: v }));

const fields = computed(() => [
  { key: "ownerId", label: "Owner", type: "select", options: ownerOptions.value },
  { key: "unitNumber", label: "Unit number", type: "text" },
  { key: "building", label: "Building", type: "text" },
  { key: "floor", label: "Level", type: "text" },
  { key: "slotNo", label: "Slot no.", type: "text" },
  { key: "type", label: "Unit type", type: "text" },
  { key: "sizeSqm", label: "Size (sqm)", type: "number" },
  { key: "baseRent", label: "Base rent (PHP)", type: "number" },
  { key: "status", label: "Status", type: "select", options: STATUS },
]);

onMounted(async () => {
  ownerOptions.value = (await owners.list()).map((o) => ({ value: o.id, label: o.name }));
  if (isEdit) record.value = await units.get(id);
});

async function submit(values) {
  error.value = ""; submitting.value = true;
  try {
    if (isEdit) await units.update(id, values); else await units.create(values);
    router.push("/units");
  } catch (e) {
    error.value = e.response?.data?.error || "Save failed";
  } finally { submitting.value = false; }
}
</script>

<template>
  <section>
    <h1>{{ isEdit ? "Edit" : "New" }} unit</h1>
    <ResourceForm :fields="fields" :model-value="record" :error="error" :submitting="submitting"
      @submit="submit" @cancel="router.push('/units')" />
  </section>
</template>
