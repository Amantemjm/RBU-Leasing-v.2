import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import ResourceTable from "../src/components/ResourceTable.vue";

const columns = [{ key: "name", label: "Name" }];
const rows = [{ id: "1", name: "Ayala" }, { id: "2", name: "SM" }];

describe("ResourceTable", () => {
  it("renders one row per record", () => {
    const w = mount(ResourceTable, { props: { columns, rows } });
    expect(w.findAll("tbody tr")).toHaveLength(2);
    expect(w.text()).toContain("Ayala");
  });
  it("hides action buttons when canWrite is false", () => {
    const w = mount(ResourceTable, { props: { columns, rows, canWrite: false } });
    expect(w.find("button.edit").exists()).toBe(false);
  });
  it("shows and emits edit/delete when canWrite", async () => {
    const w = mount(ResourceTable, { props: { columns, rows, canWrite: true } });
    await w.find("button.edit").trigger("click");
    await w.find("button.delete").trigger("click");
    expect(w.emitted("edit")[0][0].id).toBe("1");
    expect(w.emitted("delete")[0][0].id).toBe("1");
  });
  it("applies a column format function", () => {
    const w = mount(ResourceTable, {
      props: { columns: [{ key: "rent", label: "Rent", format: (v) => `PHP ${v}` }],
               rows: [{ id: "1", rent: 100 }] },
    });
    expect(w.text()).toContain("PHP 100");
  });
  it("shows an empty state", () => {
    const w = mount(ResourceTable, { props: { columns, rows: [] } });
    expect(w.text()).toContain("No records.");
  });
});
