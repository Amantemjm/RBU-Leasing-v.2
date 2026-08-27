import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { issueToken } from "../src/services/authService.js";
import { resetCrudTables, tokens, factory } from "./helpers.js";

const app = createApp();
beforeEach(async () => { await resetCrudTables(); });

async function makeOfficer(email = "officer@x.com") {
  const u = await prisma.user.create({ data: { name: "Officer O", email, passwordHash: "x", role: "LEASING_OFFICER" } });
  return { user: u, token: issueToken({ id: u.id, role: "LEASING_OFFICER" }) };
}
async function newInquiry() {
  const res = await request(app).post("/api/inquiries").send({
    category: "RESIDENCES", inquirerType: "LESSEE", inquiryType: "Unit Availability",
    fullName: "Maria Santos", email: "maria@example.com", consent: true,
  });
  return res.body;
}

describe("Leasing transactions (process tracker)", () => {
  it("auto-creates a transaction when an O-Lease accepts an inquiry", async () => {
    const inquiry = await newInquiry();
    const { token } = await makeOfficer();
    await request(app).patch(`/api/inquiries/${inquiry.id}/accept`).set("Authorization", `Bearer ${token}`);

    const list = await request(app).get("/api/leasing-transactions").set("Authorization", `Bearer ${token}`);
    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(1);
    const txn = list.body[0];
    expect(txn.reference).toMatch(/^RBU-\d{4}-\d{6}$/);
    expect(txn.stage).toBe("SEND_REQUIREMENTS"); // inquiry complete, awaiting requirements
    expect(txn.lesseeName).toBe("Maria Santos");
  });

  it("advances forward through stages and records events", async () => {
    const inquiry = await newInquiry();
    const { token, user } = await makeOfficer();
    await request(app).patch(`/api/inquiries/${inquiry.id}/accept`).set("Authorization", `Bearer ${token}`);
    const txnId = (await request(app).get("/api/leasing-transactions").set("Authorization", `Bearer ${token}`)).body[0].id;

    const adv = await request(app).patch(`/api/leasing-transactions/${txnId}/advance`)
      .set("Authorization", `Bearer ${token}`).send({ remarks: "Docs complete" });
    expect(adv.status).toBe(200);
    expect(adv.body.stage).toBe("APPROVAL");
    expect(adv.body.stageData.SEND_REQUIREMENTS.completedAt).toBeTruthy();

    // events include creation + advance, newest first
    const detail = await request(app).get(`/api/leasing-transactions/${txnId}`).set("Authorization", `Bearer ${token}`);
    expect(detail.body.events[0].message).toContain("Advanced to Approval");
    expect(detail.body.events[0].actorId).toBe(user.id);
  });

  it("sets a status within the current stage and rejects an invalid one", async () => {
    const inquiry = await newInquiry();
    const { token } = await makeOfficer();
    await request(app).patch(`/api/inquiries/${inquiry.id}/accept`).set("Authorization", `Bearer ${token}`);
    const txnId = (await request(app).get("/api/leasing-transactions").set("Authorization", `Bearer ${token}`)).body[0].id;

    const ok = await request(app).patch(`/api/leasing-transactions/${txnId}/status`)
      .set("Authorization", `Bearer ${token}`).send({ status: "Complete" });
    expect(ok.status).toBe(200);
    expect(ok.body.status).toBe("Complete");

    const bad = await request(app).patch(`/api/leasing-transactions/${txnId}/status`)
      .set("Authorization", `Bearer ${token}`).send({ status: "Bogus Status" });
    expect(bad.status).toBe(400);
  });

  it("returns to the previous stage (exception flow)", async () => {
    const inquiry = await newInquiry();
    const { token } = await makeOfficer();
    await request(app).patch(`/api/inquiries/${inquiry.id}/accept`).set("Authorization", `Bearer ${token}`);
    const txnId = (await request(app).get("/api/leasing-transactions").set("Authorization", `Bearer ${token}`)).body[0].id;
    // advance to APPROVAL then send back
    await request(app).patch(`/api/leasing-transactions/${txnId}/advance`).set("Authorization", `Bearer ${token}`).send({});
    const ret = await request(app).patch(`/api/leasing-transactions/${txnId}/return`)
      .set("Authorization", `Bearer ${token}`).send({ remarks: "Missing document" });
    expect(ret.status).toBe(200);
    expect(ret.body.stage).toBe("SEND_REQUIREMENTS");
  });

  it("links a unit and lessee to the transaction", async () => {
    const inquiry = await newInquiry();
    const { token } = await makeOfficer();
    await request(app).patch(`/api/inquiries/${inquiry.id}/accept`).set("Authorization", `Bearer ${token}`);
    const txnId = (await request(app).get("/api/leasing-transactions").set("Authorization", `Bearer ${token}`)).body[0].id;

    const owner = await factory.owner();
    const unit = await factory.unit(owner.id, { unitNumber: "15-08" });
    const tenant = await factory.tenant({ name: "Maria Santos" });

    const res = await request(app).patch(`/api/leasing-transactions/${txnId}/link`)
      .set("Authorization", `Bearer ${token}`).send({ unitId: unit.id, tenantId: tenant.id });
    expect(res.status).toBe(200);
    expect(res.body.unit.unitNumber).toBe("15-08");
    expect(res.body.tenant.name).toBe("Maria Santos");
  });

  it("lets a linked lessee see their own transaction but not others'", async () => {
    const inquiry = await newInquiry();
    const { token } = await makeOfficer();
    await request(app).patch(`/api/inquiries/${inquiry.id}/accept`).set("Authorization", `Bearer ${token}`);
    const txnId = (await request(app).get("/api/leasing-transactions").set("Authorization", `Bearer ${token}`)).body[0].id;

    const tenant = await factory.tenant({ name: "Maria" });
    await request(app).patch(`/api/leasing-transactions/${txnId}/link`).set("Authorization", `Bearer ${token}`).send({ tenantId: tenant.id });
    const tenantToken = issueToken({ id: "t-user", role: "TENANT", tenantId: tenant.id });

    const mine = await request(app).get("/api/leasing-transactions/mine").set("Authorization", `Bearer ${tenantToken}`);
    expect(mine.body).toHaveLength(1);
    expect(mine.body[0].id).toBe(txnId);

    const otherTenant = issueToken({ id: "t2", role: "TENANT", tenantId: "nope" });
    const none = await request(app).get("/api/leasing-transactions/mine").set("Authorization", `Bearer ${otherTenant}`);
    expect(none.body).toHaveLength(0);
  });

  it("forbids a viewer from advancing", async () => {
    const inquiry = await newInquiry();
    const { token } = await makeOfficer();
    await request(app).patch(`/api/inquiries/${inquiry.id}/accept`).set("Authorization", `Bearer ${token}`);
    const txnId = (await request(app).get("/api/leasing-transactions").set("Authorization", `Bearer ${token}`)).body[0].id;
    const res = await request(app).patch(`/api/leasing-transactions/${txnId}/advance`)
      .set("Authorization", `Bearer ${tokens.viewer()}`).send({});
    expect(res.status).toBe(403);
  });
});
