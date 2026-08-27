import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { issueToken } from "../src/services/authService.js";
import { resetCrudTables, factory } from "./helpers.js";

const app = createApp();
beforeEach(async () => { await resetCrudTables(); });

async function makeOfficer() {
  const u = await prisma.user.create({ data: { name: "Off", email: `off-${Date.now()}@x.com`, passwordHash: "x", role: "LEASING_OFFICER" } });
  return { user: u, token: issueToken({ id: u.id, role: "LEASING_OFFICER" }) };
}
async function acceptedTxn(token) {
  const inq = (await request(app).post("/api/inquiries").send({
    category: "RESIDENCES", inquirerType: "LESSEE", inquiryType: "Unit Availability",
    fullName: "Maria", email: "m@ex.com", consent: true,
  })).body;
  await request(app).patch(`/api/inquiries/${inq.id}/accept`).set("Authorization", `Bearer ${token}`);
  return (await request(app).get("/api/leasing-transactions").set("Authorization", `Bearer ${token}`)).body[0];
}
const auth = (t) => ({ Authorization: `Bearer ${t}` });

describe("Approval stage — routing + documents", () => {
  it("seeds a 4-step routing chain on advancing into Approval", async () => {
    const { token } = await makeOfficer();
    const txn = await acceptedTxn(token);
    await request(app).patch(`/api/leasing-transactions/${txn.id}/advance`).set(auth(token)).send({}); // -> APPROVAL

    const steps = await request(app).get(`/api/leasing-transactions/${txn.id}/approval-steps`).set(auth(token));
    expect(steps.status).toBe(200);
    expect(steps.body.map((s) => s.name)).toEqual(["Leasing", "Management", "Authorized Approver", "Final Approval"]);
    expect(steps.body.every((s) => s.status === "Pending")).toBe(true);
  });

  it("enforces sequential approval and marks the stage Approved only when all steps pass", async () => {
    const { token } = await makeOfficer();
    const txn = await acceptedTxn(token);
    await request(app).patch(`/api/leasing-transactions/${txn.id}/advance`).set(auth(token)).send({});
    const steps = (await request(app).get(`/api/leasing-transactions/${txn.id}/approval-steps`).set(auth(token))).body;

    // approving step 2 before step 1 is blocked
    const outOfOrder = await request(app).patch(`/api/leasing-transactions/${txn.id}/approval-steps/${steps[1].id}`)
      .set(auth(token)).send({ status: "Approved" });
    expect(outOfOrder.status).toBe(409);

    // approve all in order
    let last;
    for (const s of steps) {
      last = await request(app).patch(`/api/leasing-transactions/${txn.id}/approval-steps/${s.id}`)
        .set(auth(token)).send({ status: "Approved" });
      expect(last.status).toBe(200);
    }
    expect(last.body.status).toBe("Approved"); // stage status reflects full approval
    // now it can advance to Unit Inspection
    const adv = await request(app).patch(`/api/leasing-transactions/${txn.id}/advance`).set(auth(token)).send({});
    expect(adv.body.stage).toBe("UNIT_INSPECTION");
  });

  it("reflects a rejection on the Approval stage status", async () => {
    const { token } = await makeOfficer();
    const txn = await acceptedTxn(token);
    await request(app).patch(`/api/leasing-transactions/${txn.id}/advance`).set(auth(token)).send({});
    const steps = (await request(app).get(`/api/leasing-transactions/${txn.id}/approval-steps`).set(auth(token))).body;
    const res = await request(app).patch(`/api/leasing-transactions/${txn.id}/approval-steps/${steps[0].id}`)
      .set(auth(token)).send({ status: "Rejected", remarks: "Incomplete docs" });
    expect(res.body.status).toBe("Rejected");
  });

  it("lets staff upload, list, download and delete a document", async () => {
    const { token } = await makeOfficer();
    const txn = await acceptedTxn(token);
    const up = await request(app).post(`/api/leasing-transactions/${txn.id}/documents`)
      .set(auth(token)).attach("file", Buffer.from("%PDF-1.4 test"), { filename: "id.pdf", contentType: "application/pdf" });
    expect(up.status).toBe(201);
    expect(up.body.filename).toBe("id.pdf");
    expect(up.body.data).toBeUndefined(); // never ship binary

    const detail = await request(app).get(`/api/leasing-transactions/${txn.id}`).set(auth(token));
    expect(detail.body.documents).toHaveLength(1);

    const dl = await request(app).get(`/api/leasing-transactions/${txn.id}/documents/${up.body.id}/download`).set(auth(token));
    expect(dl.status).toBe(200);
    expect(dl.headers["content-type"]).toContain("application/pdf");

    const del = await request(app).delete(`/api/leasing-transactions/${txn.id}/documents/${up.body.id}`).set(auth(token));
    expect(del.status).toBe(204);
  });

  it("lets the linked lessee upload but blocks an unlinked user", async () => {
    const { token } = await makeOfficer();
    const txn = await acceptedTxn(token);
    const tenant = await factory.tenant({ name: "Maria" });
    await request(app).patch(`/api/leasing-transactions/${txn.id}/link`).set(auth(token)).send({ tenantId: tenant.id });

    const lesseeToken = issueToken({ id: "lessee-u", role: "TENANT", tenantId: tenant.id });
    const ok = await request(app).post(`/api/leasing-transactions/${txn.id}/documents`)
      .set(auth(lesseeToken)).attach("file", Buffer.from("%PDF-1.4"), { filename: "req.pdf", contentType: "application/pdf" });
    expect(ok.status).toBe(201);

    const strangerToken = issueToken({ id: "x", role: "TENANT", tenantId: "other" });
    const blocked = await request(app).post(`/api/leasing-transactions/${txn.id}/documents`)
      .set(auth(strangerToken)).attach("file", Buffer.from("%PDF-1.4"), { filename: "x.pdf", contentType: "application/pdf" });
    expect(blocked.status).toBe(404);
  });
});
