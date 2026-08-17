import { describe, it, expect, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { createRouter, createMemoryHistory } from "vue-router";
import { createPinia, setActivePinia } from "pinia";

import InquiryStartView from "../src/views/InquiryStartView.vue";

const stub = { template: "<div/>" };
function makeRouter() {
  return createRouter({ history: createMemoryHistory(), routes: [
    { path: "/", component: InquiryStartView },
    { path: "/inquiry", component: stub },
    { path: "/login", component: stub },
  ]});
}
async function mountView() {
  setActivePinia(createPinia());
  const router = makeRouter(); router.push("/"); await router.isReady();
  const w = mount(InquiryStartView, { global: { plugins: [router] } });
  return { w, router };
}

describe("InquiryStartView (user-type front page)", () => {
  beforeEach(() => setActivePinia(createPinia()));

  it("asks 'I am a' and offers Lessor and Lessee with descriptions", async () => {
    const { w } = await mountView();
    expect(w.text().toLowerCase()).toContain("i am a");
    expect(w.text()).toContain("Lessor / Unit Owner");
    expect(w.text()).toContain("Lessee / Tenant");
    expect(w.text()).toContain("looking to lease out their unit");
    expect(w.text()).toContain("looking to rent or lease a property");
  });

  it("routes to /inquiry?as=LESSOR when the Lessor card is clicked", async () => {
    const { w, router } = await mountView();
    await w.findAll("button.choice")[0].trigger("click");
    await flushPromises();
    expect(router.currentRoute.value.path).toBe("/inquiry");
    expect(router.currentRoute.value.query.as).toBe("LESSOR");
  });

  it("routes to /inquiry?as=LESSEE when the Lessee card is clicked", async () => {
    const { w, router } = await mountView();
    await w.findAll("button.choice")[1].trigger("click");
    await flushPromises();
    expect(router.currentRoute.value.query.as).toBe("LESSEE");
  });
});
