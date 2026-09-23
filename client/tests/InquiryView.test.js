import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { createRouter, createMemoryHistory } from "vue-router";
import { createPinia, setActivePinia } from "pinia";

vi.mock("../src/lib/inquiries.js", () => ({
  createInquiry: vi.fn(() => Promise.resolve({ id: "i1", status: "NEW" })),
}));
vi.mock("../src/lib/resource.js", () => ({
  // Mirrors what GET /api/public/units/:id actually returns. It carries no
  // unitNumber and no propertyName; inventing them here is what let a banner
  // reading "Unit —" ship while these tests stayed green.
  publicUnits: {
    get: vi.fn(() => Promise.resolve({
      unitId: "u1",
      headline: "Elegant 2BR",
      type: "2 Bedrooms",
      location: "Empress, Capitol Commons",
      details: {
        unitType: "2 Bedrooms", floorArea: 66, bedrooms: 2, bathrooms: 2,
        rentalRate: 45000, amenities: ["Pool", "Gym"],
        description: "Corner unit.", availabilityStatus: "Available",
      },
      photos: [], photoIds: [], coverPhotoId: null,
    })),
  },
}));

import InquiryView from "../src/views/InquiryView.vue";
import { createInquiry } from "../src/lib/inquiries.js";
import { publicUnits } from "../src/lib/resource.js";

const stub = { template: "<div/>" };
// "/" is a distinct stub from the form's own route so a stray redirect to
// "/" is observable — mapping "/" to InquiryView itself would make a
// router.replace("/") indistinguishable from staying put.
function makeRouter() {
  return createRouter({ history: createMemoryHistory(), routes: [
    { path: "/", component: stub }, { path: "/inquiry", component: InquiryView }, { path: "/login", component: stub },
  ]});
}
// The role may arrive from a unit page or the landing as ?as=…, or not at all.
// Passing null mounts the bare /inquiry route, which is now a valid entry.
async function mountView(as = "LESSEE", opts = {}) {
  setActivePinia(createPinia());
  const router = makeRouter();
  router.push(as ? { path: "/inquiry", query: { as } } : { path: "/inquiry" });
  await router.isReady();
  return mount(InquiryView, { global: { plugins: [router] }, ...opts });
}

