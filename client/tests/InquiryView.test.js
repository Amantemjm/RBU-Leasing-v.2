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
async function mountView() {
  setActivePinia(createPinia());
  const router = makeRouter(); router.push("/"); await router.isReady();
  return mount(InquiryView, { global: { plugins: [router] } });
}

describe("InquiryView (public landing)", () => {
  beforeEach(() => createInquiry.mockClear());

  it("shows the exact OCLP consent text", async () => {
    const w = await mountView();
    expect(w.text()).toContain(
      "By clicking the button below, I give my consent to all divisions and organizations " +
      "in Ortigas and Company, Limited Partnership (OCLP), and their service providers and " +
      "agents to collect, use and disclose the personal data as contained in this form, or " +
      "as otherwise provided by me for the purpose of providing information on their products " +
      "and services to me via email, including but not limited to offers, promotions, and new " +
      "goods and services.",
    );
  });

  it("cascades Inquiry Type from the 'I am a' choice and resets on change", async () => {
    const w = await mountView();
    const typeOpts = () => w.find("#inquiryType").findAll("option").map((o) => o.text());
    expect(w.find("#inquiryType").attributes("disabled")).toBeDefined(); // disabled until chosen
    await w.find("#inquirerType").setValue("LESSEE");
    expect(typeOpts()).toContain("Unit Availability");
    expect(typeOpts()).not.toContain("Find a Tenant");
    await w.find("#inquiryType").setValue("Unit Availability");
    // switching inquirer resets the type and swaps the option set
    await w.find("#inquirerType").setValue("LESSOR");
    expect(w.find("#inquiryType").element.value).toBe("");
    expect(typeOpts()).toContain("Find a Tenant");
    expect(typeOpts()).not.toContain("Unit Availability");
  });

  it("keeps submit disabled until category, type, fields, and consent are set", async () => {
    const w = await mountView();
    const submit = () => w.find('button[type="submit"]');
    expect(submit().attributes("disabled")).toBeDefined();
    await w.find("#category").setValue("RESIDENCES");
    await w.find("#fullName").setValue("Maria Santos");
    await w.find("#email").setValue("maria@example.com");
    expect(submit().attributes("disabled")).toBeDefined(); // inquirer/type + consent unset
    await w.find("#inquirerType").setValue("LESSEE");
    await w.find("#inquiryType").setValue("Rental Rate");
    expect(submit().attributes("disabled")).toBeDefined(); // consent still unchecked
    await w.find('input[type="checkbox"]').setValue(true);
    expect(submit().attributes("disabled")).toBeUndefined();
  });

  it("submits the inquiry (message optional) and shows a thank-you state", async () => {
    const w = await mountView();
    await w.find("#category").setValue("RESIDENCES");
    await w.find("#fullName").setValue("Maria Santos");
    await w.find("#email").setValue("maria@example.com");
    await w.find("#inquirerType").setValue("LESSEE");
    await w.find("#inquiryType").setValue("Unit Availability");
    await w.find('input[type="checkbox"]').setValue(true);
    await w.find("form").trigger("submit.prevent");
    await flushPromises();
    expect(createInquiry).toHaveBeenCalledWith({
      category: "RESIDENCES", inquirerType: "LESSEE", inquiryType: "Unit Availability",
      fullName: "Maria Santos", email: "maria@example.com", consent: true,
    });
    expect(w.text()).toContain("Thank you!");
  });
});
