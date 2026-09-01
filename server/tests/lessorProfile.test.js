import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { resetCrudTables, tokens, factory } from "./helpers.js";

const app = createApp();
beforeEach(async () => { await resetCrudTables(); });
const auth = (t) => ({ Authorization: `Bearer ${t}` });

describe("Lessor profile aggregate", () => {
  it("returns the owner, units, requirements checklist, form status and activity (staff)", async () => {
    const o = await factory.owner({ name: "Capitol Heights", phone: "0917" });
    await factory.unit(o.id, { unitNumber: "12A", approvalStatus: "SUBMITTED" });
    await prisma.lessorRequirement.create({ data: { unitOwnerId: o.id, requirementKey: "GOV_ID", status: "Approved", reviewedAt: new Date() } });
    await prisma.lessorInfoSheet.create({ data: { unitOwnerId: o.id, status: "SUBMITTED", submittedAt: new Date() } });

    const res = await request(app).get(`/api/owners/${o.id}/profile`).set(auth(tokens.officer()));
    expect(res.status).toBe(200);
    expect(res.body.owner.name).toBe("Capitol Heights");
    expect(res.body.units).toHaveLength(1);
    expect(res.body.units[0].approvalStatus).toBe("SUBMITTED");
    expect(res.body.requirements.items).toHaveLength(7);
    expect(res.body.requirements.summary).toEqual({ approved: 1, total: 7 });
    expect(res.body.acceptanceForm.status).toBe("SUBMITTED");
    expect(Array.isArray(res.body.activity)).toBe(true);
    expect(res.body.activity.length).toBeGreaterThan(0);
    // no binary blobs anywhere
    expect(JSON.stringify(res.body)).not.toContain('"data"');
  });

  it("sorts activity newest-first and caps it at 10 entries", async () => {
    const o = await factory.owner({ name: "Sunrise Towers" });
    for (let i = 0; i < 12; i++) {
      await factory.unit(o.id, { unitNumber: `U${i}`, approvalStatus: "SUBMITTED" });
    }

    const res = await request(app).get(`/api/owners/${o.id}/profile`).set(auth(tokens.officer()));
    expect(res.status).toBe(200);
    expect(res.body.activity.length).toBe(10);
    expect(new Date(res.body.activity[0].at).getTime()).toBeGreaterThanOrEqual(
      new Date(res.body.activity.at(-1).at).getTime()
    );
  });

  it("is staff-only and 404s an unknown owner", async () => {
    const o = await factory.owner();
    const forbidden = await request(app).get(`/api/owners/${o.id}/profile`).set(auth(tokens.owner(o.id)));
    expect(forbidden.status).toBe(403);
    const missing = await request(app).get(`/api/owners/does-not-exist/profile`).set(auth(tokens.officer()));
    expect(missing.status).toBe(404);
  });

  it("acceptanceForm includes submittedByName and formVersion", async () => {
    const o = await factory.owner({ name: "Profile Owner" });
    const s = await request(app).post("/api/lessor-info-sheets")
      .set("Authorization", `Bearer ${tokens.officer()}`).send({ unitOwnerId: o.id });
    await request(app).patch(`/api/lessor-info-sheets/${s.body.id}/submit`)
      .set("Authorization", `Bearer ${tokens.owner(o.id)}`)
      .send({ data: { lastName: "X", firstName: "Y", mobile: "09170000000", email: "x@y.com",
        estate: "Capitol Commons", buildingName: "Maven", unitNumber: "1A", sex: "Male",
        civilStatus: "Single", preferredChannel: ["Email"], leaseTermPeriod: "Long Term (1 year and above)" } });
    const res = await request(app).get(`/api/owners/${o.id}/profile`).set("Authorization", `Bearer ${tokens.officer()}`);
    expect(res.status).toBe(200);
    expect(res.body.acceptanceForm.submittedByName).toBe("Profile Owner");
    expect(res.body.acceptanceForm.formVersion).toBe("2026-08");
  });

  it("returns an onboarding tracker reflecting progress", async () => {
    const o = await factory.owner({ name: "Track Owner" });
    await factory.unit(o.id, { approvalStatus: "APPROVED" });
    const res = await request(app).get(`/api/owners/${o.id}/profile`).set("Authorization", `Bearer ${tokens.officer()}`);
    expect(res.status).toBe(200);
    const ob = res.body.onboarding;
    expect(ob.steps.find((s) => s.key === "units").done).toBe(true);
    expect(ob.steps.find((s) => s.key === "requirements").done).toBe(false); // none approved
    expect(ob.stage).toBe("Requirements complete"); // first not-done after account+units
    expect(ob.percent).toBe(50); // account + units done of 4
  });

  it("exposes the originating inquiry linked to the owner's account", async () => {
    const o = await factory.owner({ name: "Origin Owner", email: "origin@example.com" });
    // a user linked to this owner, and an inquiry converted to that user
    const u = await prisma.user.create({ data: { name: "Origin Owner", email: "originlogin", contactEmail: "origin@example.com", role: "UNIT_OWNER", passwordHash: "x", status: "APPROVED", unitOwnerId: o.id } });
    const inq = await prisma.inquiry.create({ data: { category: "RESIDENCES", inquirerType: "LESSOR", inquiryType: "List Unit for Lease", fullName: "Origin Owner", email: "origin@example.com", consent: true, status: "CONVERTED", convertedUserId: u.id } });
    const res = await request(app).get(`/api/owners/${o.id}/profile`).set("Authorization", `Bearer ${tokens.officer()}`);
    expect(res.body.originInquiry?.id).toBe(inq.id);
    expect(res.body.originInquiry?.inquiryType).toBe("List Unit for Lease");
  });
});
