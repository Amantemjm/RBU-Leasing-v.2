import { describe, it, expect, vi } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
vi.mock("../src/lib/resource.js", () => ({
  appointments: { mine: vi.fn(() => Promise.resolve([
    { id: "a1", stage: "UNIT_INSPECTION", status: "Scheduled", scheduledAt: "2026-09-01T09:00:00.000Z", location: "Tower A", notes: "Bring IDs", transaction: { reference: "RBU-2026-000001" } },
  ])) },
}));
import UpcomingAppointment from "../src/components/UpcomingAppointment.vue";

describe("UpcomingAppointment", () => {
  it("renders a scheduled appointment", async () => {
    const w = mount(UpcomingAppointment);
    await flushPromises();
    expect(w.text()).toContain("Unit Inspection");
    expect(w.text()).toContain("Tower A");
    expect(w.text()).toContain("Scheduled");
  });
  it("shows an empty state when there are none", async () => {
    const { appointments } = await import("../src/lib/resource.js");
    appointments.mine.mockResolvedValueOnce([]);
    const w = mount(UpcomingAppointment);
    await flushPromises();
    expect(w.text()).toMatch(/no upcoming|nothing scheduled/i);
  });
});
