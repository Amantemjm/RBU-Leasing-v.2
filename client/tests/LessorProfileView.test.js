import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { createRouter, createMemoryHistory } from "vue-router";

const profile = {
  owner: { id: "o1", name: "Capitol Heights", email: "c@x.com", phone: "0917", address: "Pasig", assignedOfficer: { id: "u1", name: "Officer Jane" } },
  account: { contactEmail: "c@x.com", status: "APPROVED" },
  units: [{ id: "u1", unitNumber: "12A", tower: "Imperium", approvalStatus: "SUBMITTED", reviewRemarks: null, updatedAt: "2026-08-27T00:00:00Z" }],
  requirements: { items: [{ requirementKey: "GOV_ID", label: "Valid Government ID", status: "Approved" }], summary: { approved: 1, total: 7 } },
  acceptanceForm: { status: "SUBMITTED", submittedAt: "2026-08-27T00:00:00Z", reviewedAt: null, submittedByName: "Ayala Land", formVersion: "2026-08" },
  activity: [{ at: "2026-08-27T00:00:00Z", kind: "unit", label: "Unit 12A — SUBMITTED" }],
  onboarding: { stage: "Requirements complete", percent: 50, steps: [
    { key: "account", label: "Account approved", done: true },
    { key: "units", label: "Unit approved", done: true, detail: "1 approved" },
    { key: "requirements", label: "Requirements complete", done: false, detail: "2 of 7" },
    { key: "acceptanceForm", label: "Acceptance form approved", done: false, detail: "Not started" },
  ] },
  originInquiry: { id: "i1", inquiryType: "List Unit for Lease", createdAt: "2026-08-01T00:00:00.000Z" },
};
vi.mock("../src/lib/resource.js", () => ({ owners: { profile: vi.fn(() => Promise.resolve(profile)) } }));

import LessorProfileView from "../src/views/LessorProfileView.vue";
import { owners } from "../src/lib/resource.js";

const stub = { template: "<div/>" };
async function mountView() {
  const router = createRouter({ history: createMemoryHistory(), routes: [
    { path: "/app/lessor-profile/:id", component: LessorProfileView },
    { path: "/:pathMatch(.*)*", component: stub },
  ]});
  router.push("/app/lessor-profile/o1");
  await router.isReady();
  const w = mount(LessorProfileView, { global: { plugins: [router] } });
  await flushPromises();
  return w;
}

describe("LessorProfileView", () => {
  beforeEach(() => owners.profile.mockClear());
  it("renders the header, units, requirements summary, form and activity", async () => {
    const w = await mountView();
    expect(owners.profile).toHaveBeenCalledWith("o1");
    expect(w.text()).toContain("Capitol Heights");
    expect(w.text()).toContain("12A");
    expect(w.text()).toContain("1 of 7");           // requirements summary
    expect(w.text()).toContain("Valid Government ID");
    expect(w.text()).toContain("SUBMITTED");        // form/unit status
    expect(w.text()).toContain("Ayala Land");        // acceptance form submitted-by
    expect(w.text()).toContain("2026-08");           // acceptance form version
    expect(w.text()).toContain("Unit 12A — SUBMITTED"); // activity
    expect(w.text()).toContain("Requirements complete"); // onboarding stage
    expect(w.text()).toContain("Unit approved");          // onboarding step label
    expect(w.text()).toContain("List Unit for Lease");    // originating inquiry
  });
});
