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
    routes: [{ path: "/:pathMatch(.*)*", component: stub }],
  });
}
function mountAs(role) {
  const auth = useAuthStore();
  if (role) auth.setSession({ token: "t", user: { name: "Test User", role } });
  const router = makeRouter(); router.push("/app"); router.isReady();
  return mount(AppLayout, { global: { plugins: [router] } });
}

describe("AppLayout (sidebar shell)", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
  });

  // The theme control now lives in ThemeToggle, mounted once at the app root so
  // it appears on public pages too — see tests/ThemeToggle.test.js and App.test.js.
  it("no longer carries a theme picker in the user menu", async () => {
    const w = mountAs("LEASING_OFFICER");
    await w.find(".userchip").trigger("click");
    expect(w.find(".themepick").exists()).toBe(false);
  });

  it("lists the staff functions in the sidebar", async () => {
    const nav = mountAs("LEASING_OFFICER").find(".sidebar__nav").text();
    for (const label of ["Dashboard", "Inquiries", "Owners", "Units", "Tenants", "Leases", "Approvals", "Lessor Sheets", "Lessee Sheets"]) {
      expect(nav).toContain(label);
    }
  });

  it("shows System Users and Audit Trail only to the super admin", () => {
    expect(mountAs("LEASING_OFFICER").find(".sidebar__nav").text()).not.toContain("Audit Trail");
    const adminNav = mountAs("ADMIN").find(".sidebar__nav").text();
    expect(adminNav).toContain("System Users");
    expect(adminNav).toContain("Audit Trail");
  });

  it("names the CMS section Content Manager, not Forms", () => {
    const nav = mountAs("ADMIN").find(".sidebar__nav");
    expect(nav.text()).toContain("Content Manager");
    const link = nav.findAll("a").find((a) => a.attributes("href") === "/app/forms");
    expect(link.text()).toBe("Content Manager");
  });

  // The breadcrumb reads from the same nav label, so it must follow the rename.
  it("shows the renamed label in the breadcrumb", async () => {
    const auth = useAuthStore();
    auth.setSession({ token: "t", user: { name: "Test User", role: "ADMIN" } });
    const router = makeRouter();
    router.push("/app/forms");
    await router.isReady();
    const w = mount(AppLayout, { global: { plugins: [router] } });
    expect(w.find(".crumbs__here").text()).toBe("Content Manager");
  });

  it("gives owners and tenants their own sidebar", () => {
    expect(mountAs("UNIT_OWNER").find(".sidebar__nav").text()).toContain("My Units");
    const tenantNav = mountAs("TENANT").find(".sidebar__nav").text();
    expect(tenantNav).toContain("My Lease");
    expect(tenantNav).not.toContain("Owners");
  });

  it("logout clears the auth store", async () => {
    const auth = useAuthStore();
    const w = mountAs("ADMIN");
    await w.find("button.logout").trigger("click");
    expect(auth.isAuthenticated).toBe(false);
  });
});
