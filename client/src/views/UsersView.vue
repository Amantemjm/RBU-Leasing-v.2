<script setup>
import { reactive, ref, computed, onMounted } from "vue";
import { createUser, listUsers, updateUser, deleteUser } from "../lib/resource.js";
import { formatDate, ROLE_OPTIONS, roleLabel } from "../lib/formatters.js";

const SUPER_ADMIN_EMAIL = "admin@rbu.local";
const SUPER_ADMIN_PASSWORD = "admin123"; // seeded default

const accounts = ref([]);
const loading = ref(false);
const listError = ref("");

const showForm = ref(false);
const editingId = ref(null);
const error = ref("");
const submitting = ref(false);
const form = reactive({ name: "", email: "", password: "", role: "LEASING_OFFICER" });

const isEditing = computed(() => editingId.value !== null);
const editingSuperAdmin = computed(() => isEditing.value && form.email === SUPER_ADMIN_EMAIL);
const superAdmin = computed(() => accounts.value.find((u) => u.email === SUPER_ADMIN_EMAIL));

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

function openCreate() {
  editingId.value = null;
  error.value = "";
  form.name = ""; form.email = ""; form.password = ""; form.role = "LEASING_OFFICER";
  showForm.value = true;
}
function openEdit(u) {
  editingId.value = u.id;
  error.value = "";
  form.name = u.name; form.email = u.email; form.password = ""; form.role = u.role;
  showForm.value = true;
}
function closeForm() {
  if (!submitting.value) showForm.value = false;
}

async function submit() {
  error.value = "";
  submitting.value = true;
  try {
    if (isEditing.value) {
      const payload = { name: form.name, email: form.email, role: form.role };
      if (form.password) payload.password = form.password;
      await updateUser(editingId.value, payload);
    } else {
      await createUser({ name: form.name, email: form.email, password: form.password, role: form.role });
    }
    showForm.value = false;
    await load();
  } catch (e) {
    error.value = e.response?.data?.error || "Save failed";
  } finally {
    submitting.value = false;
  }
}

async function remove(u) {
  if (!window.confirm(`Delete the login "${u.email}"? This cannot be undone.`)) return;
  try {
    await deleteUser(u.id);
    await load();
  } catch (e) {
    listError.value = e.response?.data?.error || "Delete failed";
  }
}
</script>