async function mountWithUnit() {
  setActivePinia(createPinia());
  const router = makeRouter();
  router.push({ path: "/inquiry", query: { as: "LESSEE", unit: "u1" } });
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
    expect(w.find("#inquirerType").exists()).toBe(false); // no separate role field
  });

  // A bare /inquiry used to redirect to "/", which now asks a different
  // question (browse or sign up) and drops the visitor out of the flow.
  it("opens the role choice and does not redirect when no role is carried over", async () => {
    setActivePinia(createPinia());
    const router = makeRouter();
    router.push({ path: "/inquiry" });
    await router.isReady();
    const w = mount(InquiryView, { global: { plugins: [router] } });
    expect(w.find(".seg--role").exists()).toBe(true);
    expect(w.find(".asrole").exists()).toBe(false);
    expect(w.find("form").exists()).toBe(true);
    // "/" resolves to a distinct stub in the test router, so this fails if
    // anything ever redirects away from the form instead of asking inline.
    // Awaited deliberately: a router.replace() in onMounted only lands a
    // macrotask later, so a synchronous read here would pass either way.
    await flushPromises();
    expect(router.currentRoute.value.path).toBe("/inquiry");
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
    expect(w.text()).toContain("Elegant 2BR");
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

  // The submit test above carries ?as=LESSEE straight through to the
  // payload's inquirerType, so a bug that sent route.query.as instead of
  // form.inquirerType would slip past every other test. Choosing the role
  // through the control itself (no ?as= at all) closes that gap.
  it("submits with a role chosen through the control, not carried in the URL", async () => {
    const w = await mountView(null);
    await w.findAll(".seg--role .seg__opt").find((b) => b.text().includes("Lessor")).trigger("click");
    await w.findAll(".seg__opt").find((b) => b.text().includes("Offices")).trigger("click");
    await w.find("#inquiryType").setValue("Find a Tenant"); // lessor-only type
    await w.find("#fullName").setValue("Carlos Ramos");
    await w.find("#email").setValue("carlos@example.com");
    await w.find('input[type="checkbox"]').setValue(true);
    await w.find("form").trigger("submit.prevent");
    await flushPromises();
    expect(createInquiry).toHaveBeenCalledWith({
      category: "OFFICES", inquirerType: "LESSOR", inquiryType: "Find a Tenant",
      fullName: "Carlos Ramos", email: "carlos@example.com", consent: true,
    });
    expect(w.text()).toContain("Inquiry received");
  });

  // Ported from the parallel implementation on origin/master: a role switch
  // must not cost the visitor what they have already typed.
  it("keeps entries already typed when the role changes", async () => {
    const w = await mountView("LESSEE");
    await w.find("#fullName").setValue("Maria Santos");
    await w.find(".asrole__change").trigger("click");
    await w.findAll(".seg--role .seg__opt").find((b) => b.text().includes("Lessor")).trigger("click");
    expect(w.find(".seg--role").exists()).toBe(false);
    const opts = w.find("#inquiryType").findAll("option").map((o) => o.text());
    expect(opts).toContain("Find a Tenant");
    expect(w.find("#fullName").element.value).toBe("Maria Santos");
  });

  // Also ported: dropping the unit on a switch away from Lessee is only half
  // the contract — coming back must restore it, banner and payload alike.
  it("restores the unit banner and unitId after switching to Lessor and back", async () => {
    const w = await mountWithUnit();
    expect(w.text()).toContain("Elegant 2BR");

    await w.find(".asrole__change").trigger("click");
    await w.findAll(".seg--role .seg__opt").find((b) => b.text().includes("Lessor")).trigger("click");
    expect(w.text()).not.toContain("Elegant 2BR");

    await w.find(".asrole__change").trigger("click");
    await w.findAll(".seg--role .seg__opt").find((b) => b.text().includes("Lessee")).trigger("click");
    expect(w.text()).toContain("Elegant 2BR");

    await w.find("#fullName").setValue("Ana Reyes");
    await w.find("#email").setValue("ana@example.com");
    await w.find("#inquiryType").setValue("Unit Availability");
    await w.find('input[type="checkbox"]').setValue(true);
    await w.find("form").trigger("submit.prevent");
    await flushPromises();
    const arg = createInquiry.mock.calls.at(-1)[0];
    expect(arg.inquirerType).toBe("LESSEE");
    expect(arg.unitId).toBe("u1");
  });

  // unitId means "the unit a lessee is inquiring about" — switching to Lessor
  // mid-form must drop both the visible banner and the field from the payload.
  it("drops the unit banner and unitId when switching away from Lessee", async () => {
    const w = await mountWithUnit();
    expect(w.find(".unit-context").exists()).toBe(true);
    await w.find(".asrole__change").trigger("click");
    await w.findAll(".seg--role .seg__opt").find((b) => b.text().includes("Lessor")).trigger("click");
    expect(w.find(".unit-context").exists()).toBe(false);

    await w.find("#inquiryType").setValue("Find a Tenant"); // lessor-only type
    await w.find("#fullName").setValue("Ana Reyes");
    await w.find("#email").setValue("ana@example.com");
    await w.find('input[type="checkbox"]').setValue(true);
    await w.find("form").trigger("submit.prevent");
    await flushPromises();
    expect(createInquiry).toHaveBeenCalledWith(expect.not.objectContaining({ unitId: expect.anything() }));
    expect(createInquiry).toHaveBeenCalledWith(expect.objectContaining({ inquirerType: "LESSOR" }));
  });

  // Keyboard/screen-reader users must not lose focus to <body> when the
  // inline disclosure opens or closes.
  it("moves focus to the current role on Change, and back to Change once chosen", async () => {
    const w = await mountView("LESSEE", { attachTo: document.body });
    try {
      await w.find(".asrole__change").trigger("click");
      // The role already chosen, named explicitly — asserting index 0 would
      // pass by coincidence and stop testing anything if the order changed.
      const lessee = w.findAll(".seg--role .seg__opt").find((b) => b.text().includes("Lessee"));
      expect(document.activeElement).toBe(lessee.element);

      const lessor = w.findAll(".seg--role .seg__opt").find((b) => b.text().includes("Lessor"));
      await lessor.trigger("click");
      expect(document.activeElement).toBe(w.find(".asrole__change").element);
    } finally {
      w.unmount();
    }
  });
});
