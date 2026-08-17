import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { resetCrudTables, tokens, factory } from "./helpers.js";
import { issueToken } from "../src/services/authService.js";
import { prisma } from "../src/lib/prisma.js";

const app = createApp();
beforeEach(async () => { await resetCrudTables(); });
const authAdmin = { Authorization: `Bearer ${tokens.admin()}` };
function makeOfficer(email = "o1@x.com") {
  return prisma.user.create({ data: { name: email, email, passwordHash: "x", role: "LEASING_OFFICER" } });
}
const asOfficer = (id) => ({ Authorization: `Bearer ${issueToken({ id, role: "LEASING_OFFICER" })}` });

describe("Owner → Officer assignment & officer scoping", () => {
  it("admin assigns an owner to an officer (200)", async () => {
    const owner = await factory.owner();
    const officer = await makeOfficer();
    const res = await request(app).patch(`/api/owners/${owner.id}/assign`).set(authAdmin)
      .send({ assignedOfficerId: officer.id });
    expect(res.status).toBe(200);
    expect(res.body.assignedOfficerId).toBe(officer.id);
    expect(res.body.assignedOfficer.name).toBeTruthy();
  });

  it("rejects assigning an owner to a non-officer (400)", async () => {
    const owner = await factory.owner();
    const viewer = await prisma.user.create({ data: { name: "V", email: "v@x.com", passwordHash: "x", role: "VIEWER" } });
    const res = await request(app).patch(`/api/owners/${owner.id}/assign`).set(authAdmin)
      .send({ assignedOfficerId: viewer.id });
    expect(res.status).toBe(400);
  });

  it("a non-admin cannot assign (403)", async () => {
    const owner = await factory.owner();
    const officer = await makeOfficer();
    const res = await request(app).patch(`/api/owners/${owner.id}/assign`).set(asOfficer(officer.id))
      .send({ assignedOfficerId: officer.id });
    expect(res.status).toBe(403);
  });

  it("an officer sees only their assigned owners; admin sees all", async () => {
    const officer = await makeOfficer("mine@x.com");
    await factory.owner({ name: "Mine", assignedOfficerId: officer.id });
    await factory.owner({ name: "Theirs" });
    const mine = await request(app).get("/api/owners").set(asOfficer(officer.id));
    expect(mine.body).toHaveLength(1);
    expect(mine.body[0].name).toBe("Mine");
    const all = await request(app).get("/api/owners").set(authAdmin);
    expect(all.body).toHaveLength(2);
  });

  it("an officer sees only units of their assigned owners", async () => {
    const officer = await makeOfficer("mine@x.com");
    const mine = await factory.owner({ assignedOfficerId: officer.id });
    const other = await factory.owner();
    await factory.unit(mine.id, { unitNumber: "MINE" });
    await factory.unit(other.id, { unitNumber: "OTHER" });
    const res = await request(app).get("/api/units").set(asOfficer(officer.id));
    expect(res.body).toHaveLength(1);
    expect(res.body[0].unitNumber).toBe("MINE");
  });

  it("an officer sees only tenants of their assigned owners", async () => {
    const officer = await makeOfficer("mine@x.com");
    const mine = await factory.owner({ assignedOfficerId: officer.id });
    const other = await factory.owner();
    const uMine = await factory.unit(mine.id);
    const uOther = await factory.unit(other.id);
    const tMine = await factory.tenant({ name: "TMine" });
    const tOther = await factory.tenant({ name: "TOther" });
    await factory.lease(uMine.id, tMine.id);
    await factory.lease(uOther.id, tOther.id);
    const res = await request(app).get("/api/tenants").set(asOfficer(officer.id));
    expect(res.body).toHaveLength(1);
    expect(res.body[0].name).toBe("TMine");
  });

  it("an officer sees only leases on their assigned owners' units", async () => {
    const officer = await makeOfficer("mine@x.com");
    const mine = await factory.owner({ assignedOfficerId: officer.id });
    const other = await factory.owner();
    const uMine = await factory.unit(mine.id);
    const uOther = await factory.unit(other.id);
    const t = await factory.tenant();
    await factory.lease(uMine.id, t.id);
    await factory.lease(uOther.id, t.id);
    const res = await request(app).get("/api/leases").set(asOfficer(officer.id));
    expect(res.body).toHaveLength(1);
    expect(res.body[0].unit.owner.id).toBe(mine.id);
  });
});
