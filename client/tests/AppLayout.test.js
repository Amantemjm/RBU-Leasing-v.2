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

  it("shows the management sections in the staff nav", async () => {
    const auth = useAuthStore();
    auth.setSession({ token: "t", user: { email: "o@b.c", role: "LEASING_OFFICER" } });
    const router = makeRouter(); router.push("/"); await router.isReady();
    const w = mount(AppLayout, { global: { plugins: [router] } });
    const nav = w.find("nav.app-nav").text();
    for (const label of ["Dashboard", "Summary", "Reports", "Inquiries", "Owners", "Units", "Tenants", "Leases", "Payments", "Approvals"]) {
      expect(nav).toContain(label);
    }
  });

  it("shows Master Admin only to the super admin", async () => {
    const auth = useAuthStore();
    auth.setSession({ token: "t", user: { role: "LEASING_OFFICER" } });
    let router = makeRouter(); router.push("/"); await router.isReady();
    expect(mount(AppLayout, { global: { plugins: [router] } }).text()).not.toContain("Master Admin");

    auth.setSession({ token: "t", user: { role: "ADMIN" } });
    router = makeRouter(); router.push("/"); await router.isReady();
    expect(mount(AppLayout, { global: { plugins: [router] } }).text()).toContain("Master Admin");
  });

  it("toggles the color theme via data-theme", async () => {
    const router = makeRouter(); router.push("/"); await router.isReady();
    const w = mount(AppLayout, { global: { plugins: [router] } });
    const btn = w.find("button.theme-toggle");
    await btn.trigger("click");
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    await btn.trigger("click");
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    document.documentElement.removeAttribute("data-theme");
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
