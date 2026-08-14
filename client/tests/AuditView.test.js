import { describe, it, expect, vi } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";

vi.mock("../src/lib/audit.js", () => ({
  listAudit: vi.fn(() => Promise.resolve([
    { id: "a1", actorName: "RBU Admin", actorRole: "ADMIN", action: "create", entity: "Owner",
      entityId: "o1", method: "POST", path: "/api/owners", createdAt: "2026-08-14T09:30:00Z" },
    { id: "a2", actorName: "Jane Cruz", actorRole: "LEASING_OFFICER", action: "approve", entity: "Unit",
      entityId: "u1", method: "PATCH", path: "/api/units/u1/approve", createdAt: "2026-08-14T09:00:00Z" },
  ])),
}));

import AuditView from "../src/views/AuditView.vue";

describe("AuditView", () => {
  it("lists actions with who did them", async () => {
    const w = mount(AuditView);
    await flushPromises();
    expect(w.text()).toContain("RBU Admin");
    expect(w.text()).toContain("Super Admin"); // ADMIN role label
    expect(w.text()).toContain("create");
    expect(w.text()).toContain("Owner");
    expect(w.text()).toContain("Jane Cruz");
    expect(w.text()).toContain("approve");
    const headers = w.findAll("th").map((h) => h.text());
    expect(headers).toEqual(["When", "Who", "Role", "Action", "Entity", "Target"]);
  });
});
