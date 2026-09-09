import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { createRouter, createMemoryHistory } from "vue-router";
import { createPinia, setActivePinia } from "pinia";

vi.mock("../src/lib/inquiries.js", () => ({
  createInquiry: vi.fn(() => Promise.resolve({ id: "i1", status: "NEW" })),
}));
vi.mock("../src/lib/resource.js", () => ({
  publicUnits: { get: vi.fn(() => Promise.resolve({ unitId: "u1", headline: "Elegant 2BR", details: { unitNumber: "12A", propertyName: "Empress at Capitol Commons" } })) },
}));

import InquiryView from "../src/views/InquiryView.vue";
import { createInquiry } from "../src/lib/inquiries.js";
import { publicUnits } from "../src/lib/resource.js";

const stub = { template: "<div/>" };
function makeRouter() {
  return createRouter({ history: createMemoryHistory(), routes: [
    { path: "/", component: InquiryView }, { path: "/login", component: stub },
  ]});
}
// The role may arrive from a unit page or the landing as ?as=…, or not at all.
// Passing null mounts the bare /inquiry route, which is now a valid entry.
async function mountView(as = "LESSEE") {
  setActivePinia(createPinia());
  const router = makeRouter();
  router.push(as ? { path: "/", query: { as } } : { path: "/" });
  await router.isReady();
  return mount(InquiryView, { global: { plugins: [router] } });
}

async function mountWithUnit() {
  setActivePinia(createPinia());
  const router = makeRouter();
  router.push({ path: "/", query: { as: "LESSEE", unit: "u1" } });
  await router.isReady();
  const w = mount(InquiryView, { global: { plugins: [router] } });
  await flushPromises();
  return w;
}

