import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { createRouter, createMemoryHistory } from "vue-router";

vi.mock("../src/lib/resource.js", () => ({
  units: {
    create: vi.fn(() => Promise.resolve({ id: "u1" })),
    get: vi.fn(() => Promise.resolve({})),
    update: vi.fn(() => Promise.resolve({ id: "u1" })),
  },
  estates: { list: vi.fn(() => Promise.resolve([{ id: "e1", name: "Circulo Verde" }])) },
  towers: { list: vi.fn(() => Promise.resolve([{ id: "t1", name: "Ibiza Tower" }])) },
  submitUnit: vi.fn(() => Promise.resolve({ id: "u1" })),
}));

import RegisterUnitView from "../src/views/RegisterUnitView.vue";
import { units, estates, towers, submitUnit } from "../src/lib/resource.js";

const stub = { template: "<div/>" };

async function mountView() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: "/:pathMatch(.*)*", component: stub }],
  });
  router.push("/app/register-unit");
  await router.isReady();
  const w = mount(RegisterUnitView, { global: { plugins: [router] } });
  await flushPromises();
  return w;
}

describe("RegisterUnitView", () => {
  beforeEach(() => {
    units.create.mockClear();
    units.create.mockResolvedValue({ id: "u1" });
    units.get.mockClear();
    units.update.mockClear();
    estates.list.mockClear();
    towers.list.mockClear();
    submitUnit.mockClear();
  });

  // Every free-text field should show the shape of a real answer, taken from
  // the actual leasing records (units like 19A, slots like B5-15).
  it("guides every text field with a worked example", async () => {
    const w = await mountView();
    const ph = (id) => w.find(id).attributes("placeholder");
    expect(ph("#unitNumber")).toMatch(/19A|5I/);
    expect(ph("#floor")).toBeTruthy();
    expect(ph("#slotNo")).toMatch(/B5-15|GL-202/);
    expect(ph("#type")).toMatch(/Bedroom|Studio/);
    expect(ph("#baseRent")).toMatch(/\d/);
  });

  it("suggests the unit types actually in use, without blocking others", async () => {
    const w = await mountView();
    const input = w.find("#type");
    const listId = input.attributes("list");
    expect(listId).toBeTruthy();
    expect(input.attributes("type")).toBe("text"); // free text is still allowed
    const options = w.find(`#${listId}`).findAll("option").map((o) => o.attributes("value"));
    expect(options).toEqual(expect.arrayContaining(["Studio", "1 Bedroom", "2 Bedrooms"]));
  });

  it("groups the form into labelled sections instead of one flat list", async () => {
    const w = await mountView();
    const headings = w.findAll(".fset__title").map((h) => h.text());
    expect(headings.length).toBeGreaterThanOrEqual(2);
  });

  it("marks which fields are required", async () => {
    const w = await mountView();
    expect(w.find("#unitNumber").attributes("required")).toBeDefined();
  });

  it("loads towers only after an estate is chosen", async () => {
    const w = await mountView();
    expect(w.find("#towerId").attributes("disabled")).toBeDefined();
    await w.find("#estateId").setValue("e1");
    await flushPromises();
    expect(towers.list).toHaveBeenCalledWith({ estateId: "e1" });
    expect(w.find("#towerId").attributes("disabled")).toBeUndefined();
  });

  it("submits the captured fields, without the UI-only estate id", async () => {
    const w = await mountView();
    await w.find("#estateId").setValue("e1");
    await flushPromises();
    await w.find("#towerId").setValue("t1");
    await w.find("#unitNumber").setValue("19A");
    await w.find("#floor").setValue("19");
    await w.find("#slotNo").setValue("B5-15");
    await w.find("#type").setValue("1 Bedroom");
    await w.find("#baseRent").setValue("25000");
    await w.find("button.submit").trigger("click");
    await flushPromises();

    expect(units.create).toHaveBeenCalledTimes(1);
    const payload = units.create.mock.calls[0][0];
    expect(payload).toMatchObject({
      towerId: "t1", unitNumber: "19A", floor: "19", slotNo: "B5-15",
      type: "1 Bedroom", baseRent: 25000, // number input yields a number, not a string
    });
    expect(payload.estateId).toBeUndefined();
    expect(payload.submit).toBe(true);
  });

  it("saves a draft without submitting for approval", async () => {
    const w = await mountView();
    await w.find("#unitNumber").setValue("6D");
    await w.findAll("button").find((b) => b.text() === "Save as draft").trigger("click");
    await flushPromises();
    const payload = units.create.mock.calls[0][0];
    expect(payload.unitNumber).toBe("6D");
    expect(payload.submit).toBe(false);
  });

  it("omits blank optional fields rather than sending empty strings", async () => {
    const w = await mountView();
    await w.find("#unitNumber").setValue("6D");
    await w.find("form").trigger("submit.prevent");
    await flushPromises();
    const payload = units.create.mock.calls[0][0];
    expect(payload.unitNumber).toBe("6D");
    expect("slotNo" in payload).toBe(false);
    expect("floor" in payload).toBe(false);
  });

  it("confirms what happens next after submitting", async () => {
    const w = await mountView();
    await w.find("#unitNumber").setValue("19A");
    await w.find("form").trigger("submit.prevent");
    await flushPromises();
    expect(w.text()).toMatch(/approval/i);
  });

  it("shows the server's message when submission fails", async () => {
    units.create.mockRejectedValue({ response: { data: { error: "Unit already registered" } } });
    const w = await mountView();
    await w.find("#unitNumber").setValue("19A");
    await w.find("form").trigger("submit.prevent");
    await flushPromises();
    expect(w.find(".error").text()).toBe("Unit already registered");
    expect(w.find("form").exists()).toBe(true); // keeps their input for a retry
  });

  it("loads an existing unit via ?id= for editing, prefills the form, and saves through update", async () => {
    units.get.mockResolvedValue({
      id: "u9", unitNumber: "19A", floor: "19", slotNo: "B5-15",
      type: "1 Bedroom", baseRent: 25000, towerId: "t1",
      tower: { id: "t1", name: "Ibiza Tower", estate: { id: "e1", name: "Circulo Verde" } },
    });
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: "/:pathMatch(.*)*", component: stub }],
    });
    router.push("/app/register-unit?id=u9");
    await router.isReady();
    const w = mount(RegisterUnitView, { global: { plugins: [router] } });
    await flushPromises();

    expect(units.get).toHaveBeenCalledWith("u9");
    expect(w.find("#unitNumber").element.value).toBe("19A");
    expect(w.find("#estateId").element.value).toBe("e1");
    expect(w.find("#towerId").element.value).toBe("t1");

    await w.find("button.submit").trigger("click");
    await flushPromises();

    expect(units.update).toHaveBeenCalledTimes(1);
    const [id, payload] = units.update.mock.calls[0];
    expect(id).toBe("u9");
    expect(payload).toMatchObject({ unitNumber: "19A", towerId: "t1" });
    expect(submitUnit).toHaveBeenCalledWith("u9");
  });
});
