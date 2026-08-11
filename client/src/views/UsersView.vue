<script setup>
import { reactive, ref, onMounted } from "vue";
import { createUser, listUsers } from "../lib/resource.js";
import { formatDate } from "../lib/formatters.js";

const ROLES = ["ADMIN", "LEASING_OFFICER", "VIEWER", "UNIT_OWNER", "TENANT"];

const accounts = ref([]);
const loading = ref(false);
const listError = ref("");

const showForm = ref(false);
const error = ref("");
const submitting = ref(false);
const form = reactive({ name: "", email: "", password: "", role: "VIEWER" });

async function load() {
  loading.value = true;
  listError.value = "";
  try {
    accounts.value = await listUsers();
  } catch (e) {
    listError.value = e.response?.data?.error || "Could not load accounts";
  } finally {
    loading.value = false;
  }
}
onMounted(load);

function openForm() {
  error.value = "";
  form.name = ""; form.email = ""; form.password = ""; form.role = "VIEWER";
  showForm.value = true;
}
function closeForm() {
  if (!submitting.value) showForm.value = false;
}

async function submit() {
  error.value = "";
  submitting.value = true;
  try {
    await createUser({ name: form.name, email: form.email, password: form.password, role: form.role });
    showForm.value = false;
    await load();
  } catch (e) {
    error.value = e.response?.data?.error || "Create failed";
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <section>
    <div class="head">
      <div>
        <h1>Master Admin</h1>
        <p class="muted">Login credentials with access to the system.</p>
      </div>
      <button type="button" class="primary" @click="openForm">New account</button>
    </div>

    <p v-if="listError" class="error">{{ listError }}</p>
    <p v-else-if="loading" class="muted">Loading…</p>
    <table v-else class="grid">
      <thead>
        <tr><th>Display name</th><th>Username</th><th>Role</th><th>Created</th></tr>
      </thead>
      <tbody>
        <tr v-for="u in accounts" :key="u.id">
          <td>{{ u.name }}</td>
          <td>{{ u.email }}</td>
          <td><span class="role-tag">{{ u.role }}</span></td>
          <td>{{ formatDate(u.createdAt) }}</td>
        </tr>
        <tr v-if="!accounts.length"><td colspan="4" class="muted">No accounts yet.</td></tr>
      </tbody>
    </table>

    <div v-if="showForm" class="modal-backdrop" @click.self="closeForm">
      <div class="modal" role="dialog" aria-modal="true" aria-label="New account">
        <h2>New account</h2>
        <form @submit.prevent="submit">
          <div class="field"><label for="name">Display name</label><input id="name" type="text" v-model="form.name" /></div>
          <div class="field"><label for="email">Username</label><input id="email" type="text" v-model="form.email" autocomplete="off" /></div>
          <div class="field"><label for="password">Password</label><input id="password" type="text" v-model="form.password" /></div>
          <div class="field">
            <label for="role">Role</label>
            <select id="role" v-model="form.role"><option v-for="r in ROLES" :key="r" :value="r">{{ r }}</option></select>
          </div>
          <p v-if="error" class="error">{{ error }}</p>
          <div class="modal-actions">
            <button type="button" class="ghost" @click="closeForm" :disabled="submitting">Cancel</button>
            <button type="submit" class="primary" :disabled="submitting">Create login</button>
          </div>
        </form>
      </div>
    </div>
  </section>
</template>

<style scoped>
.head { display: flex; align-items: flex-start; justify-content: space-between; gap: 1rem; }
.muted { color: var(--muted); }
.role-tag {
  font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.08em;
  padding: 0.15rem 0.45rem; border-radius: var(--radius-sm);
  background: rgba(201, 162, 74, 0.16); color: #a97f27;
}
.modal-backdrop {
  position: fixed; inset: 0; background: rgba(15, 22, 33, 0.55);
  display: flex; align-items: center; justify-content: center; padding: 1.5rem; z-index: 50;
}
.modal {
  background: var(--surface, #fff); border-radius: var(--radius); padding: 1.5rem;
  width: 100%; max-width: 26rem; box-shadow: 0 24px 60px rgba(0, 0, 0, 0.28);
}
.modal h2 { margin: 0 0 1rem; }
.modal-actions { display: flex; justify-content: flex-end; gap: 0.6rem; margin-top: 0.5rem; }
</style>
