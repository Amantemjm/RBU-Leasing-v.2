import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { resetCrudTables, tokens, factory } from "./helpers.js";
import { issueToken } from "../src/services/authService.js";
import { prisma } from "../src/lib/prisma.js";

const app = createApp();
beforeEach(async () => { await resetCrudTables(); });
const authAdmin = { Authorization: `Bearer ${tokens.admin()}` };

async function scenario() {
  const owner = await factory.owner();
  const t1 = await factory.tenant();
  const uLeased = await factory.unit(owner.id, { unitNumber: "A1", status: "OCCUPIED" });
  await factory.lease(uLeased.id, t1.id, { startDate: new Date("2026-01-01"), endDate: new Date("2027-01-01") });
  await factory.unit(owner.id, { unitNumber: "A2" }); // no lease -> not leased
  return { owner };
}

describe("Executive Dashboard (/api/dashboard/executive)", () => {
  it("requires auth (401)", async () => {
    expect((await request(app).get("/api/dashboard/executive")).status).toBe(401);
  });

  it("is visible to staff (admin/officer/viewer) and blocks owners/tenants", async () => {
    await scenario();
    expect((await request(app).get("/api/dashboard/executive").set(authAdmin)).status).toBe(200);
    expect((await request(app).get("/api/dashboard/executive").set("Authorization", `Bearer ${tokens.viewer()}`)).status).toBe(200);
    expect((await request(app).get("/api/dashboard/executive").set("Authorization", `Bearer ${tokens.owner("x")}`)).status).toBe(403);
    expect((await request(app).get("/api/dashboard/executive").set("Authorization", `Bearer ${tokens.tenant("x")}`)).status).toBe(403);
  });

  it("returns portfolio metrics for ADMIN", async () => {
    await scenario();
    const res = await request(app).get("/api/dashboard/executive").set(authAdmin);
    expect(res.body.summary.totalUnits).toBe(2);
    expect(res.body.summary.leased).toBe(1);
    expect(res.body.summary.notLeased).toBe(1);
    expect(res.body.summary.occupancyRate).toBe(50);
    expect(res.body.leased[0].status).toBe("LEASED");
    expect(res.body.leased[0].monthlyRent).toBe(25000);
  });

  it("scopes a LEASING_OFFICER to units of their assigned owners", async () => {
    const mine = await prisma.user.create({ data: { name: "O", email: "o@x.com", passwordHash: "x", role: "LEASING_OFFICER" } });
    const myOwner = await factory.owner({ assignedOfficerId: mine.id });
    const other = await factory.owner();
    await factory.unit(myOwner.id, { unitNumber: "M1" });
    await factory.unit(other.id, { unitNumber: "O1" });
    const token = issueToken({ id: mine.id, role: "LEASING_OFFICER" });
    const res = await request(app).get("/api/dashboard/executive").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.summary.totalUnits).toBe(1);
    expect(res.body.all[0].unit).toBe("M1");
  });

  it("downloads a formatted Excel for staff, forbids non-staff", async () => {
    await scenario();
    const ok = await request(app).get("/api/dashboard/executive.xlsx").set(authAdmin);
    expect(ok.status).toBe(200);
    expect(ok.headers["content-type"]).toContain("spreadsheetml");
    expect(ok.headers["content-disposition"]).toContain("RBU-Leasing-Executive-Report.xlsx");
    const no = await request(app).get("/api/dashboard/executive.xlsx").set("Authorization", `Bearer ${tokens.owner("x")}`);
    expect(no.status).toBe(403);
  });
});
