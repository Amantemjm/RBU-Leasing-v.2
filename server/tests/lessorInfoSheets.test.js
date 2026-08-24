import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { resetCrudTables, tokens, factory } from "./helpers.js";

const app = createApp();
beforeEach(async () => { await resetCrudTables(); });

const BASE = "/api/lessor-info-sheets";
const FILLED = {
  lastName: "Dela Cruz", firstName: "Juan", mobile: "09170000000", email: "juan@example.com",
  estate: "Capitol Commons", buildingName: "Maven at Capitol Commons", unitNumber: "12A",
  sex: "Male", civilStatus: "Single", preferredChannel: ["Email", "Viber"],
  unitType: "", unitTypeOther: "2-Bedroom", leaseTermPeriod: "Long Term (1 year and above)",
};

async function requestFor(ownerId) {
  return request(app).post(BASE).set("Authorization", `Bearer ${tokens.officer()}`).send({ unitOwnerId: ownerId });
}

describe("Lessor Information Sheets", () => {
  it("serves the config to any authenticated user", async () => {
    const res = await request(app).get(`${BASE}/config`).set("Authorization", `Bearer ${tokens.viewer()}`);
    expect(res.status).toBe(200);
    expect(res.body.title).toBe("Unit Owner Information Sheet");
    expect(res.body.sections.length).toBeGreaterThan(0);
  });

  it("staff create a REQUESTED sheet for an owner", async () => {
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

  it("an owner sees only their own sheets", async () => {
    const o1 = await factory.owner({ name: "O1" });
    const o2 = await factory.owner({ name: "O2" });
    await requestFor(o1.id);
    await requestFor(o2.id);
    const res = await request(app).get(BASE).set("Authorization", `Bearer ${tokens.owner(o1.id)}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].unitOwnerId).toBe(o1.id);
  });

  it("owner submits with valid data (SUBMITTED, submittedAt set)", async () => {
    const o = await factory.owner();
    const s = await requestFor(o.id);
    const res = await request(app).patch(`${BASE}/${s.body.id}/submit`)
      .set("Authorization", `Bearer ${tokens.owner(o.id)}`).send({ data: FILLED });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("SUBMITTED");
    expect(res.body.submittedAt).toBeTruthy();
    expect(res.body.data.lastName).toBe("Dela Cruz");
  });

  it("rejects a submit missing required fields (400)", async () => {
    const o = await factory.owner();
    const s = await requestFor(o.id);
    const res = await request(app).patch(`${BASE}/${s.body.id}/submit`)
      .set("Authorization", `Bearer ${tokens.owner(o.id)}`).send({ data: { firstName: "Juan" } });
    expect(res.status).toBe(400);
  });

  it("rejects unknown keys on submit (400)", async () => {
    const o = await factory.owner();
    const s = await requestFor(o.id);
    const res = await request(app).patch(`${BASE}/${s.body.id}/submit`)
      .set("Authorization", `Bearer ${tokens.owner(o.id)}`).send({ data: { ...FILLED, sneaky: "x" } });
    expect(res.status).toBe(400);
  });

  it("an owner cannot submit someone else's sheet (404)", async () => {
    const o1 = await factory.owner({ name: "O1" });
    const o2 = await factory.owner({ name: "O2" });
    const s = await requestFor(o2.id);
    const res = await request(app).patch(`${BASE}/${s.body.id}/submit`)
      .set("Authorization", `Bearer ${tokens.owner(o1.id)}`).send({ data: FILLED });
    expect(res.status).toBe(404);
  });

  it("staff review approves a sheet (APPROVED, reviewedAt set)", async () => {
    const o = await factory.owner();
    const s = await requestFor(o.id);
    const res = await request(app).patch(`${BASE}/${s.body.id}/review`)
      .set("Authorization", `Bearer ${tokens.officer()}`).send({ status: "APPROVED" });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("APPROVED");
    expect(res.body.reviewedAt).toBeTruthy();
  });

  it("a unit owner cannot review (403)", async () => {
    const o = await factory.owner();
    const s = await requestFor(o.id);
    const res = await request(app).patch(`${BASE}/${s.body.id}/review`)
      .set("Authorization", `Bearer ${tokens.owner(o.id)}`).send({ status: "APPROVED" });
    expect(res.status).toBe(403);
  });

  it("renders a live preview PDF from posted (unsaved) data", async () => {
    const o = await factory.owner();
    const res = await request(app).post(`${BASE}/preview`)
      .set("Authorization", `Bearer ${tokens.owner(o.id)}`)
      .send({ data: { lastName: "Reyes", firstName: "Antonio" } });
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("application/pdf");
    expect(res.body.slice(0, 5).toString()).toBe("%PDF-");
  });

  const PDF_BYTES = Buffer.from("%PDF-1.4\n% uploaded acceptance form\n%%EOF");

  it("owner uploads/edits and submits a PDF; staff can download it", async () => {
    const o = await factory.owner();
    const s = await requestFor(o.id);
    // save a working copy (status unchanged)
    const saved = await request(app).patch(`${BASE}/${s.body.id}/pdf`)
      .set("Authorization", `Bearer ${tokens.owner(o.id)}`)
      .set("Content-Type", "application/pdf").send(PDF_BYTES);
    expect(saved.status).toBe(200);
    expect(saved.body.status).toBe("REQUESTED");
    expect(saved.body.filledPdf).toBeUndefined();
    // submit it
    const sub = await request(app).patch(`${BASE}/${s.body.id}/submit-pdf`)
      .set("Authorization", `Bearer ${tokens.owner(o.id)}`)
      .set("Content-Type", "application/pdf").send(PDF_BYTES);
    expect(sub.status).toBe(200);
    expect(sub.body.status).toBe("SUBMITTED");
    // staff can retrieve the stored PDF
    const got = await request(app).get(`${BASE}/${s.body.id}/filled-pdf`).set("Authorization", `Bearer ${tokens.admin()}`);
    expect(got.status).toBe(200);
    expect(got.body.slice(0, 5).toString()).toBe("%PDF-");
  });

  it("rejects a non-PDF upload (400) and 404s filled-pdf when none", async () => {
    const o = await factory.owner();
    const s = await requestFor(o.id);
    const bad = await request(app).patch(`${BASE}/${s.body.id}/pdf`)
      .set("Authorization", `Bearer ${tokens.owner(o.id)}`)
      .set("Content-Type", "application/pdf").send(Buffer.from("nope"));
    expect(bad.status).toBe(400);
    const none = await request(app).get(`${BASE}/${s.body.id}/filled-pdf`).set("Authorization", `Bearer ${tokens.admin()}`);
    expect(none.status).toBe(404);
  });

  it("streams a PDF for the sheet", async () => {
    const o = await factory.owner();
    const s = await requestFor(o.id);
    const res = await request(app).get(`${BASE}/${s.body.id}/pdf`)
      .set("Authorization", `Bearer ${tokens.admin()}`);
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("application/pdf");
    expect(res.headers["content-disposition"]).toContain("UnitOwnerAcceptanceForm-");
  });
});
