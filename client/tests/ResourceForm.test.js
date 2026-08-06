import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import ResourceForm from "../src/components/ResourceForm.vue";

const fields = [
  { key: "name", label: "Name", type: "text" },
  { key: "ownerId", label: "Owner", type: "select", options: [{ value: "o1", label: "Ayala" }] },
];

describe("ResourceForm", () => {
  it("renders an input per field, with select options plus a placeholder", () => {
    const w = mount(ResourceForm, { props: { fields } });
    expect(w.find("#name").exists()).toBe(true);
    expect(w.find("#ownerId").exists()).toBe(true);
    expect(w.findAll("#ownerId option")).toHaveLength(2);
  });
  it("seeds from modelValue and emits submit with values", async () => {
    const w = mount(ResourceForm, { props: { fields, modelValue: { name: "SM", ownerId: "o1" } } });
    await w.find("form").trigger("submit.prevent");
    expect(w.emitted("submit")[0][0]).toEqual({ name: "SM", ownerId: "o1" });
  });
  it("re-seeds when modelValue changes (edit load)", async () => {
    const w = mount(ResourceForm, { props: { fields, modelValue: {} } });
    await w.setProps({ modelValue: { name: "Later", ownerId: "o1" } });
    await w.find("form").trigger("submit.prevent");
    expect(w.emitted("submit")[0][0].name).toBe("Later");
  });
  it("omits empty-string fields from the submitted values", async () => {
    // ownerId is left unset (placeholder), so it must NOT be sent as ""
    const w = mount(ResourceForm, { props: { fields, modelValue: { name: "SM" } } });
    await w.find("form").trigger("submit.prevent");
    expect(w.emitted("submit")[0][0]).toEqual({ name: "SM" });
  });

  it("shows an error message", () => {
    const w = mount(ResourceForm, { props: { fields, error: "Bad input" } });
    expect(w.find(".error").text()).toContain("Bad input");
  });
  it("emits cancel", async () => {
    const w = mount(ResourceForm, { props: { fields } });
    await w.find("button.cancel").trigger("click");
    expect(w.emitted("cancel")).toBeTruthy();
  });
});
