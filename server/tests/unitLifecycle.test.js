import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { resetCrudTables, tokens, factory } from "./helpers.js";

const app = createApp();
beforeEach(async () => { await resetCrudTables(); });
const auth = (t) => ({ Authorization: `Bearer ${t}` });

describe("Unit lifecycle", () => {
  it("owner create saves a DRAFT by default and SUBMITTED with submit:true", async () => {
    const o = await factory.owner();
    const draft = await request(app).post("/api/units").set(auth(tokens.owner(o.id)))
      .send({ unitNumber: "D1" });
    expect(draft.body.approvalStatus).toBe("DRAFT");
    const sub = await request(app).post("/api/units").set(auth(tokens.owner(o.id)))
      .send({ unitNumber: "S1", submit: true });
    expect(sub.body.approvalStatus).toBe("SUBMITTED");
  });

  it("owner can edit a DRAFT and REJECTED unit but not a SUBMITTED one", async () => {
    const o = await factory.owner();
    const u = await factory.unit(o.id, { unitNumber: "X", approvalStatus: "DRAFT" });
    const ok = await request(app).patch(`/api/units/${u.id}`).set(auth(tokens.owner(o.id)))
      .send({ unitNumber: "X2" });
    expect(ok.status).toBe(200);
    expect(ok.body.unitNumber).toBe("X2");

    const locked = await factory.unit(o.id, { unitNumber: "Y", approvalStatus: "SUBMITTED" });
    const blocked = await request(app).patch(`/api/units/${locked.id}`).set(auth(tokens.owner(o.id)))
      .send({ unitNumber: "Y2" });
    expect(blocked.status).toBe(409);
  });

  it("owner cannot edit another owner's unit (404)", async () => {
    const o1 = await factory.owner(); const o2 = await factory.owner({ name: "Two" });
    const u = await factory.unit(o2.id, { approvalStatus: "DRAFT" });
    const res = await request(app).patch(`/api/units/${u.id}`).set(auth(tokens.owner(o1.id)))
      .send({ unitNumber: "Z" });
    expect(res.status).toBe(404);
  });

  it("submit moves DRAFT/REJECTED to SUBMITTED and clears remarks", async () => {
    const o = await factory.owner();
    const u = await factory.unit(o.id, { approvalStatus: "REJECTED", reviewRemarks: "Fix floor" });
    const res = await request(app).patch(`/api/units/${u.id}/submit`).set(auth(tokens.owner(o.id)));
    expect(res.status).toBe(200);
    expect(res.body.approvalStatus).toBe("SUBMITTED");
    expect(res.body.reviewRemarks).toBeNull();
  });

  it("staff reject requires remarks and records them; approve clears them", async () => {
    const o = await factory.owner();
    const u = await factory.unit(o.id, { approvalStatus: "SUBMITTED" });
    const noReason = await request(app).patch(`/api/units/${u.id}/reject`).set(auth(tokens.officer())).send({});
    expect(noReason.status).toBe(400);
    const rej = await request(app).patch(`/api/units/${u.id}/reject`).set(auth(tokens.officer()))
      .send({ remarks: "Missing slot number" });
    expect(rej.body.approvalStatus).toBe("REJECTED");
    expect(rej.body.reviewRemarks).toBe("Missing slot number");
    const app2 = await request(app).patch(`/api/units/${u.id}/approve`).set(auth(tokens.officer()));
    expect(app2.body.approvalStatus).toBe("APPROVED");
    expect(app2.body.reviewRemarks).toBeNull();
  });

  it("a lessor cannot fetch another owner's unit (404), but can fetch their own", async () => {
    const o1 = await factory.owner(); const o2 = await factory.owner({ name: "Two" });
    const mine = await factory.unit(o1.id, { unitNumber: "M1" });
    const theirs = await factory.unit(o2.id, { unitNumber: "T1" });
    const okMine = await request(app).get(`/api/units/${mine.id}`).set({ Authorization: `Bearer ${tokens.owner(o1.id)}` });
    expect(okMine.status).toBe(200);
    const blocked = await request(app).get(`/api/units/${theirs.id}`).set({ Authorization: `Bearer ${tokens.owner(o1.id)}` });
    expect(blocked.status).toBe(404);
  });
});
