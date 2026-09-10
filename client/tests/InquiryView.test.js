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
// The user type is chosen on the front page and arrives via ?as=LESSOR|LESSEE.
async function mountView(as = "LESSEE") {
  setActivePinia(createPinia());
  const router = makeRouter(); router.push({ path: "/", query: { as } }); await router.isReady();
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

async function mountNoRole() {
  setActivePinia(createPinia());
  const router = makeRouter();
  router.push({ path: "/" }); // no ?as=
  await router.isReady();
  return mount(InquiryView, { global: { plugins: [router] } });
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

  it("has no 'I am a' field and reflects the carried-over user type", async () => {
    const w = await mountView("LESSOR");
    expect(w.find("#inquirerType").exists()).toBe(false);
    expect(w.text()).toContain("Inquiring as");
    expect(w.text()).toContain("Lessor (Unit Owner)");
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

  it("Change reveals the inline role toggle instead of navigating away", async () => {
    const w = await mountView("LESSEE");
    expect(w.find(".rolepick").exists()).toBe(false); // pill shown, not the picker
    await w.findAll("a").find((a) => a.text() === "Change").trigger("click");
    expect(w.find(".rolepick").exists()).toBe(true);
    const roleBtns = w.findAll(".rolepick .seg__opt").map((b) => b.text());
    expect(roleBtns.some((t) => t.includes("Lessee"))).toBe(true);
    expect(roleBtns.some((t) => t.includes("Lessor"))).toBe(true);
  });

  it("picking a role in the toggle switches the type options and keeps entries", async () => {
    const w = await mountView("LESSEE");
    await w.find("#fullName").setValue("Maria Santos");
    await w.findAll("a").find((a) => a.text() === "Change").trigger("click");
    await w.findAll(".rolepick .seg__opt").find((b) => b.text().includes("Lessor")).trigger("click");
    // Picker closes, the LESSOR type options are now in effect, and the typed name survives.
    expect(w.find(".rolepick").exists()).toBe(false);
    const opts = w.find("#inquiryType").findAll("option").map((o) => o.text());
    expect(opts).toContain("Find a Tenant");
    expect(w.find("#fullName").element.value).toBe("Maria Santos");
  });

  it("shows the role picker on a direct visit with no ?as= (no redirect)", async () => {
    const w = await mountNoRole();
    expect(w.find(".rolepick").exists()).toBe(true);
  });

  it("switching to Lessor drops the unit banner and omits unitId on submit", async () => {
    const w = await mountWithUnit();
    expect(w.text()).toContain("12A"); // lessee unit banner
    await w.findAll("a").find((a) => a.text() === "Change").trigger("click");
    await w.findAll(".rolepick .seg__opt").find((b) => b.text().includes("Lessor")).trigger("click");
    expect(w.text()).not.toContain("12A"); // banner gone for lessor
    // Complete + submit; category is still RESIDENCES from the unit prefill.
    await w.find("#fullName").setValue("Ana Reyes");
    await w.find("#email").setValue("ana@example.com");
    await w.find("#inquiryType").setValue("Find a Tenant");
    await w.find('input[type="checkbox"]').setValue(true);
    await w.find("form").trigger("submit.prevent");
    await flushPromises();
    const arg = createInquiry.mock.calls.at(-1)[0];
    expect(arg.inquirerType).toBe("LESSOR");
    expect(arg.unitId).toBeUndefined();
  });

  it("restores the unit banner and unitId after toggling Lessor then back to Lessee", async () => {
    const w = await mountWithUnit();
    expect(w.text()).toContain("12A");
    // switch to Lessor
    await w.findAll("a").find((a) => a.text() === "Change").trigger("click");
    await w.findAll(".rolepick .seg__opt").find((b) => b.text().includes("Lessor")).trigger("click");
    expect(w.text()).not.toContain("12A");
    // switch back to Lessee
    await w.findAll("a").find((a) => a.text() === "Change").trigger("click");
    await w.findAll(".rolepick .seg__opt").find((b) => b.text().includes("Lessee")).trigger("click");
    expect(w.text()).toContain("12A"); // banner restored
    // submit sends unitId again
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
});
