<script setup>
import { ref, computed, onMounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import { payments, leases } from "../lib/resource.js";
import { toDateInput } from "../lib/formatters.js";
import ResourceForm from "../components/ResourceForm.vue";

const route = useRoute();
const router = useRouter();
const id = route.params.id;
const isEdit = !!id;
const record = ref({});
const leaseOptions = ref([]);
const error = ref("");
const submitting = ref(false);

const STATUS = ["PENDING", "PAID", "OVERDUE"].map((v) => ({ value: v, label: v }));

const fields = computed(() => [
  { key: "leaseId", label: "Lease", type: "select", options: leaseOptions.value },
  { key: "periodMonth", label: "Period month", type: "date" },
  { key: "amount", label: "Amount (PHP)", type: "number" },
  { key: "dueDate", label: "Due date", type: "date" },
  { key: "paidDate", label: "Paid date", type: "date" },
  { key: "status", label: "Status", type: "select", options: STATUS },
  { key: "method", label: "Method", type: "text" },
]);

onMounted(async () => {
  leaseOptions.value = (await leases.list()).map((l) => ({ value: l.id, label: `${l.id.slice(0, 6)} — ${l.status}` }));
  if (isEdit) {
    const p = await payments.get(id);
    record.value = { ...p, periodMonth: toDateInput(p.periodMonth), dueDate: toDateInput(p.dueDate), paidDate: toDateInput(p.paidDate) };
  }
});

async function submit(values) {
  error.value = ""; submitting.value = true;
  const payload = { ...values };
  if (!payload.paidDate) delete payload.paidDate;
  try {
    if (isEdit) await payments.update(id, payload); else await payments.create(payload);
    router.push("/app/payments");
  } catch (e) {
    error.value = e.response?.data?.error || "Save failed";
  } finally { submitting.value = false; }
}
</script>

<template>
  <section>
    <h1>{{ isEdit ? "Edit" : "New" }} payment</h1>
    <ResourceForm :fields="fields" :model-value="record" :error="error" :submitting="submitting"
      @submit="submit" @cancel="router.push('/app/payments')" />
  </section>
</template>
