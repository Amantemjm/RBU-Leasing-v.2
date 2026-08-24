import { describe, it, expect, vi } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";

vi.mock("../src/lib/resource.js", () => ({
  estates: {
    list: vi.fn(() => Promise.resolve([
      { id: "e1", name: "Capitol Commons", towers: [{ id: "t1", name: "Maven" }] },
      { id: "e2", name: "Ortigas East", towers: [{ id: "t2", name: "Glaston" }] },
    ])),
  },
}));

import ConfigurableForm from "../src/components/ConfigurableForm.vue";

const config = {
  title: "T",
  sections: [
    { title: "A", fields: [
      { key: "lastName", label: "Last name", type: "text", required: true },
      { key: "civilStatus", label: "Civil status", type: "select", options: ["Single", "Married"] },
      { key: "estate", label: "Estate", type: "select", source: "estates", required: true },
      { key: "tower", label: "Tower", type: "select", source: "towers", required: true },
    ] },
  ],
};

describe("ConfigurableForm", () => {
  it("renders fields from the config and emits data on input", async () => {
    const w = mount(ConfigurableForm, { props: { config, modelValue: {} } });
    await flushPromises();
    expect(w.text()).toContain("Last name");
    expect(w.text()).toContain("Civil status");
    await w.find("#lastName").setValue("Cruz");
    const last = w.emitted("update:modelValue").at(-1)[0];
    expect(last.lastName).toBe("Cruz");
  });

  it("populates estate options from the API and cascades towers", async () => {
    const w = mount(ConfigurableForm, { props: { config, modelValue: {} } });
    await flushPromises();
    const estateOpts = w.find("#estate").findAll("option").map((o) => o.text());
    expect(estateOpts).toContain("Capitol Commons");
    expect(estateOpts).toContain("Ortigas East");

    await w.find("#estate").setValue("Capitol Commons");
    const towerOpts = w.find("#tower").findAll("option").map((o) => o.text());
    expect(towerOpts).toContain("Maven");
    expect(towerOpts).not.toContain("Glaston");
  });

  it("renders read-only values when readonly", async () => {
    const w = mount(ConfigurableForm, { props: { config, modelValue: { lastName: "Santos" }, readonly: true } });
    await flushPromises();
    expect(w.find("#lastName").exists()).toBe(false);
    expect(w.text()).toContain("Santos");
  });

  it("selects a radio option and emits the choice", async () => {
    const cfg = { title: "T", sections: [{ title: "A", fields: [
      { key: "sex", label: "Sex", type: "radio", options: ["Male", "Female"] },
    ] }] };
    const w = mount(ConfigurableForm, { props: { config: cfg, modelValue: {} } });
    await flushPromises();
    const male = w.findAll("button.choice").find((b) => b.text().includes("Male"));
    await male.trigger("click");
    expect(w.emitted("update:modelValue").at(-1)[0].sex).toBe("Male");
  });

  it("toggles multiple checkbox options into an array", async () => {
    const cfg = { title: "T", sections: [{ title: "A", fields: [
      { key: "channel", label: "Channel", type: "checkboxes", options: ["SMS", "Email"], allowOther: true },
    ] }] };
    const w = mount(ConfigurableForm, { props: { config: cfg, modelValue: {} } });
    await flushPromises();
    const btns = w.findAll("button.choice");
    await btns.find((b) => b.text().includes("SMS")).trigger("click");
    await btns.find((b) => b.text().includes("Email")).trigger("click");
    expect(w.emitted("update:modelValue").at(-1)[0].channel).toEqual(["SMS", "Email"]);
  });
});
