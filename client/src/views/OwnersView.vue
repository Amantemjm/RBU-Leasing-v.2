<script setup>
import { ref, computed, onMounted } from "vue";
import { useRouter } from "vue-router";
import { owners } from "../lib/resource.js";
import { useAuthStore } from "../stores/auth.js";
import ResourceTable from "../components/ResourceTable.vue";

const rows = ref([]);
const router = useRouter();
const auth = useAuthStore();
const canWrite = computed(() => ["ADMIN", "LEASING_OFFICER"].includes(auth.role));
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
