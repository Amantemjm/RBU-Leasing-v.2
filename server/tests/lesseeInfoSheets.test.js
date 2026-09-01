import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { resetCrudTables, tokens, factory } from "./helpers.js";

const app = createApp();
beforeEach(async () => { await resetCrudTables(); });

const BASE = "/api/lessee-info-sheets";
const FILLED = {
  lastName: "Santos", firstName: "Maria", mobile: "09170000000", email: "maria@example.com",
  estate: "Capitol Commons", buildingName: "Maven at Capitol Commons", unitNumber: "7B",
  sex: "Female", civilStatus: "Single", preferredChannel: ["Email"],
  unitPaymentStatus: "Post-dated Checks", leaseTermPeriod: "Long Term (1 year and above)",
  typeOfEmployment: "Employed", position: "Manager",
};

async function requestFor(tenantId) {
  return request(app).post(BASE).set("Authorization", `Bearer ${tokens.officer()}`).send({ tenantId });
}

describe("Lessee Information Sheets", () => {
  it("serves the lessee config", async () => {
    const res = await request(app).get(`${BASE}/config`).set("Authorization", `Bearer ${tokens.viewer()}`);
    expect(res.status).toBe(200);
    expect(res.body.title).toBe("Lessee Information Sheet");
  });

  it("staff create a REQUESTED sheet for a tenant", async () => {
    const t = await factory.tenant({ name: "Juan" });
    const res = await requestFor(t.id);
    expect(res.status).toBe(201);
    expect(res.body.status).toBe("REQUESTED");
    expect(res.body.tenantId).toBe(t.id);
  });

  it("a tenant sees only their own sheets", async () => {
    const t1 = await factory.tenant({ name: "T1" });
    const t2 = await factory.tenant({ name: "T2" });
    await requestFor(t1.id);
    await requestFor(t2.id);
    const res = await request(app).get(BASE).set("Authorization", `Bearer ${tokens.tenant(t1.id)}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });

  it("tenant submits with valid data (SUBMITTED)", async () => {
    const t = await factory.tenant();
    const s = await requestFor(t.id);
    const res = await request(app).patch(`${BASE}/${s.body.id}/submit`)
      .set("Authorization", `Bearer ${tokens.tenant(t.id)}`).send({ data: FILLED });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("SUBMITTED");
    expect(res.body.data.buildingName).toBe("Maven at Capitol Commons");
  });

  it("stamps submittedByName (tenant) and formVersion on submit", async () => {
    const t = await factory.tenant({ name: "Juan Tenant" });
    const s = await requestFor(t.id);
    const res = await request(app).patch(`${BASE}/${s.body.id}/submit`)
      .set("Authorization", `Bearer ${tokens.tenant(t.id)}`).send({ data: FILLED });
    expect(res.status).toBe(200);
    expect(res.body.submittedByName).toBe("Juan Tenant");
    expect(res.body.formVersion).toBe("2026-08");
  });

  it("rejects a submit missing required fields (400)", async () => {
    const t = await factory.tenant();
    const s = await requestFor(t.id);
    const res = await request(app).patch(`${BASE}/${s.body.id}/submit`)
      .set("Authorization", `Bearer ${tokens.tenant(t.id)}`).send({ data: { firstName: "Maria" } });
    expect(res.status).toBe(400);
  });

  it("a tenant cannot submit someone else's sheet (404)", async () => {
    const t1 = await factory.tenant({ name: "T1" });
    const t2 = await factory.tenant({ name: "T2" });
    const s = await requestFor(t2.id);
    const res = await request(app).patch(`${BASE}/${s.body.id}/submit`)
      .set("Authorization", `Bearer ${tokens.tenant(t1.id)}`).send({ data: FILLED });
    expect(res.status).toBe(404);
  });

  it("staff review returns a sheet with remarks", async () => {
    const t = await factory.tenant();
    const s = await requestFor(t.id);
    const res = await request(app).patch(`${BASE}/${s.body.id}/review`)
      .set("Authorization", `Bearer ${tokens.admin()}`).send({ status: "RETURNED", remarks: "Missing income" });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("RETURNED");
    expect(res.body.remarks).toBe("Missing income");
  });

  it("a tenant cannot review (403)", async () => {
    const t = await factory.tenant();
    const s = await requestFor(t.id);
    const res = await request(app).patch(`${BASE}/${s.body.id}/review`)
      .set("Authorization", `Bearer ${tokens.tenant(t.id)}`).send({ status: "APPROVED" });
    expect(res.status).toBe(403);
  });

  it("streams a PDF for the tenant's sheet", async () => {
    const t = await factory.tenant();
    const s = await requestFor(t.id);
    const res = await request(app).get(`${BASE}/${s.body.id}/pdf`)
      .set("Authorization", `Bearer ${tokens.tenant(t.id)}`);
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("application/pdf");
    expect(res.headers["content-disposition"]).toContain("LesseeAcceptanceForm-");
  });

  it("lessee acceptance-form approval is not gated by lessor prerequisites", async () => {
    const t = await factory.tenant();
    const s = await requestFor(t.id);
    await request(app).patch(`${BASE}/${s.body.id}/submit`).set("Authorization", `Bearer ${tokens.tenant(t.id)}`).send({ data: FILLED });
    const res = await request(app).patch(`${BASE}/${s.body.id}/review`).set("Authorization", `Bearer ${tokens.officer()}`).send({ status: "APPROVED" });
    expect(res.status).toBe(200);
  });
});
