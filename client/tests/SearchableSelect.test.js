import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import SearchableSelect from "../src/components/SearchableSelect.vue";

const options = [{ value: "o1", label: "Officer Jane" }, { value: "o2", label: "Officer Bob" }];

describe("SearchableSelect", () => {
  it("filters by search and emits the chosen value", async () => {
    const w = mount(SearchableSelect, { props: { options, modelValue: null, placeholder: "Unassigned" } });
    expect(w.find(".ss__val").text()).toBe("Unassigned");
    await w.find(".ss__btn").trigger("click");
    await w.find(".ss__search").setValue("bob");
    const opts = w.findAll(".ss__opt").filter((b) => !b.classes("clear")).map((b) => b.text());
    expect(opts).toEqual(["Officer Bob"]);
    await w.findAll(".ss__opt").find((b) => b.text() === "Officer Bob").trigger("click");
    expect(w.emitted("update:modelValue")[0][0]).toBe("o2");
  });

  it("shows the selected label and can clear to null", async () => {
    const w = mount(SearchableSelect, { props: { options, modelValue: "o1", clearLabel: "— Unassign —" } });
    expect(w.find(".ss__val").text()).toBe("Officer Jane");
    await w.find(".ss__btn").trigger("click");
    await w.find(".ss__opt.clear").trigger("click");
    expect(w.emitted("update:modelValue").at(-1)[0]).toBe(null);
  });
});
