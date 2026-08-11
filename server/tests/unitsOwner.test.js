import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { resetCrudTables, tokens, factory } from "./helpers.js";

const app = createApp();
beforeEach(async () => { await resetCrudTables(); });

describe("owner-scoped units + approval", () => {
  it("owner sees only their own units, including pending", async () => {
    const o1 = await factory.owner();
    const o2 = await factory.owner({ name: "Other" });
    await factory.unit(o1.id, { unitNumber: "A" });
    await factory.unit(o1.id, { unitNumber: "B", approvalStatus: "PENDING" });
    await factory.unit(o2.id, { unitNumber: "C" });

    const res = await request(app).get("/api/units").set("Authorization", `Bearer ${tokens.owner(o1.id)}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
  });

  it("owner-submitted unit is PENDING and owned by them (ownerId forced)", async () => {
    const o1 = await factory.owner();
    const res = await request(app).post("/api/units")
      .set("Authorization", `Bearer ${tokens.owner(o1.id)}`)
      .send({ unitNumber: "NEW", baseRent: 30000, ownerId: "someone-else" });
    expect(res.status).toBe(201);
    expect(res.body.ownerId).toBe(o1.id);
    expect(res.body.approvalStatus).toBe("PENDING");
  });

  it("owner cannot approve a unit (403)", async () => {
    const o1 = await factory.owner();
    const u = await factory.unit(o1.id, { approvalStatus: "PENDING" });
    const res = await request(app).patch(`/api/units/${u.id}/approve`)
      .set("Authorization", `Bearer ${tokens.owner(o1.id)}`);
    expect(res.status).toBe(403);
  });

  it("officer approves a pending unit", async () => {
    const o1 = await factory.owner();
    const u = await factory.unit(o1.id, { approvalStatus: "PENDING" });
    const res = await request(app).patch(`/api/units/${u.id}/approve`)
      .set("Authorization", `Bearer ${tokens.officer()}`);
    expect(res.status).toBe(200);
    expect(res.body.approvalStatus).toBe("APPROVED");
  });

  it("admin can filter units by approvalStatus", async () => {
    const o1 = await factory.owner();
    await factory.unit(o1.id, { unitNumber: "P", approvalStatus: "PENDING" });
    await factory.unit(o1.id, { unitNumber: "Q", approvalStatus: "APPROVED" });
    const res = await request(app).get("/api/units?approvalStatus=PENDING")
      .set("Authorization", `Bearer ${tokens.admin()}`);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].unitNumber).toBe("P");
  });
});
