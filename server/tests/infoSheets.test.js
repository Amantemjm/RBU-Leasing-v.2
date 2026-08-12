import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { resetCrudTables, tokens, factory } from "./helpers.js";

const app = createApp();
beforeEach(async () => { await resetCrudTables(); });

const FILLED = {
  fullName: "Juan Dela Cruz", email: "juan@example.com", mobile: "09170000000",
  bankName: "BDO", accountName: "Juan Dela Cruz", accountNumber: "0011223344",
  nationality: "Filipino", bankBranch: "Ortigas",
};

async function requestFor(ownerId) {
  const res = await request(app).post("/api/info-sheets")
    .set("Authorization", `Bearer ${tokens.officer()}`)
    .send({ unitOwnerId: ownerId });
  return res;
}

describe("Unit Owner Information Sheets", () => {
  it("O-Lease creates a request (201, REQUESTED)", async () => {
    const o = await factory.owner({ name: "Ayala" });
    const res = await requestFor(o.id);
    expect(res.status).toBe(201);
    expect(res.body.status).toBe("REQUESTED");
    expect(res.body.unitOwnerId).toBe(o.id);
  });

  it("rejects a request for a non-existent owner (400)", async () => {
    const res = await requestFor("ghost");
    expect(res.status).toBe(400);
  });

  it("a viewer cannot create a request (403)", async () => {
    const o = await factory.owner();
    const res = await request(app).post("/api/info-sheets")
      .set("Authorization", `Bearer ${tokens.viewer()}`).send({ unitOwnerId: o.id });
    expect(res.status).toBe(403);
  });

  it("an owner sees only their own sheets", async () => {
    const o1 = await factory.owner({ name: "O1" });
    const o2 = await factory.owner({ name: "O2" });
    await requestFor(o1.id);
    await requestFor(o2.id);
    const res = await request(app).get("/api/info-sheets").set("Authorization", `Bearer ${tokens.owner(o1.id)}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].unitOwnerId).toBe(o1.id);
  });

  it("a tenant cannot list sheets (403)", async () => {
    const t = await factory.tenant();
    const res = await request(app).get("/api/info-sheets").set("Authorization", `Bearer ${tokens.tenant(t.id)}`);
    expect(res.status).toBe(403);
  });

  it("the owner submits their sheet (SUBMITTED, submittedAt set)", async () => {
    const o = await factory.owner();
    const s = await requestFor(o.id);
    const res = await request(app).patch(`/api/info-sheets/${s.body.id}/submit`)
      .set("Authorization", `Bearer ${tokens.owner(o.id)}`).send(FILLED);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("SUBMITTED");
    expect(res.body.fullName).toBe("Juan Dela Cruz");
    expect(res.body.submittedAt).toBeTruthy();
  });

  it("rejects a submit missing required fields (400)", async () => {
    const o = await factory.owner();
    const s = await requestFor(o.id);
    const res = await request(app).patch(`/api/info-sheets/${s.body.id}/submit`)
      .set("Authorization", `Bearer ${tokens.owner(o.id)}`).send({ fullName: "Only Name" });
    expect(res.status).toBe(400);
  });

  it("an owner cannot submit someone else's sheet (404)", async () => {
    const o1 = await factory.owner({ name: "O1" });
    const o2 = await factory.owner({ name: "O2" });
    const s = await requestFor(o2.id);
    const res = await request(app).patch(`/api/info-sheets/${s.body.id}/submit`)
      .set("Authorization", `Bearer ${tokens.owner(o1.id)}`).send(FILLED);
    expect(res.status).toBe(404);
  });

  it("staff review approves a sheet (APPROVED, reviewedAt set)", async () => {
    const o = await factory.owner();
    const s = await requestFor(o.id);
    await request(app).patch(`/api/info-sheets/${s.body.id}/submit`)
      .set("Authorization", `Bearer ${tokens.owner(o.id)}`).send(FILLED);
    const res = await request(app).patch(`/api/info-sheets/${s.body.id}/review`)
      .set("Authorization", `Bearer ${tokens.officer()}`).send({ status: "APPROVED" });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("APPROVED");
    expect(res.body.reviewedAt).toBeTruthy();
  });

  it("staff review returns a sheet with remarks (RETURNED)", async () => {
    const o = await factory.owner();
    const s = await requestFor(o.id);
    const res = await request(app).patch(`/api/info-sheets/${s.body.id}/review`)
      .set("Authorization", `Bearer ${tokens.admin()}`).send({ status: "RETURNED", remarks: "Bank details unclear" });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("RETURNED");
    expect(res.body.remarks).toBe("Bank details unclear");
  });

  it("rejects an invalid review status (400)", async () => {
    const o = await factory.owner();
    const s = await requestFor(o.id);
    const res = await request(app).patch(`/api/info-sheets/${s.body.id}/review`)
      .set("Authorization", `Bearer ${tokens.officer()}`).send({ status: "REQUESTED" });
    expect(res.status).toBe(400);
  });

  it("a unit owner cannot review (403)", async () => {
    const o = await factory.owner();
    const s = await requestFor(o.id);
    const res = await request(app).patch(`/api/info-sheets/${s.body.id}/review`)
      .set("Authorization", `Bearer ${tokens.owner(o.id)}`).send({ status: "APPROVED" });
    expect(res.status).toBe(403);
  });

  it("an owner fetching another's sheet gets 404", async () => {
    const o1 = await factory.owner({ name: "O1" });
    const o2 = await factory.owner({ name: "O2" });
    const s = await requestFor(o2.id);
    const res = await request(app).get(`/api/info-sheets/${s.body.id}`)
      .set("Authorization", `Bearer ${tokens.owner(o1.id)}`);
    expect(res.status).toBe(404);
  });
});
