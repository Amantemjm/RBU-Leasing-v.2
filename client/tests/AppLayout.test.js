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
  beforeEach(() => setActivePinia(createPinia()));

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
