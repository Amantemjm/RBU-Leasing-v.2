import { describe, it, expect, vi } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
vi.mock("../src/lib/resource.js", () => ({
  appointments: {
    forTransaction: vi.fn(() => Promise.resolve([])),
    schedule: vi.fn(() => Promise.resolve({ id: "a1", stage: "UNIT_INSPECTION", status: "Scheduled", scheduledAt: "2026-09-01T09:00:00.000Z" })),
    reschedule: vi.fn(), complete: vi.fn(() => Promise.resolve({})), cancel: vi.fn(),
  },
}));
import SchedulingPanel from "../src/components/SchedulingPanel.vue";
import { appointments } from "../src/lib/resource.js";

const txn = { id: "t1", stage: "UNIT_INSPECTION", status: "Pending" };

describe("SchedulingPanel", () => {
  it("shows a schedule form for the current schedulable stage and schedules", async () => {
    const w = mount(SchedulingPanel, { props: { transaction: txn } });
    await flushPromises();
    const dt = w.find('input[type="datetime-local"]');
    expect(dt.exists()).toBe(true);
    await dt.setValue("2026-09-01T09:00");
    await w.findAll("button").find((b) => /schedule/i.test(b.text())).trigger("click");
    await flushPromises();
    expect(appointments.schedule).toHaveBeenCalledWith("t1", "UNIT_INSPECTION", expect.objectContaining({ scheduledAt: expect.any(String) }));
  });

  it("renders an existing appointment with Complete showing inspection outcomes", async () => {
    appointments.forTransaction.mockResolvedValueOnce([{ id: "a1", stage: "UNIT_INSPECTION", status: "Scheduled", scheduledAt: "2026-09-01T09:00:00.000Z" }]);
    const w = mount(SchedulingPanel, { props: { transaction: txn } });
    await flushPromises();
    expect(w.text()).toContain("Scheduled");
    // outcome select present for inspection
    expect(w.find("select").exists()).toBe(true);
  });
});
