<script setup>
import { ref, reactive, onMounted } from "vue";
import { owners, tenants, createUser } from "../lib/resource.js";

const ownerOptions = ref([]);
const tenantOptions = ref([]);
const error = ref("");
const ok = ref("");
const submitting = ref(false);
const ROLES = ["UNIT_OWNER", "TENANT", "LEASING_OFFICER", "VIEWER", "ADMIN"];

const form = reactive({ name: "", email: "", password: "", role: "UNIT_OWNER", unitOwnerId: "", tenantId: "" });

onMounted(async () => {
  const [os, ts] = await Promise.all([owners.list(), tenants.list()]);
  ownerOptions.value = os.map((o) => ({ value: o.id, label: o.name }));
  tenantOptions.value = ts.map((t) => ({ value: t.id, label: t.name }));
});

async function submit() {
  error.value = "";
  ok.value = "";
  submitting.value = true;
  const payload = { name: form.name, email: form.email, password: form.password, role: form.role };
  if (form.role === "UNIT_OWNER") payload.unitOwnerId = form.unitOwnerId;
  if (form.role === "TENANT") payload.tenantId = form.tenantId;
  try {
    const u = await createUser(payload);
    ok.value = `Created ${u.email} (${u.role}).`;
    form.name = ""; form.email = ""; form.password = ""; form.unitOwnerId = ""; form.tenantId = "";
  } catch (e) {
    error.value = e.response?.data?.error || "Create failed";
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <section>
    <h1>Create a login</h1>
    <p class="muted">Provision Unit Owner / Tenant portal accounts and link them to a record.</p>
    <form @submit.prevent="submit">
      <div class="field"><label for="name">Name</label><input id="name" type="text" v-model="form.name" /></div>
      <div class="field"><label for="email">Email</label><input id="email" type="email" v-model="form.email" /></div>
      <div class="field"><label for="password">Password</label><input id="password" type="text" v-model="form.password" /></div>
      <div class="field">
        <label for="role">Role</label>
        <select id="role" v-model="form.role"><option v-for="r in ROLES" :key="r" :value="r">{{ r }}</option></select>
      </div>
      <div class="field" v-if="form.role === 'UNIT_OWNER'">
        <label for="unitOwnerId">Unit Owner</label>
        <select id="unitOwnerId" v-model="form.unitOwnerId">
          <option value="">— select —</option>
          <option v-for="o in ownerOptions" :key="o.value" :value="o.value">{{ o.label }}</option>
        </select>
      </div>
      <div class="field" v-if="form.role === 'TENANT'">
        <label for="tenantId">Tenant</label>
        <select id="tenantId" v-model="form.tenantId">
          <option value="">— select —</option>
          <option v-for="t in tenantOptions" :key="t.value" :value="t.value">{{ t.label }}</option>
        </select>
      </div>
      <p v-if="error" class="error">{{ error }}</p>
      <p v-if="ok" class="ok">{{ ok }}</p>
      <button type="submit" :disabled="submitting">Create login</button>
    </form>
  </section>
</template>

<style scoped>
.muted { color: var(--muted); }
.ok { color: var(--good); font-weight: 500; }
</style>
