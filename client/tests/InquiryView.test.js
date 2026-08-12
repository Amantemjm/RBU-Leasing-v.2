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

  it("keeps submit disabled until category, fields, and consent are set", async () => {
    const w = await mountView();
    const submit = () => w.find('button[type="submit"]');
    expect(submit().attributes("disabled")).toBeDefined();
    await w.find("#fullName").setValue("Maria Santos");
    await w.find("#email").setValue("maria@example.com");
    await w.find("#message").setValue("Interested in a 2BR");
    expect(submit().attributes("disabled")).toBeDefined(); // category + consent still unset
    await w.find("#category").setValue("RESIDENCES");
    expect(submit().attributes("disabled")).toBeDefined(); // consent still unchecked
    await w.find('input[type="checkbox"]').setValue(true);
    expect(submit().attributes("disabled")).toBeUndefined();
  });

  it("submits the inquiry and shows a thank-you state", async () => {
    const w = await mountView();
    await w.find("#category").setValue("RESIDENCES");
    await w.find("#fullName").setValue("Maria Santos");
    await w.find("#email").setValue("maria@example.com");
    await w.find("#message").setValue("Interested in a 2BR");
    await w.find('input[type="checkbox"]').setValue(true);
    await w.find("form").trigger("submit.prevent");
    await flushPromises();
    expect(createInquiry).toHaveBeenCalledWith({
      category: "RESIDENCES", fullName: "Maria Santos", email: "maria@example.com",
      message: "Interested in a 2BR", consent: true,
    });
    expect(w.text()).toContain("Thank you!");
  });
});
