<script setup>
import { ref, computed, onMounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import { leases, units, tenants } from "../lib/resource.js";
import { toDateInput } from "../lib/formatters.js";
import ResourceForm from "../components/ResourceForm.vue";

const route = useRoute();
const router = useRouter();
const id = route.params.id;
const isEdit = !!id;
const record = ref({});
const unitOptions = ref([]);
const tenantOptions = ref([]);
const error = ref("");
const submitting = ref(false);

const STATUS = ["ACTIVE", "EXPIRED", "TERMINATED"].map((v) => ({ value: v, label: v }));

const fields = computed(() => [
  { key: "unitId", label: "Unit", type: "select", options: unitOptions.value },
  { key: "tenantId", label: "Tenant", type: "select", options: tenantOptions.value },
  { key: "startDate", label: "Start date", type: "date" },
  { key: "endDate", label: "End date", type: "date" },
  { key: "monthlyRent", label: "Monthly rent (PHP)", type: "number" },
  { key: "deposit", label: "Deposit (PHP)", type: "number" },
  { key: "status", label: "Status", type: "select", options: STATUS },
  { key: "managedBy", label: "Managed by (O-LEASE)", type: "text" },
  { key: "advanceRent", label: "Advance rent", type: "text" },
  { key: "securityDeposit", label: "Security deposit", type: "text" },
  { key: "modeOfPayment", label: "Mode of payment", type: "text" },
  { key: "serviceFee", label: "Service fee paid", type: "text" },
  { key: "source", label: "Source", type: "text" },
  { key: "renewalPeriod", label: "Renewal period", type: "text" },
  { key: "remarks", label: "Remarks", type: "text" },
]);

onMounted(async () => {
  unitOptions.value = (await units.list()).map((u) => ({ value: u.id, label: u.unitNumber }));
  tenantOptions.value = (await tenants.list()).map((t) => ({ value: t.id, label: t.name }));
  if (isEdit) {
    const l = await leases.get(id);
    record.value = { ...l, startDate: toDateInput(l.startDate), endDate: toDateInput(l.endDate) };
  }
});

async function submit(values) {
  error.value = ""; submitting.value = true;
  try {
    if (isEdit) await leases.update(id, values); else await leases.create(values);
    router.push("/app/leases");
  } catch (e) {
    error.value = e.response?.data?.error || "Save failed";
  } finally { submitting.value = false; }
}
</script>

<template>
  <section>
    <h1>{{ isEdit ? "Edit" : "New" }} lease</h1>
    <ResourceForm :fields="fields" :model-value="record" :error="error" :submitting="submitting"
      @submit="submit" @cancel="router.push('/app/leases')" />
  </section>
</template>
