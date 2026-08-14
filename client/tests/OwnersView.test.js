import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { createRouter, createMemoryHistory } from "vue-router";

vi.mock("../src/lib/resource.js", () => ({
  owners: {
    list: vi.fn(() => Promise.resolve([{ id: "1", name: "Ayala", email: "a@x.com", phone: "1" }])),
    remove: vi.fn(() => Promise.resolve()),
  },
}));

import OwnersView from "../src/views/OwnersView.vue";
import { useAuthStore } from "../src/stores/auth.js";

const stub = { template: "<div/>" };
function makeRouter() {
  return createRouter({ history: createMemoryHistory(), routes: [
    { path: "/owners", component: OwnersView },
    { path: "/owners/new", component: stub },
    { path: "/owners/:id", component: stub },
  ]});
}

async function mountView(role) {
  setActivePinia(createPinia());
  if (role) useAuthStore().setSession({ token: "t", user: { role } });
  const router = makeRouter(); router.push("/owners"); await router.isReady();
  const w = mount(OwnersView, { global: { plugins: [router] } });
  await flushPromises();
  return w;
}

describe("OwnersView", () => {
  beforeEach(() => setActivePinia(createPinia()));
  it("lists owners from the API", async () => {
    const w = await mountView("VIEWER");
    expect(w.text()).toContain("Ayala");
  });
  it("shows write controls for the Super Admin", async () => {
    const w = await mountView("ADMIN");
    expect(w.text()).toContain("New owner");
  });
  it("is read-only for a non-admin (even a write role)", async () => {
    const w = await mountView("LEASING_OFFICER");
    expect(w.text()).not.toContain("New owner");
  });
});
