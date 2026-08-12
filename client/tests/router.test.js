import { describe, it, expect, beforeEach } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import router from "../src/router/index.js";
import InquiryView from "../src/views/InquiryView.vue";
import { useAuthStore } from "../src/stores/auth.js";

describe("router", () => {
  beforeEach(() => setActivePinia(createPinia()));

  it("serves the Inquiry page at both / and /inquiry", () => {
    expect(router.resolve("/").matched[0].components.default).toBe(InquiryView);
    expect(router.resolve("/inquiry").matched[0].components.default).toBe(InquiryView);
  });

  it("sends an unauthenticated visitor from the app to /login", async () => {
    await router.push("/app/owners");
    expect(router.currentRoute.value.path).toBe("/login");
  });

  it("redirects a unit owner away from staff routes to My Units", async () => {
    useAuthStore().setSession({ token: "t", user: { role: "UNIT_OWNER", unitOwnerId: "o1" } });
    await router.push("/app/owners");
    expect(router.currentRoute.value.path).toBe("/app/my-units");
    await router.push("/app/my-income"); // its own route is allowed
    expect(router.currentRoute.value.path).toBe("/app/my-income");
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

  it("restricts Master Admin to the super admin", async () => {
    useAuthStore().setSession({ token: "t", user: { role: "LEASING_OFFICER" } });
    await router.push("/app/admin");
    expect(router.currentRoute.value.path).toBe("/app"); // officer redirected home

    useAuthStore().setSession({ token: "t", user: { role: "ADMIN" } });
    await router.push("/app/admin");
    expect(router.currentRoute.value.path).toBe("/app/admin");
  });
});