describe("InquiryView (Quick Inquiry form)", () => {
  beforeEach(() => createInquiry.mockClear());

  it("shows the OCLP consent text", async () => {
    const w = await mountView();
    expect(w.text()).toContain(
      "I consent to Ortigas and Company, Limited Partnership (OCLP), its divisions, and their " +
      "service providers collecting and using the personal data in this form to respond to my " +
      "inquiry and share relevant products and services by email.",
    );
  });

  it("preselects the role from ?as= and collapses it to a confirmation", async () => {
    const w = await mountView("LESSOR");
    expect(w.find(".asrole").exists()).toBe(true);
    expect(w.text()).toContain("Inquiring as");
    expect(w.text()).toContain("Lessor (Unit Owner)");
    expect(w.find(".seg--role").exists()).toBe(false);
  });

  // A bare /inquiry used to redirect to "/", which now asks a different
  // question (browse or sign up) and drops the visitor out of the flow.
  it("opens the role choice and does not redirect when no role is carried over", async () => {
    const w = await mountView(null);
    expect(w.find(".seg--role").exists()).toBe(true);
    expect(w.find(".asrole").exists()).toBe(false);
    expect(w.find("form").exists()).toBe(true);
  });

  it("treats an unknown ?as= value as no role at all", async () => {
    const w = await mountView("ADMIN");
    expect(w.find(".seg--role").exists()).toBe(true);
    expect(w.find(".asrole").exists()).toBe(false);
  });

  it("Change reopens the choice, and picking a role collapses it again", async () => {
    const w = await mountView("LESSEE");
    await w.find(".asrole__change").trigger("click");
    expect(w.find(".seg--role").exists()).toBe(true);
    const lessor = w.findAll(".seg--role .seg__opt").find((b) => b.text().includes("Lessor"));
    await lessor.trigger("click");
    expect(w.find(".seg--role").exists()).toBe(false);
    expect(w.text()).toContain("Lessor (Unit Owner)");
  });

  // The twelve lessor types and eight lessee types do not overlap cleanly, so
  // a selection made under one role must not survive a switch to the other.
  it("swaps the inquiry types and clears a stale selection when the role changes", async () => {
    const w = await mountView("LESSEE");
    await w.find("#inquiryType").setValue("Unit Availability");
    expect(w.find("#inquiryType").element.value).toBe("Unit Availability");
    await w.find(".asrole__change").trigger("click");
    await w.findAll(".seg--role .seg__opt").find((b) => b.text().includes("Lessor")).trigger("click");
    expect(w.find("#inquiryType").element.value).toBe("");
    const opts = w.find("#inquiryType").findAll("option").map((o) => o.text());
    expect(opts).toContain("Find a Tenant");
    expect(opts).not.toContain("Unit Availability");
  });

  // Guards the option sets the spec depends on: the lessor branch is the
  // richer of the two and was unreachable from the UI before this change.
  it("offers all twelve lessor inquiry types and the eight lessee ones", async () => {
    const lessor = await mountView("LESSOR");
    expect(lessor.find("#inquiryType").findAll("option").length).toBe(13); // 12 + the disabled placeholder
    const lessee = await mountView("LESSEE");
    expect(lessee.find("#inquiryType").findAll("option").length).toBe(9); // 8 + the disabled placeholder
  });

  it("keeps submit disabled until a role is chosen", async () => {
    const w = await mountView(null);
    await w.findAll(".seg__opt").find((b) => b.text().includes("Residences")).trigger("click");
    await w.find("#fullName").setValue("Maria Santos");
    await w.find("#email").setValue("maria@example.com");
    await w.find('input[type="checkbox"]').setValue(true);
    expect(w.find('button[type="submit"]').attributes("disabled")).toBeDefined();
    await w.findAll(".seg--role .seg__opt").find((b) => b.text().includes("Lessee")).trigger("click");
    await w.find("#inquiryType").setValue("Unit Availability");
    expect(w.find('button[type="submit"]').attributes("disabled")).toBeUndefined();
  });

  it("shows Inquiry Type options for the selected user type", async () => {
    const lessee = await mountView("LESSEE");
    const lesseeOpts = lessee.find("#inquiryType").findAll("option").map((o) => o.text());
    expect(lesseeOpts).toContain("Unit Availability");
    expect(lesseeOpts).not.toContain("Find a Tenant");

    const lessor = await mountView("LESSOR");
    const lessorOpts = lessor.find("#inquiryType").findAll("option").map((o) => o.text());
    expect(lessorOpts).toContain("Find a Tenant");
    expect(lessorOpts).not.toContain("Unit Availability");
  });

  it("keeps submit disabled until category, type, fields, and consent are set", async () => {
    const w = await mountView("LESSEE");
    const submit = () => w.find('button[type="submit"]');
    expect(submit().attributes("disabled")).toBeDefined();
    await w.findAll(".seg__opt").find((b) => b.text().includes("Residences")).trigger("click");
    await w.find("#fullName").setValue("Maria Santos");
    await w.find("#email").setValue("maria@example.com");
    expect(submit().attributes("disabled")).toBeDefined(); // type + consent unset
    await w.find("#inquiryType").setValue("Rental Rate");
    expect(submit().attributes("disabled")).toBeDefined(); // consent unchecked
    await w.find('input[type="checkbox"]').setValue(true);
    expect(submit().attributes("disabled")).toBeUndefined();
  });

  it("submits with the carried-over user type and shows a thank-you state", async () => {
    const w = await mountView("LESSEE");
    await w.findAll(".seg__opt").find((b) => b.text().includes("Residences")).trigger("click");
    await w.find("#fullName").setValue("Maria Santos");
    await w.find("#email").setValue("maria@example.com");
    await w.find("#inquiryType").setValue("Unit Availability");
    await w.find('input[type="checkbox"]').setValue(true);
    await w.find("form").trigger("submit.prevent");
    await flushPromises();
    expect(createInquiry).toHaveBeenCalledWith({
      category: "RESIDENCES", inquirerType: "LESSEE", inquiryType: "Unit Availability",
      fullName: "Maria Santos", email: "maria@example.com", consent: true,
    });
    expect(w.text()).toContain("Inquiry received");
  });

  it("shows the unit banner and sends unitId when arriving from a unit page", async () => {
    const w = await mountWithUnit();
    expect(w.text()).toContain("12A");
    // fill the required fields the form still needs
    await w.find("#fullName").setValue("Ana Reyes");
    await w.find("#email").setValue("ana@example.com");
    // choose the first valid inquiry type; category is prefilled to RESIDENCES
    const typeSelect = w.find("select#inquiryType");
    await typeSelect.setValue("Unit Availability");
    await w.find('input[type="checkbox"]').setValue(true);
    await w.find("form").trigger("submit.prevent");
    await flushPromises();
    expect(createInquiry).toHaveBeenCalledWith(expect.objectContaining({ unitId: "u1", category: "RESIDENCES" }));
  });
});
