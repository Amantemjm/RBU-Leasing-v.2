import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import MultiSelect from "../src/components/MultiSelect.vue";

const options = [{ value: "a", label: "Alpha" }, { value: "b", label: "Beta" }];

describe("MultiSelect", () => {
  it("summarizes and toggles a value", async () => {
    const w = mount(MultiSelect, { props: { label: "Estate", options, modelValue: [] } });
    expect(w.find(".ms__sum").text()).toBe("All");
    await w.find(".ms__btn").trigger("click");
    const alpha = w.findAll(".ms__opt").find((l) => l.text() === "Alpha");
    await alpha.find("input").setValue(true);
    expect(w.emitted("update:modelValue")[0][0]).toEqual(["a"]);
  });

  it("supports select-all and clear", async () => {
    const w = mount(MultiSelect, { props: { label: "Estate", options, modelValue: ["a"] } });
    expect(w.find(".ms__sum").text()).toBe("1 selected");
    await w.find(".ms__btn").trigger("click");
    const [selectAll, clear] = w.findAll(".ms__actions button");
    await selectAll.trigger("click");
    expect(w.emitted("update:modelValue").at(-1)[0]).toEqual(["a", "b"]);
    await clear.trigger("click");
    expect(w.emitted("update:modelValue").at(-1)[0]).toEqual([]);
  });
});
