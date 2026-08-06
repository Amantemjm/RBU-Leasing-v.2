import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { createRouter, createMemoryHistory } from "vue-router";

vi.mock("../src/lib/resource.js", () => ({
  payments: {
    list: vi.fn(() => Promise.resolve([{ id: "p1", leaseId: "l1", amount: "30000", status: "PAID", dueDate: "2026-01-05T00:00:00.000Z" }])),
    remove: vi.fn(() => Promise.resolve()),
  },
}));

import PaymentsView from "../src/views/PaymentsView.vue";
import { useAuthStore } from "../src/stores/auth.js";

const stub = { template: "<div/>" };
function makeRouter() {
  return createRouter({ history: createMemoryHistory(), routes: [
    { path: "/payments", component: PaymentsView },
    { path: "/payments/new", component: stub },
    { path: "/payments/:id", component: stub },
  ]});
}
async function mountView(role) {
  setActivePinia(createPinia());
  if (role) useAuthStore().setSession({ token: "t", user: { role } });
  const router = makeRouter(); router.push("/payments"); await router.isReady();
  const w = mount(PaymentsView, { global: { plugins: [router] } });
  await flushPromises();
  return w;
}

describe("PaymentsView", () => {
  beforeEach(() => setActivePinia(createPinia()));
  it("lists payments with PHP amount", async () => {
    const w = await mountView("VIEWER");
    expect(w.text()).toContain("30,000");
    expect(w.text()).toContain("PAID");
  });
  it("shows New for an officer", async () => {
    const w = await mountView("LEASING_OFFICER");
    expect(w.text()).toContain("New payment");
  });
  it("hides New for a viewer", async () => {
    const w = await mountView("VIEWER");
    expect(w.text()).not.toContain("New payment");
  });
});
