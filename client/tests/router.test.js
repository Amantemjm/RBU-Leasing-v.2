import { describe, it, expect, beforeEach } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import router from "../src/router/index.js";
import InquiryStartView from "../src/views/InquiryStartView.vue";
import InquiryView from "../src/views/InquiryView.vue";
import AvailableUnitsView from "../src/views/AvailableUnitsView.vue";
import { useAuthStore } from "../src/stores/auth.js";

describe("router", () => {
  beforeEach(() => setActivePinia(createPinia()));

  it("serves Available Units at /, the user-type start page at /inquire, and the Inquiry form at /inquiry", () => {
    expect(router.resolve("/").matched[0].components.default).toBe(AvailableUnitsView);
    expect(router.resolve("/inquire").matched[0].components.default).toBe(InquiryStartView);
    expect(router.resolve("/inquiry").matched[0].components.default).toBe(InquiryView);
  });

  it("redirects the old /units-for-lease list path to the home page", async () => {
    await router.push("/units-for-lease");
    expect(router.currentRoute.value.path).toBe("/");
  });

  it("sends an unauthenticated visitor from the app to /login", async () => {
    await router.push("/app/owners");
    expect(router.currentRoute.value.path).toBe("/login");
  });

  it("redirects a unit owner away from staff routes to My Units", async () => {
    useAuthStore().setSession({ token: "t", user: { role: "UNIT_OWNER", unitOwnerId: "o1" } });
    await router.push("/app/owners");
    expect(router.currentRoute.value.path).toBe("/app/my-units");
    await router.push("/app/my-leases"); // its own route is allowed
    expect(router.currentRoute.value.path).toBe("/app/my-leases");
  });

  it("redirects a tenant away from staff/owner routes to My Lease", async () => {
    useAuthStore().setSession({ token: "t", user: { role: "TENANT", tenantId: "t1" } });
    await router.push("/app/leases");
    expect(router.currentRoute.value.path).toBe("/app/my-lease");
    await router.push("/app/my-units");
    expect(router.currentRoute.value.path).toBe("/app/my-lease");
  });

  it("lets staff reach staff routes", async () => {
    useAuthStore().setSession({ token: "t", user: { role: "VIEWER" } });
    await router.push("/app/owners");
    expect(router.currentRoute.value.path).toBe("/app/owners");
  });

  it("restricts Users and Audit to the super admin", async () => {
    useAuthStore().setSession({ token: "t", user: { role: "LEASING_OFFICER" } });
    await router.push("/app/audit");
    expect(router.currentRoute.value.path).toBe("/app"); // officer redirected home

    useAuthStore().setSession({ token: "t", user: { role: "ADMIN" } });
    await router.push("/app/audit");
    expect(router.currentRoute.value.path).toBe("/app/audit");
  });
});