<template>
  <section>
    <RouterLink to="/admin" class="back">&larr; Administration</RouterLink>
    <div class="head">
      <div>
        <h1>Users</h1>
        <p class="muted">Login credentials with access to the system.</p>
      </div>
      <button type="button" class="primary" @click="openCreate">New account</button>
    </div>

    <div v-if="superAdmin" class="super-cred">
      <div class="super-cred__title">Super admin credential</div>
      <div class="super-cred__rows">
        <div><span class="k">Username</span><span class="v">{{ superAdmin.email }}</span></div>
        <div><span class="k">Password</span><span class="v">{{ SUPER_ADMIN_PASSWORD }}</span></div>
      </div>
      <small class="muted">Seeded default. If you change it with Edit, this note will be out of date.</small>
    </div>

    <p v-if="listError" class="error">{{ listError }}</p>
    <p v-else-if="loading" class="muted">Loading…</p>
    <table v-else class="grid">
      <thead>
        <tr><th>Display name</th><th>Username</th><th>Role</th><th>Created</th><th></th></tr>
      </thead>
      <tbody>
        <tr v-for="u in accounts" :key="u.id">
          <td>{{ u.name }}</td>
          <td>
            {{ u.email }}
            <span v-if="u.email === SUPER_ADMIN_EMAIL" class="super-tag">Super admin</span>
          </td>
          <td><span class="role-tag">{{ roleLabel(u.role) }}</span></td>
          <td>{{ formatDate(u.createdAt) }}</td>
          <td class="row-actions">
            <button type="button" class="link" @click="openEdit(u)">Edit</button>
            <button
              type="button"
              class="link danger"
              :disabled="u.email === SUPER_ADMIN_EMAIL"
              @click="remove(u)"
            >Delete</button>
          </td>
        </tr>
        <tr v-if="!accounts.length"><td colspan="5" class="muted">No accounts yet.</td></tr>
      </tbody>
    </table>

    <div v-if="showForm" class="modal-backdrop" @click.self="closeForm">
      <div class="modal" role="dialog" aria-modal="true" :aria-label="isEditing ? 'Edit account' : 'New account'">
        <h2>{{ isEditing ? "Edit account" : "New account" }}</h2>
        <form @submit.prevent="submit">
          <div class="field"><label for="name">Display name</label><input id="name" type="text" v-model="form.name" /></div>
          <div class="field"><label for="email">Username</label><input id="email" type="text" v-model="form.email" autocomplete="off" /></div>
          <div class="field">
            <label for="password">Password <span v-if="isEditing" class="muted">(leave blank to keep)</span></label>
            <input id="password" type="text" v-model="form.password" autocomplete="off" />
          </div>
          <div class="field">
            <label for="role">Role</label>
            <select id="role" v-model="form.role" :disabled="editingSuperAdmin">
              <option v-for="r in ROLE_OPTIONS" :key="r.value" :value="r.value">{{ r.label }}</option>
            </select>
            <small v-if="editingSuperAdmin" class="muted">The super admin must remain an ADMIN.</small>
          </div>
          <p v-if="error" class="error">{{ error }}</p>
          <div class="modal-actions">
            <button type="button" class="ghost" @click="closeForm" :disabled="submitting">Cancel</button>
            <button type="submit" class="primary" :disabled="submitting">{{ isEditing ? "Save changes" : "Create login" }}</button>
          </div>
        </form>
      </div>
    </div>
  </section>
</template>

<style scoped>
.back { display: inline-block; margin-bottom: 0.75rem; color: var(--muted); text-decoration: none; font-size: 0.85rem; }
.back:hover { color: var(--accent); }
.head { display: flex; align-items: flex-start; justify-content: space-between; gap: 1rem; }
.muted { color: var(--muted); }
.super-cred {
  margin: 0.5rem 0 1.25rem; padding: 0.9rem 1.1rem;
  border: 1px solid rgba(46, 92, 173, 0.25); border-left: 3px solid #2e5cad;
  border-radius: var(--radius-sm); background: rgba(46, 92, 173, 0.06);
}
.super-cred__title {
  font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.1em;
  color: #2e5cad; font-weight: 700; margin-bottom: 0.5rem;
}
.super-cred__rows { display: flex; gap: 2rem; flex-wrap: wrap; margin-bottom: 0.4rem; }
.super-cred__rows .k { display: block; font-size: 0.66rem; text-transform: uppercase; letter-spacing: 0.08em; color: var(--muted); }
.super-cred__rows .v { font-family: ui-monospace, "Cascadia Code", "Consolas", monospace; font-weight: 600; font-size: 0.95rem; }
.role-tag {
  font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.08em;
  padding: 0.15rem 0.45rem; border-radius: var(--radius-sm);
  background: rgba(201, 162, 74, 0.16); color: #a97f27;
}
.super-tag {
  margin-left: 0.4rem; font-size: 0.62rem; text-transform: uppercase; letter-spacing: 0.08em;
  padding: 0.12rem 0.4rem; border-radius: var(--radius-sm);
  background: rgba(46, 92, 173, 0.14); color: #2e5cad;
}
.row-actions { display: flex; gap: 0.75rem; }
.link {
  background: none; border: none; padding: 0; cursor: pointer;
  color: var(--accent); font: inherit; font-weight: 500;
}
.link:hover { text-decoration: underline; }
.link.danger { color: #c0392b; }
.link:disabled { color: var(--muted); cursor: not-allowed; text-decoration: none; }
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
