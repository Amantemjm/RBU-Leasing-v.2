import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { createRouter, createMemoryHistory } from "vue-router";

vi.mock("../src/lib/resource.js", () => ({
  pageForms: {
    list: vi.fn(() => Promise.resolve([])),
  },
}));

import CmsFormsView from "../src/views/CmsFormsView.vue";
import { pageForms } from "../src/lib/resource.js";

const stub = { template: "<div/>" };

async function mountView() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: "/:pathMatch(.*)*", component: stub }],
  });
  router.push("/app/forms");
  await router.isReady();
  const w = mount(CmsFormsView, { global: { plugins: [router] } });
  await flushPromises();
  return w;
}

describe("CmsFormsView", () => {
  beforeEach(() => pageForms.list.mockClear());

  // The feature is a CMS, not a forms list — the heading has to say so.
  it("is titled Content Manager", async () => {
    const w = await mountView();
    expect(w.find("h1").text()).toBe("Content Manager");
  });

  it("no longer calls itself Forms", async () => {
    const w = await mountView();
    expect(w.find("h1").text()).not.toBe("Forms");
  });
});
