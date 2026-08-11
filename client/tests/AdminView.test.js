import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import AdminView from "../src/views/AdminView.vue";
import { useAuthStore } from "../src/stores/auth.js";

const RouterLinkStub = { props: ["to"], template: "<a class='rl'><slot/></a>" };
function mountAs(role) {
  setActivePinia(createPinia());
  useAuthStore().setSession({ token: "t", user: { role } });
  return mount(AdminView, { global: { stubs: { RouterLink: RouterLinkStub } } });
}

describe("AdminView", () => {
  it("shows the seven management sections", () => {
    const w = mountAs("LEASING_OFFICER");
    for (const label of ["Approvals", "Requirements", "Owners", "Units", "Tenants", "Leases", "Payments"]) {
      expect(w.text()).toContain(label);
    }
  });

  it("adds a Users card for the super admin", () => {
    expect(mountAs("ADMIN").text()).toContain("Users");
  });

  it("hides the Users card from non-admin staff", () => {
    expect(mountAs("LEASING_OFFICER").text()).not.toContain("Users");
  });
});
