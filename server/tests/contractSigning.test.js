import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { prisma } from "../src/lib/prisma.js";
import { issueToken } from "../src/services/authService.js";
import { createTransaction } from "../src/services/leasingTransactionService.js";
import { createApp } from "../src/app.js";
import { resetCrudTables, tokens, factory } from "./helpers.js";

const app = createApp();

beforeEach(async () => { await resetCrudTables(); });

async function makeOfficer(email = "signing-officer@x.com") {
  const u = await prisma.user.create({
    data: { name: "Officer O", email, passwordHash: "x", role: "LEASING_OFFICER" },
  });
  return { user: u, token: issueToken({ id: u.id, role: "LEASING_OFFICER" }) };
}

// A transaction parked at Photoshoot — the state this whole feature acts on.
//
// Goes through the service layer directly rather than POST
// /api/leasing-transactions: that endpoint's startStage validation
// (src/validation/leasingTransaction.js, STARTABLE_STAGES) only allows
// INQUIRY/SEND_REQUIREMENTS, a pre-existing business rule unrelated to and
// out of scope for this task. The service itself (createTransaction) accepts
// any stage in STAGE_KEYS, which is what actually parks the transaction at
// PHOTOSHOOT — needed for real by this file's own tests and by Tasks 4-6,
// which extend it.
async function atPhotoshoot(user, { tenantId = null } = {}) {
  return createTransaction(
    { userId: user.id, role: "LEASING_OFFICER" },
    { lesseeName: "Ana Reyes", startStage: "PHOTOSHOOT", tenantId },
  );
}

describe("Typed transaction documents", () => {
  it("stores a document under a named type", async () => {
    const { user } = await makeOfficer();
    const txn = await atPhotoshoot(user);
    const doc = await prisma.transactionDocument.create({
      data: {
        transactionId: txn.id, filename: "loi.pdf", mimeType: "application/pdf",
        size: 3, data: Buffer.from("abc"), docType: "LETTER_OF_INTENT",
      },
    });
    expect(doc.docType).toBe("LETTER_OF_INTENT");
  });

  it("allows many loose attachments but only one of each named type", async () => {
    const { user } = await makeOfficer();
    const txn = await atPhotoshoot(user);
    const base = {
      transactionId: txn.id, mimeType: "application/pdf", size: 3, data: Buffer.from("abc"),
    };
    // Loose attachments carry docType null, which Postgres treats as distinct.
    await prisma.transactionDocument.create({ data: { ...base, filename: "a.pdf" } });
    await prisma.transactionDocument.create({ data: { ...base, filename: "b.pdf" } });
    expect(await prisma.transactionDocument.count({ where: { transactionId: txn.id } })).toBe(2);

    await prisma.transactionDocument.create({
      data: { ...base, filename: "loi.pdf", docType: "LETTER_OF_INTENT" },
    });
    await expect(prisma.transactionDocument.create({
      data: { ...base, filename: "loi2.pdf", docType: "LETTER_OF_INTENT" },
    })).rejects.toThrow();
  });

  it("replaces a typed document through the compound key", async () => {
    const { user } = await makeOfficer();
    const txn = await atPhotoshoot(user);
    const write = (filename) => prisma.transactionDocument.upsert({
      where: { transactionId_docType: { transactionId: txn.id, docType: "SIGNED_CONTRACT" } },
      update: { filename, size: 4, data: Buffer.from("abcd") },
      create: {
        transactionId: txn.id, docType: "SIGNED_CONTRACT", filename,
        mimeType: "application/pdf", size: 4, data: Buffer.from("abcd"),
      },
    });
    await write("draft.pdf");
    const second = await write("executed.pdf");
    expect(second.filename).toBe("executed.pdf");
    expect(await prisma.transactionDocument.count({ where: { transactionId: txn.id } })).toBe(1);
  });
});

