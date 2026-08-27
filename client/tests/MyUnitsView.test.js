import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { createRouter, createMemoryHistory } from "vue-router";

vi.mock("../src/lib/resource.js", () => {
  const unitsList = vi.fn();
  const submitUnitFn = vi.fn();
  return {
    units: {
      list: unitsList,
    },
    submitUnit: submitUnitFn,
  };
});

import MyUnitsView from "../src/views/MyUnitsView.vue";
import { units, submitUnit } from "../src/lib/resource.js";

const stub = { template: "<div/>" };
function makeRouter() {
  return createRouter({ history: createMemoryHistory(), routes: [
    { path: "/my-units", component: MyUnitsView },
    { path: "/register-unit", component: stub },
  ] });
}

describe("MyUnitsView", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  it("lists the owner's units with tower and approval status", async () => {
    vi.mocked(units.list).mockResolvedValue([
      { id: "u1", unitNumber: "14H", baseRent: "45000", status: "OCCUPIED", approvalStatus: "APPROVED", tower: { name: "Viridian in Greenhills" } },
    ]);
    const router = makeRouter(); router.push("/my-units"); await router.isReady();
    const w = mount(MyUnitsView, { global: { plugins: [router] } });
    await flushPromises();
    expect(w.text()).toContain("14H");
    expect(w.text()).toContain("Viridian in Greenhills");
    expect(w.text()).toContain("APPROVED");
    expect(w.text()).toContain("Register a unit");
  });

  it("renders rejection remarks for REJECTED units", async () => {
    vi.mocked(units.list).mockResolvedValue([
      { id: "u2", unitNumber: "22A", baseRent: "50000", status: "VACANT", approvalStatus: "REJECTED", reviewRemarks: "Missing slot", tower: null, type: "Studio" },
    ]);
    const router = makeRouter(); router.push("/my-units"); await router.isReady();
    const w = mount(MyUnitsView, { global: { plugins: [router] } });
    await flushPromises();
    expect(w.text()).toContain("22A");
    expect(w.text()).toContain("REJECTED");
    expect(w.text()).toContain("Missing slot");
  });

  it("shows Submit button for DRAFT and REJECTED units", async () => {
    vi.mocked(units.list).mockResolvedValue([
      { id: "u3", unitNumber: "20B", baseRent: "55000", status: "VACANT", approvalStatus: "DRAFT", tower: null, type: "1BR" },
      { id: "u4", unitNumber: "25C", baseRent: "60000", status: "VACANT", approvalStatus: "REJECTED", reviewRemarks: "Incomplete", tower: null, type: "2BR" },
    ]);
    const router = makeRouter(); router.push("/my-units"); await router.isReady();
    const w = mount(MyUnitsView, { global: { plugins: [router] } });
    await flushPromises();
    const submitButtons = w.findAll("button.submit");
    expect(submitButtons.length).toBe(2);
  });

  it("calls submitUnit and reloads when Submit is clicked", async () => {
    vi.mocked(units.list).mockResolvedValue([
      { id: "u5", unitNumber: "30D", baseRent: "65000", status: "VACANT", approvalStatus: "DRAFT", tower: null, type: "Studio" },
    ]);
    vi.mocked(submitUnit).mockResolvedValue({});
    const router = makeRouter(); router.push("/my-units"); await router.isReady();
    const w = mount(MyUnitsView, { global: { plugins: [router] } });
    await flushPromises();
    const submitButton = w.find("button.submit");
    await submitButton.trigger("click");
    await flushPromises();
    expect(submitUnit).toHaveBeenCalledWith("u5");
    expect(units.list).toHaveBeenCalledTimes(2); // once on mount, once after submit
  });
});
