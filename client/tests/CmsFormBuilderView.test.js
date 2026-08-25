import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { createRouter, createMemoryHistory } from "vue-router";

vi.mock("../src/lib/resource.js", () => ({
  pageForms: {
    get: vi.fn(() => Promise.resolve({
      role: "TENANT", pageKey: "profile", title: "About you",
      fields: [{ key: "nickname", label: "Nickname", type: "text", required: false, options: [] }],
    })),
    save: vi.fn((role, pageKey, data) => Promise.resolve({ role, pageKey, ...data })),
    entries: vi.fn(() => Promise.resolve([])),
  },
  // ConfigurableForm imports `estates` from resource.js.
  estates: { list: vi.fn(() => Promise.resolve([])) },
}));

import CmsFormBuilderView from "../src/views/CmsFormBuilderView.vue";
import { pageForms } from "../src/lib/resource.js";

const stub = { template: "<div/>" };
async function mountView(role = "TENANT", pageKey = "profile") {
  const router = createRouter({ history: createMemoryHistory(), routes: [
    { path: "/app/forms", component: stub },
    { path: "/app/forms/:role/:pageKey", component: CmsFormBuilderView },
  ]});
  router.push(`/app/forms/${role}/${pageKey}`);
  await router.isReady();
  const w = mount(CmsFormBuilderView, { global: { plugins: [router] } });
  await flushPromises();
  return { w, router };
}

describe("CmsFormBuilderView (page-form slot editor)", () => {
  beforeEach(() => { pageForms.get.mockClear(); pageForms.save.mockClear(); });

  it("loads the slot's fields and shows them in the live preview", async () => {
    const { w } = await mountView();
    expect(w.text()).toContain("My Profile"); // slot label
    expect(w.text()).toContain("Lessee"); // role label
    expect(w.find(".preview__canvas").text()).toContain("Nickname");
  });

  it("adds a field and saves normalized fields with derived keys", async () => {
    const { w } = await mountView();
    await w.find(".add").trigger("click");
    const labels = w.findAll(".fcard__label");
    expect(labels).toHaveLength(2);
    await labels[1].setValue("Emergency Contact");
    await w.find(".primary").trigger("click");
    await flushPromises();
    expect(pageForms.save).toHaveBeenCalledTimes(1);
    const [role, pageKey, payload] = pageForms.save.mock.calls[0];
    expect(role).toBe("TENANT");
    expect(pageKey).toBe("profile");
    expect(payload.fields.map((f) => f.key)).toEqual(["nickname", "emergency-contact"]);
  });

  it("blocks saving a choice field with no options", async () => {
    const { w } = await mountView();
    await w.find(".add").trigger("click");
    const labels = w.findAll(".fcard__label");
    await labels[1].setValue("Preference");
    const typeSelects = w.findAll(".fcard select");
    await typeSelects[1].setValue("select");
    await w.find(".primary").trigger("click");
    await flushPromises();
    expect(pageForms.save).not.toHaveBeenCalled();
    expect(w.find(".error").text()).toContain("add at least one option");
  });

  it("rejects a slot that isn't configurable", async () => {
    const { w } = await mountView("TENANT", "dashboard");
    expect(w.find(".error").text()).toContain("isn't a configurable page");
    expect(pageForms.get).not.toHaveBeenCalled();
  });

  it("labels the back button with the renamed section", async () => {
    const { w } = await mountView();
    const back = w.find(".back");
    expect(back.text()).toBe("← Content Manager");
  });
});
