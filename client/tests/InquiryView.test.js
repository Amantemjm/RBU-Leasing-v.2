import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { createRouter, createMemoryHistory } from "vue-router";
import { createPinia, setActivePinia } from "pinia";

vi.mock("../src/lib/inquiries.js", () => ({
  createInquiry: vi.fn(() => Promise.resolve({ id: "i1", status: "NEW" })),
}));

import InquiryView from "../src/views/InquiryView.vue";
import { createInquiry } from "../src/lib/inquiries.js";

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
});
