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

  it("is staff-only and 404s an unknown owner", async () => {
    const o = await factory.owner();
    const forbidden = await request(app).get(`/api/owners/${o.id}/profile`).set(auth(tokens.owner(o.id)));
    expect(forbidden.status).toBe(403);
    const missing = await request(app).get(`/api/owners/does-not-exist/profile`).set(auth(tokens.officer()));
    expect(missing.status).toBe(404);
  });
});