describe("Entering Contract Signing", () => {
  const advance = (token, id) =>
    request(app).patch(`/api/leasing-transactions/${id}/advance`)
      .set("Authorization", `Bearer ${token}`).send({});

  const putLoi = (txnId) => prisma.transactionDocument.create({
    data: {
      transactionId: txnId, filename: "loi.pdf", mimeType: "application/pdf",
      size: 3, data: Buffer.from("abc"), docType: "LETTER_OF_INTENT",
    },
  });

  it("refuses to advance when no prospect tenant is linked", async () => {
    const { user, token } = await makeOfficer();
    const txn = await atPhotoshoot(user);
    const res = await advance(token, txn.id);
    expect(res.status).toBe(409);
    expect(res.body.error).toBe("Link a prospect tenant before Contract Signing");
  });

  it("refuses to advance when the Letter of Intent is missing", async () => {
    const { user, token } = await makeOfficer();
    const tenant = await factory.tenant({ name: "Ana" });
    const txn = await atPhotoshoot(user, { tenantId: tenant.id });
    const res = await advance(token, txn.id);
    expect(res.status).toBe(409);
    expect(res.body.error).toBe("Upload the Letter of Intent before Contract Signing");
  });

  it("advances once both the tenant and the Letter of Intent are in place", async () => {
    const { user, token } = await makeOfficer();
    const tenant = await factory.tenant({ name: "Ana" });
    const txn = await atPhotoshoot(user, { tenantId: tenant.id });
    await putLoi(txn.id);

    const res = await advance(token, txn.id);
    expect(res.status).toBe(200);
    expect(res.body.stage).toBe("CONTRACT_SIGNING");
    expect(res.body.status).toBe("Pending");
    expect(res.body.finalStatus).toBe("Pending"); // terminal stage writes finalStatus
    expect(res.body.stageData.PHOTOSHOOT.completedAt).toBeTruthy();
  });

  it("refuses to advance past Contract Signing", async () => {
    const { user, token } = await makeOfficer();
    const tenant = await factory.tenant({ name: "Ana" });
    const txn = await atPhotoshoot(user, { tenantId: tenant.id });
    await putLoi(txn.id);
    await advance(token, txn.id);

    const res = await advance(token, txn.id);
    expect(res.status).toBe(409);
    expect(res.body.error).toBe("The transaction is already at the final stage");
  });

  // The gate is on leaving Photoshoot only — earlier stages are untouched.
  it("does not gate any other stage transition", async () => {
    const { user, token } = await makeOfficer();
    const parked = await createTransaction(
      { userId: user.id, role: "LEASING_OFFICER" },
      { lesseeName: "Ana Reyes", startStage: "KEY_TURNOVER" },
    );
    const res = await advance(token, parked.id);
    expect(res.status).toBe(200);
    expect(res.body.stage).toBe("PHOTOSHOOT");
  });
});

