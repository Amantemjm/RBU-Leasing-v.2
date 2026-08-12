import { describe, it, expect, vi } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";

vi.mock("../src/lib/resource.js", () => ({
  leases: {
    list: vi.fn(() => Promise.resolve([
      { id: "l1", unit: { unitNumber: "12A", owner: { name: "Ayala Land" } }, tenant: { name: "Juan" },
        startDate: "2026-01-01", endDate: "2026-12-31", monthlyRent: "30000", deposit: "60000", status: "ACTIVE" },
    ])),
  },
  payments: {
    list: vi.fn(() => Promise.resolve([
      { id: "p1", periodMonth: "2026-01-01", amount: "30000", dueDate: "2026-01-05", paidDate: "2026-01-04",
        status: "PAID", lease: { unit: { unitNumber: "12A" }, tenant: { name: "Juan" } } },
      { id: "p2", periodMonth: "2026-02-01", amount: "25000", dueDate: "2026-02-05", paidDate: null,
        status: "PENDING", lease: { unit: { unitNumber: "12A" }, tenant: { name: "Juan" } } },
    ])),
  },
  ownerMe: vi.fn(() => Promise.resolve({ name: "Ayala Land", email: "owner@x.com", phone: "123", address: "Pasig" })),
  tenantMe: vi.fn(() => Promise.resolve({ name: "Juan Dela Cruz", email: "tenant@x.com", phone: "456", address: "QC" })),
}));

import OwnerLeasesView from "../src/views/OwnerLeasesView.vue";
import OwnerIncomeView from "../src/views/OwnerIncomeView.vue";
import OwnerProfileView from "../src/views/OwnerProfileView.vue";
import TenantLeaseView from "../src/views/TenantLeaseView.vue";
import TenantPaymentsView from "../src/views/TenantPaymentsView.vue";
import TenantProfileView from "../src/views/TenantProfileView.vue";
import MyProfileView from "../src/views/MyProfileView.vue";
import { useAuthStore } from "../src/stores/auth.js";

describe("Owner portal views", () => {
  it("My Leases lists the owner's leases with unit + tenant names", async () => {
    const w = mount(OwnerLeasesView);
    await flushPromises();
    expect(w.text()).toContain("12A");
    expect(w.text()).toContain("Juan");
    expect(w.text()).toContain("30,000");
    expect(w.findAll("button").length).toBe(0); // read-only, no actions
  });

  it("My Income totals collected and outstanding", async () => {
    const w = mount(OwnerIncomeView);
    await flushPromises();
    expect(w.text()).toContain("Collected");
    expect(w.text()).toContain("30,000"); // p1 paid
    expect(w.text()).toContain("Outstanding");
    expect(w.text()).toContain("25,000"); // p2 unpaid
  });

  it("My Profile shows the owner's record", async () => {
    const w = mount(OwnerProfileView);
    await flushPromises();
    expect(w.text()).toContain("Ayala Land");
    expect(w.text()).toContain("owner@x.com");
  });
});

describe("Tenant portal views", () => {
  it("My Lease lists the tenant's lease with unit + owner", async () => {
    const w = mount(TenantLeaseView);
    await flushPromises();
    expect(w.text()).toContain("12A");
    expect(w.text()).toContain("Ayala Land");
    expect(w.text()).toContain("60,000"); // deposit
  });

  it("My Payments shows outstanding balance", async () => {
    const w = mount(TenantPaymentsView);
    await flushPromises();
    expect(w.text()).toContain("Outstanding balance");
    expect(w.text()).toContain("25,000");
  });

  it("My Profile shows the tenant's record", async () => {
    const w = mount(TenantProfileView);
    await flushPromises();
    expect(w.text()).toContain("Juan Dela Cruz");
  });
});

describe("MyProfileView delegates by role", () => {
  it("renders the owner profile for a unit owner", async () => {
    setActivePinia(createPinia());
    useAuthStore().setSession({ token: "t", user: { role: "UNIT_OWNER", unitOwnerId: "o1" } });
    const w = mount(MyProfileView);
    await flushPromises();
    expect(w.text()).toContain("Ayala Land");
  });

  it("renders the tenant profile for a tenant", async () => {
    setActivePinia(createPinia());
    useAuthStore().setSession({ token: "t", user: { role: "TENANT", tenantId: "t1" } });
    const w = mount(MyProfileView);
    await flushPromises();
    expect(w.text()).toContain("Juan Dela Cruz");
  });
});
