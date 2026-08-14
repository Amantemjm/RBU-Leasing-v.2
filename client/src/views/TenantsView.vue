<script setup>
import { ref, computed, onMounted } from "vue";
import { useRouter } from "vue-router";
import { tenants } from "../lib/resource.js";
import { useAuthStore } from "../stores/auth.js";
import ResourceTable from "../components/ResourceTable.vue";

// Only the Super Admin can modify records; everyone else sees a read-only view.
const auth = useAuthStore();
const rows = ref([]);
const router = useRouter();
const canWrite = computed(() => auth.role === "ADMIN");
const columns = [
  { key: "name", label: "Name" },
  { key: "email", label: "Email" },
  { key: "phone", label: "Phone" },
];

async function load() { rows.value = await tenants.list(); }
onMounted(load);

function remove(row) {
  if (!confirm(`Delete tenant "${row.name}"?`)) return;
  tenants.remove(row.id).then(load).catch((e) => alert(e.response?.data?.error || "Delete failed"));
}
</script>

<template>
  <section>
    <header>
      <h1>Tenants</h1>
      <button v-if="canWrite" type="button" @click="router.push('/app/tenants/new')">New tenant</button>
    </header>
    <ResourceTable :columns="columns" :rows="rows" :can-write="canWrite"
      @edit="(row) => router.push(`/app/tenants/${row.id}`)" @delete="remove" />
  </section>
</template>
