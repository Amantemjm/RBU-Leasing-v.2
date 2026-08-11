import { describe, it, expect, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { createRouter, createMemoryHistory } from "vue-router";
import AppLayout from "../src/components/AppLayout.vue";
import { useAuthStore } from "../src/stores/auth.js";

const stub = { template: "<div/>" };
function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/", component: stub }, { path: "/login", component: stub },
      { path: "/summary", component: stub }, { path: "/reports", component: stub },
      { path: "/admin", component: stub }, { path: "/owners", component: stub },
      { path: "/units", component: stub }, { path: "/tenants", component: stub },
      { path: "/leases", component: stub }, { path: "/payments", component: stub },
    ],
  });
}

describe("AppLayout", () => {
  beforeEach(() => setActivePinia(createPinia()));

  it("renders the top-level staff nav links", async () => {
    const router = makeRouter(); router.push("/"); await router.isReady();
    const w = mount(AppLayout, { global: { plugins: [router] } });
    for (const label of ["Dashboard", "Summary", "Reports"]) {
      expect(w.text()).toContain(label);
    }
  });

  it("shows the Master Admin hub link for staff who can write", async () => {
    const auth = useAuthStore();
    auth.setSession({ token: "t", user: { email: "o@b.c", role: "LEASING_OFFICER" } });
    const router = makeRouter(); router.push("/"); await router.isReady();
    const w = mount(AppLayout, { global: { plugins: [router] } });
    expect(w.text()).toContain("Master Admin");
    // management sections are no longer top-level nav
    expect(w.find("nav.app-nav").text()).not.toContain("Owners");
  });

  it("logout clears the auth store", async () => {
    const auth = useAuthStore();
    auth.setSession({ token: "t", user: { email: "a@b.c", role: "ADMIN" } });
    const router = makeRouter(); router.push("/"); await router.isReady();
    const w = mount(AppLayout, { global: { plugins: [router] } });
    await w.find("button.logout").trigger("click");
    expect(auth.isAuthenticated).toBe(false);
  });
});
