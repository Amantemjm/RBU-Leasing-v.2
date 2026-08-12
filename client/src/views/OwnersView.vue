<script setup>
import { ref, computed, onMounted } from "vue";
import { useRouter } from "vue-router";
import { owners } from "../lib/resource.js";
import ResourceTable from "../components/ResourceTable.vue";

// Write controls only appear in the Master Admin hub (admin=true). In the main
// nav these views are read-only for everyone, including the Super Admin.
const props = defineProps({ admin: { type: Boolean, default: false } });
const rows = ref([]);
const router = useRouter();
const canWrite = computed(() => props.admin);
const columns = [
  { key: "name", label: "Name" },
  { key: "email", label: "Email" },
  { key: "phone", label: "Phone" },
];

async function load() { rows.value = await owners.list(); }
onMounted(load);

function remove(row) {
  if (!confirm(`Delete owner "${row.name}"?`)) return;
  owners.remove(row.id).then(load).catch((e) => alert(e.response?.data?.error || "Delete failed"));
}
</script>

<template>
  <section>
    <header>
      <h1>Owners</h1>
      <button v-if="canWrite" type="button" @click="router.push('/app/owners/new')">New owner</button>
    </header>
    <ResourceTable :columns="columns" :rows="rows" :can-write="canWrite"
      @edit="(row) => router.push(`/app/owners/${row.id}`)" @delete="remove" />
  </section>
</template>
