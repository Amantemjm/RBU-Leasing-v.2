import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { resetCrudTables, tokens, factory } from "./helpers.js";
import { flushAudits } from "../src/middleware/audit.js";
import { prisma } from "../src/lib/prisma.js";
import { SUPER_ADMIN_EMAIL } from "../src/services/authService.js";

const app = createApp();
beforeEach(async () => { await resetCrudTables(); });

async function latest() {
  await flushAudits();
  return prisma.auditLog.findMany({ orderBy: { createdAt: "desc" } });
}

describe("Audit trail", () => {
  it("records who created a record and what they did", async () => {
    await request(app).post("/api/owners")
      .set("Authorization", `Bearer ${tokens.officer()}`)
      .send({ name: "Ayala Land" });
    const rows = await latest();
    const entry = rows.find((r) => r.entity === "Owner" && r.action === "create");
    expect(entry).toBeTruthy();
    expect(entry.actorRole).toBe("LEASING_OFFICER");
    expect(entry.method).toBe("POST");
  });

  it("records the real actor name on login", async () => {
    // The seeded super admin exists in the DB
    const res = await request(app).post("/api/auth/login")
      .send({ email: SUPER_ADMIN_EMAIL, password: "admin123" });
    expect(res.status).toBe(200);
    const rows = await latest();
    const entry = rows.find((r) => r.action === "login");
    expect(entry).toBeTruthy();
    expect(entry.actorName).toBeTruthy();
    expect(entry.entity).toBe("Account");
  });

  it("records a delete with the target id", async () => {
    const owner = await factory.owner();
    await request(app).delete(`/api/owners/${owner.id}`)
      .set("Authorization", `Bearer ${tokens.admin()}`);
    const rows = await latest();
    const entry = rows.find((r) => r.entity === "Owner" && r.action === "delete");
    expect(entry).toBeTruthy();
    expect(entry.entityId).toBe(owner.id);
  });

  it("records sub-actions like unit approval", async () => {
    const owner = await factory.owner();
    const unit = await factory.unit(owner.id, { approvalStatus: "SUBMITTED" });
    await request(app).patch(`/api/units/${unit.id}/approve`)
      .set("Authorization", `Bearer ${tokens.officer()}`);
    const rows = await latest();
    expect(rows.some((r) => r.entity === "Unit" && r.action === "approve" && r.entityId === unit.id)).toBe(true);
  });

  it("does NOT record a failed (validation-rejected) action", async () => {
    await request(app).post("/api/owners")
      .set("Authorization", `Bearer ${tokens.officer()}`)
      .send({ email: "not-an-email" }); // 400
    const rows = await latest();
    expect(rows.some((r) => r.entity === "Owner")).toBe(false);
  });

  it("does NOT record read-only GET requests", async () => {
    await request(app).get("/api/owners").set("Authorization", `Bearer ${tokens.viewer()}`);
    const rows = await latest();
    expect(rows).toHaveLength(0);
  });

  it("exposes the trail to a Super Admin only", async () => {
    await request(app).post("/api/owners")
      .set("Authorization", `Bearer ${tokens.officer()}`).send({ name: "X" });
    await flushAudits();

    const adminRes = await request(app).get("/api/audit").set("Authorization", `Bearer ${tokens.admin()}`);
    expect(adminRes.status).toBe(200);
    expect(adminRes.body.length).toBeGreaterThan(0);

    const officerRes = await request(app).get("/api/audit").set("Authorization", `Bearer ${tokens.officer()}`);
    expect(officerRes.status).toBe(403);
  });
});
