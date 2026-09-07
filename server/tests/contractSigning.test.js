import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "../src/lib/prisma.js";
import { issueToken } from "../src/services/authService.js";
import { createTransaction } from "../src/services/leasingTransactionService.js";
import { resetCrudTables, tokens, factory } from "./helpers.js";

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
