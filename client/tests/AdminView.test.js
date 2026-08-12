import { describe, it, expect, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";

// Stub the embedded section views so the test focuses on tab behaviour.
vi.mock("../src/views/ApprovalsView.vue", () => ({ default: { template: "<div>ApprovalsPanel</div>" } }));
vi.mock("../src/views/RequirementsView.vue", () => ({ default: { template: "<div>RequirementsPanel</div>" } }));
vi.mock("../src/views/OwnersView.vue", () => ({ default: { template: "<div>OwnersPanel</div>" } }));
vi.mock("../src/views/UnitsView.vue", () => ({ default: { template: "<div>UnitsPanel</div>" } }));
vi.mock("../src/views/TenantsView.vue", () => ({ default: { template: "<div>TenantsPanel</div>" } }));
vi.mock("../src/views/LeasesView.vue", () => ({ default: { template: "<div>LeasesPanel</div>" } }));
vi.mock("../src/views/UsersView.vue", () => ({ default: { template: "<div>UsersPanel</div>" } }));

import AdminView from "../src/views/AdminView.vue";
import { useAuthStore } from "../src/stores/auth.js";

function mountAs(role) {
  setActivePinia(createPinia());
  useAuthStore().setSession({ token: "t", user: { role } });
  return mount(AdminView);
}
function tab(w, label) {
  return w.findAll("button.tab").find((b) => b.text() === label);
}

describe("AdminView", () => {
  it("shows a tab for each management section and defaults to Approvals inline", () => {
    const w = mountAs("LEASING_OFFICER");
    for (const label of ["Approvals", "Requirements", "Owners", "Units", "Tenants", "Leases"]) {
      expect(tab(w, label)).toBeTruthy();
    }
    expect(w.text()).toContain("ApprovalsPanel"); // data shown below, no navigation
  });

  it("switches the panel inline when a tab is clicked", async () => {
    const w = mountAs("LEASING_OFFICER");
    await tab(w, "Owners").trigger("click");
    expect(w.text()).toContain("OwnersPanel");
    expect(w.text()).not.toContain("ApprovalsPanel");
  });

  it("adds a Users tab for the super admin", () => {
    expect(tab(mountAs("ADMIN"), "Users")).toBeTruthy();
  });

  it("hides the Users tab from non-admin staff", () => {
    expect(tab(mountAs("LEASING_OFFICER"), "Users")).toBeUndefined();
  });
});
