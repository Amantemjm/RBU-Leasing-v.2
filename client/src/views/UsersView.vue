<script setup>
import { reactive, ref } from "vue";
import { createUser } from "../lib/resource.js";

const error = ref("");
const ok = ref("");
const submitting = ref(false);
const ROLES = ["ADMIN", "LEASING_OFFICER", "VIEWER", "UNIT_OWNER", "TENANT"];

const form = reactive({ name: "", email: "", password: "", role: "VIEWER" });

async function submit() {
  error.value = "";
  ok.value = "";
  submitting.value = true;
  try {
    const u = await createUser({ name: form.name, email: form.email, password: form.password, role: form.role });
    ok.value = `Created ${u.email} (${u.role}).`;
    form.name = ""; form.email = ""; form.password = "";
  } catch (e) {
    error.value = e.response?.data?.error || "Create failed";
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <section>
    <h1>Master Admin</h1>
    <p class="muted">Create a login — display name, username, and password.</p>
    <form @submit.prevent="submit">
      <div class="field"><label for="name">Display name</label><input id="name" type="text" v-model="form.name" /></div>
      <div class="field"><label for="email">Username</label><input id="email" type="text" v-model="form.email" autocomplete="off" /></div>
      <div class="field"><label for="password">Password</label><input id="password" type="text" v-model="form.password" /></div>
      <div class="field">
        <label for="role">Role</label>
        <select id="role" v-model="form.role"><option v-for="r in ROLES" :key="r" :value="r">{{ r }}</option></select>
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