describe("Documents driving the pipeline", () => {
  const pdf = Buffer.from("%PDF-1.4 test");
  const upload = (token, txnId, docType) => {
    const req = request(app).post(`/api/leasing-transactions/${txnId}/documents`)
      .set("Authorization", `Bearer ${token}`)
      .attach("file", pdf, { filename: "doc.pdf", contentType: "application/pdf" });
    return docType ? req.field("docType", docType) : req;
  };

  it("advances to Contract Signing the moment the LOI lands", async () => {
    const { user, token } = await makeOfficer();
    const tenant = await factory.tenant({ name: "Ana" });
    const txn = await atPhotoshoot(user, { tenantId: tenant.id });

    const res = await upload(token, txn.id, "LETTER_OF_INTENT");
    expect(res.status).toBe(201);
    expect(res.body.docType).toBe("LETTER_OF_INTENT");

    const after = await prisma.leasingTransaction.findUnique({ where: { id: txn.id } });
    expect(after.stage).toBe("CONTRACT_SIGNING");
  });

  // The shoot may not even have happened yet — this upload must not imply it has.
  it("stores the LOI without moving anything when no tenant is linked", async () => {
    const { user, token } = await makeOfficer();
    const txn = await atPhotoshoot(user);

    const res = await upload(token, txn.id, "LETTER_OF_INTENT");
    expect(res.status).toBe(201);

    const after = await prisma.leasingTransaction.findUnique({ where: { id: txn.id } });
    expect(after.stage).toBe("PHOTOSHOOT");
    expect(after.status).toBe("Pending"); // untouched
  });

  it("closes the transaction when the signed contract is uploaded", async () => {
    const { user, token } = await makeOfficer();
    const tenant = await factory.tenant({ name: "Ana" });
    const txn = await atPhotoshoot(user, { tenantId: tenant.id });
    await upload(token, txn.id, "LETTER_OF_INTENT");

    const res = await upload(token, txn.id, "SIGNED_CONTRACT");
    expect(res.status).toBe(201);

    const after = await prisma.leasingTransaction.findUnique({ where: { id: txn.id } });
    expect(after.stage).toBe("CONTRACT_SIGNING");
    expect(after.status).toBe("Signed");
    expect(after.finalStatus).toBe("Signed");
  });

  it("replaces a typed document rather than stacking it", async () => {
    const { user, token } = await makeOfficer();
    const txn = await atPhotoshoot(user);
    await upload(token, txn.id, "LETTER_OF_INTENT");
    await upload(token, txn.id, "LETTER_OF_INTENT");

    const rows = await prisma.transactionDocument.findMany({
      where: { transactionId: txn.id, docType: "LETTER_OF_INTENT" },
    });
    expect(rows).toHaveLength(1);
  });

  it("still stacks loose attachments", async () => {
    const { user, token } = await makeOfficer();
    const txn = await atPhotoshoot(user);
    await upload(token, txn.id);
    await upload(token, txn.id);

    const rows = await prisma.transactionDocument.findMany({
      where: { transactionId: txn.id, docType: null },
    });
    expect(rows).toHaveLength(2);
  });

  it("rejects a document type that is not on the registry", async () => {
    const { user, token } = await makeOfficer();
    const txn = await atPhotoshoot(user);
    const res = await upload(token, txn.id, "NOT_A_TYPE");
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Unknown document type");
  });

  it("lets the linked lessee download the signed contract", async () => {
    const { user, token } = await makeOfficer();
    const tenant = await factory.tenant({ name: "Ana" });
    const txn = await atPhotoshoot(user, { tenantId: tenant.id });
    await upload(token, txn.id, "LETTER_OF_INTENT");
    const up = await upload(token, txn.id, "SIGNED_CONTRACT");

    const res = await request(app)
      .get(`/api/leasing-transactions/${txn.id}/documents/${up.body.id}/download`)
      .set("Authorization", `Bearer ${tokens.tenant(tenant.id)}`);
    expect(res.status).toBe(200);
  });

  it("does not let an unlinked lessee download it", async () => {
    const { user, token } = await makeOfficer();
    const tenant = await factory.tenant({ name: "Ana" });
    const other = await factory.tenant({ name: "Ben" });
    const txn = await atPhotoshoot(user, { tenantId: tenant.id });
    await upload(token, txn.id, "LETTER_OF_INTENT");
    const up = await upload(token, txn.id, "SIGNED_CONTRACT");

    const res = await request(app)
      .get(`/api/leasing-transactions/${txn.id}/documents/${up.body.id}/download`)
      .set("Authorization", `Bearer ${tokens.tenant(other.id)}`);
    expect(res.status).toBe(404);
  });

  // A portal party may see and attach loose files, but must not be able to
  // single-handedly drive the stage machine by uploading a typed document —
  // that is staff's job, since the physical paper changes hands through them.
  it("refuses a linked lessee's typed upload and leaves the transaction untouched", async () => {
    const { user, token } = await makeOfficer();
    const tenant = await factory.tenant({ name: "Ana" });
    const txn = await atPhotoshoot(user, { tenantId: tenant.id });
    await upload(token, txn.id, "LETTER_OF_INTENT");
    await request(app).patch(`/api/leasing-transactions/${txn.id}/advance`)
      .set("Authorization", `Bearer ${token}`).send({});

    const res = await upload(tokens.tenant(tenant.id), txn.id, "SIGNED_CONTRACT");
    expect(res.status).toBe(403);

    const after = await prisma.leasingTransaction.findUnique({ where: { id: txn.id } });
    expect(after.stage).toBe("CONTRACT_SIGNING");
    expect(after.status).toBe("Pending");
    const doc = await prisma.transactionDocument.findFirst({
      where: { transactionId: txn.id, docType: "SIGNED_CONTRACT" },
    });
    expect(doc).toBeNull();
  });

  it("still lets that same linked lessee upload a loose attachment", async () => {
    const { user, token } = await makeOfficer();
    const tenant = await factory.tenant({ name: "Ana" });
    const txn = await atPhotoshoot(user, { tenantId: tenant.id });

    const res = await upload(tokens.tenant(tenant.id), txn.id);
    expect(res.status).toBe(201);

    const rows = await prisma.transactionDocument.findMany({
      where: { transactionId: txn.id, docType: null },
    });
    expect(rows).toHaveLength(1);
  });

  // Regression: includeFull (used by every read path) must carry docType too,
  // not just DOC_SELECT (the upload response) — otherwise every named slot in
  // the UI reads document.docType as undefined forever.
  it("carries docType through the GET boundary, not just the upload response", async () => {
    const { user, token } = await makeOfficer();
    const tenant = await factory.tenant({ name: "Ana" });
    const txn = await atPhotoshoot(user, { tenantId: tenant.id });
    await upload(token, txn.id, "LETTER_OF_INTENT");

    const res = await request(app).get(`/api/leasing-transactions/${txn.id}`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    const loi = res.body.documents.find((d) => d.filename === "doc.pdf");
    expect(loi.docType).toBe("LETTER_OF_INTENT");
  });
});

describe("Awaiting Prospect", () => {
  async function shotWithNoTenant(user, token) {
    const txn = await atPhotoshoot(user);
    const appt = await request(app)
      .post(`/api/appointments/transaction/${txn.id}/PHOTOSHOOT`)
      .set("Authorization", `Bearer ${token}`)
      .send({ scheduledAt: new Date().toISOString(), location: "Ibiza Tower" });
    await request(app).patch(`/api/appointments/${appt.body.id}/complete`)
      .set("Authorization", `Bearer ${token}`).send({});
    return txn;
  }

  it("rests at Awaiting Prospect when the shoot finishes with nobody in view", async () => {
    const { user, token } = await makeOfficer();
    const txn = await shotWithNoTenant(user, token);
    const after = await prisma.leasingTransaction.findUnique({ where: { id: txn.id } });
    expect(after.status).toBe("Awaiting Prospect");
  });

  // The shoot did complete — only the stage's resting status differs.
  it("still records the appointment itself as Completed", async () => {
    const { user, token } = await makeOfficer();
    const txn = await shotWithNoTenant(user, token);
    const appt = await prisma.appointment.findFirst({ where: { transactionId: txn.id } });
    expect(appt.status).toBe("Completed");
    expect(appt.outcome).toBe("Completed");
  });

  it("rests at Completed when a tenant is already linked", async () => {
    const { user, token } = await makeOfficer();
    const tenant = await factory.tenant({ name: "Ana" });
    const txn = await atPhotoshoot(user, { tenantId: tenant.id });
    const appt = await request(app)
      .post(`/api/appointments/transaction/${txn.id}/PHOTOSHOOT`)
      .set("Authorization", `Bearer ${token}`)
      .send({ scheduledAt: new Date().toISOString() });
    await request(app).patch(`/api/appointments/${appt.body.id}/complete`)
      .set("Authorization", `Bearer ${token}`).send({});

    const after = await prisma.leasingTransaction.findUnique({ where: { id: txn.id } });
    expect(after.status).toBe("Completed");
  });

  it("returns to Completed when a prospect finally appears", async () => {
    const { user, token } = await makeOfficer();
    const txn = await shotWithNoTenant(user, token);
    const tenant = await factory.tenant({ name: "Ana" });

    const res = await request(app).patch(`/api/leasing-transactions/${txn.id}/link`)
      .set("Authorization", `Bearer ${token}`).send({ tenantId: tenant.id });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("Completed");
    expect(res.body.stageData.PHOTOSHOOT.status).toBe("Completed");
  });
});
