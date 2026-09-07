# Contract Signing Stage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a seventh leasing stage, Contract Signing, entered only when a prospect tenant is linked and a Letter of Intent has been uploaded, and closed by uploading the signed contract.

**Architecture:** The stage list in `shared/leasingStages.js` is the single source of truth read by both server and client, so the seventh stage is mostly a config change — the tracker and portal pick it up for free. Two typed documents (Letter of Intent, Signed Lease Contract) are stored as a nullable `docType` discriminator on the existing `TransactionDocument` model rather than a new table, with a compound unique index giving them replace-on-re-upload semantics while loose attachments keep stacking. Uploads drive the pipeline: the LOI calls the existing `advance`, the signed contract calls the existing `setStatus`, so event logging and `stageData` stay consistent with every other transition.

**Tech Stack:** Node 20 + Express 5, Prisma 6.19 + PostgreSQL, Vue 3 `<script setup>` + vue-router + Pinia, Vitest (`vitest run`) with supertest on the server and @vue/test-utils + happy-dom on the client.

**Spec:** `docs/superpowers/specs/2026-09-07-contract-signing-stage-design.md`

## Global Constraints

- **TDD is mandatory.** Write the test, run it, watch it fail for the right reason, then implement. A test that passes before the implementation exists is a broken test, not a finished task.
- **Migrations are idempotent additive SQL** in `server/prisma/manual-migrations/`, never `prisma migrate`. The committed Prisma history has drifted from the deployed databases.
- **`prisma generate` fails with EPERM while the API is running** — the Node process holds the query-engine DLL open. Stop the dev server and the `rbu-leasing` Windows service before running it.
- **The API has no watch mode** (`node src/index.js`). Restart it manually after any server change, or the next request hits the old code.
- **Line endings are mixed CRLF/LF** in this repo. Use the Edit tool for surgical changes; scripted regex edits have landed in the wrong block here before.
- **Never hardcode a stage list.** Derive from `STAGE_KEYS` / `LEASING_STAGES`. The bug this plan fixes in Task 1 is exactly that mistake.
- Run server tests from `server/` and client tests from `client/`, both via `npm test`.

---

### Task 1: Seventh stage and a derived `isFinalStage`

The registry is read by the server state machine, the tracker, the scheduling panel and the portal progress view. Getting this right first means every later task builds on real config.

`isFinalStage` currently reads `return key === "PHOTOSHOOT";`. Left alone, appending a stage means `finalStatus` is never written again — a silent data bug. Deriving it is required, not cosmetic.

**Files:**
- Modify: `shared/leasingStages.js`
- Test: `server/tests/leasingStages.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces: `LEASING_STAGES` gains a 7th entry with `key: "CONTRACT_SIGNING"`. `STAGE_KEYS` becomes 7 long. `isFinalStage("CONTRACT_SIGNING") === true`. `PHOTOSHOOT.statuses` includes `"Awaiting Prospect"`. `SCHEDULABLE_STAGES` is unchanged (still 3 keys).

- [ ] **Step 1: Write the failing tests**

In `server/tests/leasingStages.test.js`, replace the existing `"has the six lessor stages in order"` and `"marks Photoshoot as the terminal stage"` tests with these, and add the two new ones:

```js
  it("has the seven lessor stages in order", () => {
    expect(STAGE_KEYS).toEqual([
      "INQUIRY", "SEND_REQUIREMENTS", "APPROVAL",
      "UNIT_INSPECTION", "KEY_TURNOVER", "PHOTOSHOOT", "CONTRACT_SIGNING",
    ]);
  });

  it("marks Contract Signing as the terminal stage, not Photoshoot", () => {
    expect(isFinalStage("CONTRACT_SIGNING")).toBe(true);
    expect(isFinalStage("PHOTOSHOOT")).toBe(false);
    expect(nextStageKey("PHOTOSHOOT")).toBe("CONTRACT_SIGNING");
    expect(nextStageKey("CONTRACT_SIGNING")).toBe(null);
  });

  it("rests Photoshoot at Awaiting Prospect when no tenant has appeared", () => {
    expect(stageByKey("PHOTOSHOOT").statuses).toContain("Awaiting Prospect");
    expect(stageByKey("PHOTOSHOOT").done).toBe("Completed"); // waiting is not done
  });

  it("does not make Contract Signing schedulable", () => {
    expect(SCHEDULABLE_STAGE_KEYS).toEqual(["UNIT_INSPECTION", "KEY_TURNOVER", "PHOTOSHOOT"]);
    expect(isSchedulableStage("CONTRACT_SIGNING")).toBe(false);
    expect(stageByKey("CONTRACT_SIGNING").done).toBe("Signed");
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd server && npx vitest run tests/leasingStages.test.js
```

Expected: FAIL. `STAGE_KEYS` has 6 entries not 7; `isFinalStage("PHOTOSHOOT")` returns `true`; `stageByKey("CONTRACT_SIGNING")` is `undefined`.

- [ ] **Step 3: Add the stage and the new Photoshoot status**

In `shared/leasingStages.js`, add `"Awaiting Prospect"` to the `PHOTOSHOOT` entry's `statuses` array:

```js
    statuses: ["Pending", "Scheduled", "In Progress", "Completed", "Awaiting Prospect", "Rescheduled"],
```

Then append a seventh entry to `LEASING_STAGES`, after the `PHOTOSHOOT` object and inside the closing `];`:

```js
  {
    key: "CONTRACT_SIGNING", label: "Contract Signing", short: "Signing",
    statuses: ["Pending", "For Signature", "Signed", "Declined"],
    initial: "Pending", done: "Signed",
    lesseeAction: "Sign the lease contract.",
  },
```

- [ ] **Step 4: Derive `isFinalStage` instead of hardcoding it**

Replace the whole function:

```js
// The terminal stage is whichever is last — hardcoding a key here silently
// stops `finalStatus` ever being written the moment a stage is appended.
export function isFinalStage(key) {
  return key === STAGE_KEYS[STAGE_KEYS.length - 1];
}
```

`FINAL_STATUSES` already derives from the last stage and needs no change.

- [ ] **Step 5: Run the tests to verify they pass**

```bash
cd server && npx vitest run tests/leasingStages.test.js
```

Expected: PASS, all tests in the file.

- [ ] **Step 6: Run the full server suite to catch anything that assumed six stages**

```bash
cd server && npm test
```

Expected: PASS. If a test fails asserting `isFinalStage("PHOTOSHOOT")` or a 6-length stage list, update that assertion to the new reality — do not revert the change.

- [ ] **Step 7: Commit**

```bash
git add shared/leasingStages.js server/tests/leasingStages.test.js
git commit -m "feat(stages): add Contract Signing as the seventh, terminal stage

Also derives isFinalStage from the last key. It was hardcoded to
PHOTOSHOOT, which would have silently stopped finalStatus ever being
written once a stage was appended.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: Typed document registry

A tiny shared config, mirroring `shared/lessorRequirements.js`, so the server's validation and the client's upload selector read the same list and cannot drift.

**Files:**
- Create: `shared/transactionDocuments.js`
- Test: `server/tests/transactionDocuments.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces: `TRANSACTION_DOCUMENT_TYPES` (array of `{ key, label, stage, gate }`), `TRANSACTION_DOCUMENT_KEYS` (`string[]`), `docTypeByKey(key)` → the object or `null`, `labelForDocType(key)` → `string`. Tasks 5 and 7 import these.

- [ ] **Step 1: Write the failing test**

Create `server/tests/transactionDocuments.test.js`:

```js
import { describe, it, expect } from "vitest";
import {
  TRANSACTION_DOCUMENT_TYPES, TRANSACTION_DOCUMENT_KEYS, docTypeByKey, labelForDocType,
} from "../../shared/transactionDocuments.js";

// The two documents the Contract Signing flow turns on. Both change hands
// outside the system; RBU only holds them.
describe("Transaction document types", () => {
  it("has exactly the two typed slots, in flow order", () => {
    expect(TRANSACTION_DOCUMENT_KEYS).toEqual(["LETTER_OF_INTENT", "SIGNED_CONTRACT"]);
  });

  it("names the stage each document belongs to", () => {
    expect(docTypeByKey("LETTER_OF_INTENT").stage).toBe("PHOTOSHOOT");
    expect(docTypeByKey("SIGNED_CONTRACT").stage).toBe("CONTRACT_SIGNING");
  });

  it("says what each document gates", () => {
    expect(docTypeByKey("LETTER_OF_INTENT").gate).toBe("advance");
    expect(docTypeByKey("SIGNED_CONTRACT").gate).toBe("complete");
  });

  it("gives every type a human label", () => {
    expect(labelForDocType("LETTER_OF_INTENT")).toBe("Letter of Intent");
    expect(labelForDocType("SIGNED_CONTRACT")).toBe("Signed Lease Contract");
    expect(TRANSACTION_DOCUMENT_TYPES.every((t) => t.label && t.key)).toBe(true);
  });

  it("returns null for an unknown key and echoes it back as a label", () => {
    expect(docTypeByKey("NOPE")).toBe(null);
    expect(labelForDocType("NOPE")).toBe("NOPE");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd server && npx vitest run tests/transactionDocuments.test.js
```

Expected: FAIL — `Cannot find module '../../shared/transactionDocuments.js'`.

- [ ] **Step 3: Create the registry**

Create `shared/transactionDocuments.js`:

```js
// The documents a leasing transaction holds in a named slot, as opposed to the
// loose supporting attachments (which carry docType = null). Both of these
// change hands outside the system — RBU stores the signed artefact, it does not
// produce it. Shared by the server (validation + gating) and the client (upload
// selector) so the two cannot drift.
export const TRANSACTION_DOCUMENT_TYPES = [
  {
    key: "LETTER_OF_INTENT",
    label: "Letter of Intent",
    stage: "PHOTOSHOOT",
    gate: "advance", // uploading it moves the transaction into Contract Signing
  },
  {
    key: "SIGNED_CONTRACT",
    label: "Signed Lease Contract",
    stage: "CONTRACT_SIGNING",
    gate: "complete", // uploading it closes the stage, and the transaction
  },
];

export const TRANSACTION_DOCUMENT_KEYS = TRANSACTION_DOCUMENT_TYPES.map((t) => t.key);

export const docTypeByKey = (key) =>
  TRANSACTION_DOCUMENT_TYPES.find((t) => t.key === key) || null;

export const labelForDocType = (key) => docTypeByKey(key)?.label || key;
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd server && npx vitest run tests/transactionDocuments.test.js
```

Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add shared/transactionDocuments.js server/tests/transactionDocuments.test.js
git commit -m "feat(documents): shared registry for the two typed transaction documents

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: `docType` column and its unique index

Postgres treats `NULL` as distinct in a unique index, so the compound unique lets a transaction hold any number of loose attachments while holding at most one of each typed document. That is what gives typed uploads their replace-on-re-upload behaviour in Task 5.

**Files:**
- Modify: `server/prisma/schema.prisma` (the `TransactionDocument` model, around line 400)
- Create: `server/prisma/manual-migrations/2026-09-07-transaction-document-types.sql`
- Test: `server/tests/contractSigning.test.js` (new file, extended by Tasks 4–6)

**Interfaces:**
- Consumes: `TRANSACTION_DOCUMENT_KEYS` from Task 2.
- Produces: `prisma.transactionDocument` accepts and returns a nullable `docType` field, and supports `upsert` on the compound key `transactionId_docType`.

- [ ] **Step 1: Write the failing test**

Create `server/tests/contractSigning.test.js`:

```js
import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { issueToken } from "../src/services/authService.js";
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
async function atPhotoshoot(token, { tenantId = null } = {}) {
  const res = await request(app).post("/api/leasing-transactions")
    .set("Authorization", `Bearer ${token}`)
    .send({ lesseeName: "Ana Reyes", startStage: "PHOTOSHOOT", tenantId });
  expect(res.status).toBe(201);
  return res.body;
}

describe("Typed transaction documents", () => {
  it("stores a document under a named type", async () => {
    const { token } = await makeOfficer();
    const txn = await atPhotoshoot(token);
    const doc = await prisma.transactionDocument.create({
      data: {
        transactionId: txn.id, filename: "loi.pdf", mimeType: "application/pdf",
        size: 3, data: Buffer.from("abc"), docType: "LETTER_OF_INTENT",
      },
    });
    expect(doc.docType).toBe("LETTER_OF_INTENT");
  });

  it("allows many loose attachments but only one of each named type", async () => {
    const { token } = await makeOfficer();
    const txn = await atPhotoshoot(token);
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
    const { token } = await makeOfficer();
    const txn = await atPhotoshoot(token);
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
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd server && npx vitest run tests/contractSigning.test.js
```

Expected: FAIL — `Unknown argument 'docType'` from Prisma, because the column does not exist yet.

- [ ] **Step 3: Add the field to the Prisma schema**

In `server/prisma/schema.prisma`, inside `model TransactionDocument`, add the field after `stage` and the index block before the closing brace:

```prisma
  stage         String?  // stage the document was uploaded under
  docType       String?  // LETTER_OF_INTENT | SIGNED_CONTRACT; null = loose supporting document
  uploadedById  String?
  uploadedByName String?
  createdAt     DateTime @default(now())

  @@unique([transactionId, docType])
  @@index([transactionId])
```

- [ ] **Step 4: Write the manual migration**

Create `server/prisma/manual-migrations/2026-09-07-transaction-document-types.sql`:

```sql
-- Named document slots on a transaction: the Letter of Intent that gates entry
-- to Contract Signing, and the signed contract that closes it. Additive and
-- idempotent, in line with the other manual migrations here — the committed
-- Prisma history has drifted on the deployed databases.
--
-- NULL docType means a loose supporting attachment. Postgres treats NULLs as
-- distinct in a unique index, so a transaction may hold any number of those
-- while holding at most one of each named type.
ALTER TABLE "TransactionDocument" ADD COLUMN IF NOT EXISTS "docType" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "TransactionDocument_transactionId_docType_key"
  ON "TransactionDocument" ("transactionId", "docType");
```

- [ ] **Step 5: Stop anything holding the Prisma engine, then regenerate**

`prisma generate` fails with EPERM while the API is running — the Node process holds the query-engine DLL open.

```bash
cd server && npx prisma generate
```

If it fails with EPERM: stop the dev server (Ctrl-C in its terminal) and stop the Windows service, then retry.

```powershell
Stop-Service rbu-leasing -ErrorAction SilentlyContinue
```

- [ ] **Step 6: Apply the migration to the dev and test databases**

```bash
cd server && node -e "const u=require('dotenv').config({path:'.env'}).parsed.DATABASE_URL;console.log(u)"
```

Apply the SQL to both databases named by `server/.env` and `server/.env.test`:

```bash
cd server && npx prisma db execute --file prisma/manual-migrations/2026-09-07-transaction-document-types.sql --schema prisma/schema.prisma
```

Then the test database, which `.env.test` names:

```bash
cd server && npx dotenv -e .env.test -- npx prisma db execute --file prisma/manual-migrations/2026-09-07-transaction-document-types.sql --schema prisma/schema.prisma
```

If `dotenv-cli` is not installed, set the variable inline instead:

```bash
cd server && DATABASE_URL="$(grep '^DATABASE_URL=' .env.test | cut -d= -f2-)" npx prisma db execute --file prisma/manual-migrations/2026-09-07-transaction-document-types.sql --schema prisma/schema.prisma
```

- [ ] **Step 7: Run the test to verify it passes**

```bash
cd server && npx vitest run tests/contractSigning.test.js
```

Expected: PASS, 3 tests.

- [ ] **Step 8: Commit**

```bash
git add server/prisma/schema.prisma server/prisma/manual-migrations/2026-09-07-transaction-document-types.sql server/tests/contractSigning.test.js
git commit -m "feat(documents): docType slot on TransactionDocument

Compound unique on (transactionId, docType) gives typed documents
replace-on-re-upload while loose attachments keep stacking, since
Postgres treats NULL as distinct.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

> **Deployment note for whoever ships this:** this is now the *second* manual migration pending on the office server. `2026-09-07-lessee-requirements.sql` is still unapplied there. Both must run before the next deploy, or the first request to touch either feature returns a 500.

---

### Task 4: Refuse to leave Photoshoot without a tenant and an LOI

**Files:**
- Modify: `server/src/services/leasingTransactionService.js` (`advance`, around line 178)
- Test: `server/tests/contractSigning.test.js`

**Interfaces:**
- Consumes: the 7-stage registry from Task 1; the `docType` column from Task 3.
- Produces: `advance(actor, id, { status, remarks })` throws `ConflictError` when leaving `PHOTOSHOOT` without `tenantId` or without a `LETTER_OF_INTENT` document. No signature change.

- [ ] **Step 1: Write the failing tests**

Append to `server/tests/contractSigning.test.js`:

```js
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
    const { token } = await makeOfficer();
    const txn = await atPhotoshoot(token);
    const res = await advance(token, txn.id);
    expect(res.status).toBe(409);
    expect(res.body.error).toBe("Link a prospect tenant before Contract Signing");
  });

  it("refuses to advance when the Letter of Intent is missing", async () => {
    const { token } = await makeOfficer();
    const tenant = await factory.tenant({ name: "Ana" });
    const txn = await atPhotoshoot(token, { tenantId: tenant.id });
    const res = await advance(token, txn.id);
    expect(res.status).toBe(409);
    expect(res.body.error).toBe("Upload the Letter of Intent before Contract Signing");
  });

  it("advances once both the tenant and the Letter of Intent are in place", async () => {
    const { token } = await makeOfficer();
    const tenant = await factory.tenant({ name: "Ana" });
    const txn = await atPhotoshoot(token, { tenantId: tenant.id });
    await putLoi(txn.id);

    const res = await advance(token, txn.id);
    expect(res.status).toBe(200);
    expect(res.body.stage).toBe("CONTRACT_SIGNING");
    expect(res.body.status).toBe("Pending");
    expect(res.body.finalStatus).toBe("Pending"); // terminal stage writes finalStatus
    expect(res.body.stageData.PHOTOSHOOT.completedAt).toBeTruthy();
  });

  it("refuses to advance past Contract Signing", async () => {
    const { token } = await makeOfficer();
    const tenant = await factory.tenant({ name: "Ana" });
    const txn = await atPhotoshoot(token, { tenantId: tenant.id });
    await putLoi(txn.id);
    await advance(token, txn.id);

    const res = await advance(token, txn.id);
    expect(res.status).toBe(409);
    expect(res.body.error).toBe("The transaction is already at the final stage");
  });

  // The gate is on leaving Photoshoot only — earlier stages are untouched.
  it("does not gate any other stage transition", async () => {
    const { token } = await makeOfficer();
    const res0 = await request(app).post("/api/leasing-transactions")
      .set("Authorization", `Bearer ${token}`)
      .send({ lesseeName: "Ana Reyes", startStage: "KEY_TURNOVER" });
    const res = await advance(token, res0.body.id);
    expect(res.status).toBe(200);
    expect(res.body.stage).toBe("PHOTOSHOOT");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd server && npx vitest run tests/contractSigning.test.js -t "Entering Contract Signing"
```

Expected: FAIL. The first two get `200` instead of `409` — `advance` currently has no preconditions at all.

- [ ] **Step 3: Add the precondition to `advance`**

In `server/src/services/leasingTransactionService.js`, in `advance`, insert after `const next = nextStageKey(txn.stage);` and its `if (!next)` guard:

```js
  // Contract Signing is only reachable once there is someone to sign with and a
  // Letter of Intent on file. Both documents change hands outside the system,
  // so this is the only point at which the system can insist they exist.
  if (txn.stage === "PHOTOSHOOT") {
    if (!txn.tenantId) {
      throw new ConflictError("Link a prospect tenant before Contract Signing");
    }
    const loi = await prisma.transactionDocument.findFirst({
      where: { transactionId: id, docType: "LETTER_OF_INTENT" },
      select: { id: true },
    });
    if (!loi) {
      throw new ConflictError("Upload the Letter of Intent before Contract Signing");
    }
  }
```

`ConflictError` is already imported in this file.

- [ ] **Step 4: Run the tests to verify they pass**

```bash
cd server && npx vitest run tests/contractSigning.test.js
```

Expected: PASS, 8 tests.

- [ ] **Step 5: Run the full server suite**

```bash
cd server && npm test
```

Expected: PASS. Existing tests that advance out of `PHOTOSHOOT` will now fail — that is the intended new rule. Give those transactions a tenant and an LOI rather than weakening the guard.

- [ ] **Step 6: Commit**

```bash
git add server/src/services/leasingTransactionService.js server/tests/contractSigning.test.js
git commit -m "feat(leasing): gate Contract Signing on a prospect tenant and an LOI

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: Uploads drive the pipeline

The LOI upload advances the stage; the signed contract closes it. Both delegate to the existing `advance` and `setStatus` so the event log, `stageData` and `finalStatus` stay consistent with every other transition rather than being written twice in two shapes.

**Files:**
- Modify: `server/src/services/leasingTransactionService.js` (`addDocument`, around line 277)
- Modify: `server/src/controllers/leasingTransactionController.js` (`uploadDocument`, line 49)
- Test: `server/tests/contractSigning.test.js`

**Interfaces:**
- Consumes: `TRANSACTION_DOCUMENT_KEYS` from Task 2; `advance` and `setStatus` from Task 4's module.
- Produces: `addDocument(actor, id, file, docType = null)` — fourth parameter added, defaulting to `null` so existing callers are unaffected. Returns the document row including `docType`.

- [ ] **Step 1: Write the failing tests**

Append to `server/tests/contractSigning.test.js`:

```js
describe("Documents driving the pipeline", () => {
  const pdf = Buffer.from("%PDF-1.4 test");
  const upload = (token, txnId, docType) => {
    const req = request(app).post(`/api/leasing-transactions/${txnId}/documents`)
      .set("Authorization", `Bearer ${token}`)
      .attach("file", pdf, { filename: "doc.pdf", contentType: "application/pdf" });
    return docType ? req.field("docType", docType) : req;
  };

  it("advances to Contract Signing the moment the LOI lands", async () => {
    const { token } = await makeOfficer();
    const tenant = await factory.tenant({ name: "Ana" });
    const txn = await atPhotoshoot(token, { tenantId: tenant.id });

    const res = await upload(token, txn.id, "LETTER_OF_INTENT");
    expect(res.status).toBe(201);
    expect(res.body.docType).toBe("LETTER_OF_INTENT");

    const after = await prisma.leasingTransaction.findUnique({ where: { id: txn.id } });
    expect(after.stage).toBe("CONTRACT_SIGNING");
  });

  // The shoot may not even have happened yet — this upload must not imply it has.
  it("stores the LOI without moving anything when no tenant is linked", async () => {
    const { token } = await makeOfficer();
    const txn = await atPhotoshoot(token);

    const res = await upload(token, txn.id, "LETTER_OF_INTENT");
    expect(res.status).toBe(201);

    const after = await prisma.leasingTransaction.findUnique({ where: { id: txn.id } });
    expect(after.stage).toBe("PHOTOSHOOT");
    expect(after.status).toBe("Pending"); // untouched
  });

  it("closes the transaction when the signed contract is uploaded", async () => {
    const { token } = await makeOfficer();
    const tenant = await factory.tenant({ name: "Ana" });
    const txn = await atPhotoshoot(token, { tenantId: tenant.id });
    await upload(token, txn.id, "LETTER_OF_INTENT");

    const res = await upload(token, txn.id, "SIGNED_CONTRACT");
    expect(res.status).toBe(201);

    const after = await prisma.leasingTransaction.findUnique({ where: { id: txn.id } });
    expect(after.stage).toBe("CONTRACT_SIGNING");
    expect(after.status).toBe("Signed");
    expect(after.finalStatus).toBe("Signed");
  });

  it("replaces a typed document rather than stacking it", async () => {
    const { token } = await makeOfficer();
    const txn = await atPhotoshoot(token);
    await upload(token, txn.id, "LETTER_OF_INTENT");
    await upload(token, txn.id, "LETTER_OF_INTENT");

    const rows = await prisma.transactionDocument.findMany({
      where: { transactionId: txn.id, docType: "LETTER_OF_INTENT" },
    });
    expect(rows).toHaveLength(1);
  });

  it("still stacks loose attachments", async () => {
    const { token } = await makeOfficer();
    const txn = await atPhotoshoot(token);
    await upload(token, txn.id);
    await upload(token, txn.id);

    const rows = await prisma.transactionDocument.findMany({
      where: { transactionId: txn.id, docType: null },
    });
    expect(rows).toHaveLength(2);
  });

  it("rejects a document type that is not on the registry", async () => {
    const { token } = await makeOfficer();
    const txn = await atPhotoshoot(token);
    const res = await upload(token, txn.id, "NOT_A_TYPE");
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Unknown document type");
  });

  it("lets the linked lessee download the signed contract", async () => {
    const { token } = await makeOfficer();
    const tenant = await factory.tenant({ name: "Ana" });
    const txn = await atPhotoshoot(token, { tenantId: tenant.id });
    await upload(token, txn.id, "LETTER_OF_INTENT");
    const up = await upload(token, txn.id, "SIGNED_CONTRACT");

    const res = await request(app)
      .get(`/api/leasing-transactions/${txn.id}/documents/${up.body.id}/download`)
      .set("Authorization", `Bearer ${tokens.tenant(tenant.id)}`);
    expect(res.status).toBe(200);
  });

  it("does not let an unlinked lessee download it", async () => {
    const { token } = await makeOfficer();
    const tenant = await factory.tenant({ name: "Ana" });
    const other = await factory.tenant({ name: "Ben" });
    const txn = await atPhotoshoot(token, { tenantId: tenant.id });
    await upload(token, txn.id, "LETTER_OF_INTENT");
    const up = await upload(token, txn.id, "SIGNED_CONTRACT");

    const res = await request(app)
      .get(`/api/leasing-transactions/${txn.id}/documents/${up.body.id}/download`)
      .set("Authorization", `Bearer ${tokens.tenant(other.id)}`);
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd server && npx vitest run tests/contractSigning.test.js -t "Documents driving"
```

Expected: FAIL. `docType` comes back `undefined` and the stage never moves — `addDocument` ignores the field entirely.

- [ ] **Step 3: Teach `addDocument` about typed documents**

In `server/src/services/leasingTransactionService.js`, add the import at the top of the file alongside the other shared imports:

```js
import { TRANSACTION_DOCUMENT_KEYS, labelForDocType } from "../../../shared/transactionDocuments.js";
```

Replace the whole `addDocument` function:

```js
const DOC_SELECT = {
  id: true, filename: true, mimeType: true, size: true, stage: true,
  docType: true, uploadedByName: true, createdAt: true,
};

export async function addDocument(actor, id, file, docType = null) {
  const txn = await assertCanAccess(actor, id);
  if (docType && !TRANSACTION_DOCUMENT_KEYS.includes(docType)) {
    throw new InvalidReferenceError("Unknown document type");
  }
  let uploadedByName = null;
  if (actor?.userId) {
    const u = await prisma.user.findUnique({ where: { id: actor.userId }, select: { name: true, email: true } });
    uploadedByName = u?.name || u?.email || null;
  }
  const fields = {
    filename: file.originalname,
    mimeType: file.mimetype,
    size: file.size,
    data: file.buffer,
    stage: txn.stage,
    uploadedById: actor?.userId || null,
    uploadedByName,
  };

  // A named slot holds one document — re-uploading replaces it, the same way the
  // lessor and lessee requirement checklists behave. Loose attachments stack.
  const doc = docType
    ? await prisma.transactionDocument.upsert({
        where: { transactionId_docType: { transactionId: id, docType } },
        update: { ...fields, createdAt: new Date() },
        create: { transactionId: id, docType, ...fields },
        select: DOC_SELECT,
      })
    : await prisma.transactionDocument.create({
        data: { transactionId: id, ...fields },
        select: DOC_SELECT,
      });

  await logEvent(id, actor, `Uploaded ${docType ? labelForDocType(docType) : `document "${file.originalname}"`}`, txn.stage);

  // The upload is the action. Delegating to advance/setStatus rather than
  // writing the stage here keeps stageData, finalStatus and the event log in
  // exactly one shape.
  if (docType === "LETTER_OF_INTENT" && txn.stage === "PHOTOSHOOT" && txn.tenantId) {
    await advance(actor, id);
  } else if (docType === "SIGNED_CONTRACT" && txn.stage === "CONTRACT_SIGNING") {
    await setStatus(actor, id, { status: "Signed" });
  }
  return doc;
}
```

`InvalidReferenceError` is already imported in this file. `advance` and `setStatus` are defined above `addDocument` in the same module.

- [ ] **Step 4: Pass `docType` through the controller**

In `server/src/controllers/leasingTransactionController.js`, replace `uploadDocument`:

```js
export async function uploadDocument(req, res, next) {
  try {
    if (!req.file) throw new InvalidReferenceError("A file is required");
    const docType = req.body?.docType || null;
    res.status(201).json(await service.addDocument(req.user, req.params.id, req.file, docType));
  } catch (e) { next(e); }
}
```

- [ ] **Step 5: Run the tests to verify they pass**

```bash
cd server && npx vitest run tests/contractSigning.test.js
```

Expected: PASS, 16 tests.

- [ ] **Step 6: Commit**

```bash
git add server/src/services/leasingTransactionService.js server/src/controllers/leasingTransactionController.js server/tests/contractSigning.test.js
git commit -m "feat(leasing): LOI upload advances to signing, contract upload closes it

Both delegate to advance/setStatus so stageData, finalStatus and the
event log keep exactly one shape.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: The `Awaiting Prospect` resting state

Distinguishes "unit is live and being marketed" from "shoot just finished". Set in one place, cleared in one.

**Files:**
- Modify: `server/src/services/appointmentService.js` (`complete`, around line 89)
- Modify: `server/src/services/leasingTransactionService.js` (`linkRecords`, around line 224)
- Test: `server/tests/contractSigning.test.js`

**Interfaces:**
- Consumes: the `Awaiting Prospect` status added to `PHOTOSHOOT` in Task 1.
- Produces: no signature changes. `complete` and `linkRecords` keep their existing shapes.

- [ ] **Step 1: Write the failing tests**

Append to `server/tests/contractSigning.test.js`:

```js
describe("Awaiting Prospect", () => {
  async function shotWithNoTenant(token) {
    const txn = await atPhotoshoot(token);
    const appt = await request(app)
      .post(`/api/appointments/transaction/${txn.id}/PHOTOSHOOT`)
      .set("Authorization", `Bearer ${token}`)
      .send({ scheduledAt: new Date().toISOString(), location: "Ibiza Tower" });
    await request(app).patch(`/api/appointments/${appt.body.id}/complete`)
      .set("Authorization", `Bearer ${token}`).send({});
    return txn;
  }

  it("rests at Awaiting Prospect when the shoot finishes with nobody in view", async () => {
    const { token } = await makeOfficer();
    const txn = await shotWithNoTenant(token);
    const after = await prisma.leasingTransaction.findUnique({ where: { id: txn.id } });
    expect(after.status).toBe("Awaiting Prospect");
  });

  // The shoot did complete — only the stage's resting status differs.
  it("still records the appointment itself as Completed", async () => {
    const { token } = await makeOfficer();
    const txn = await shotWithNoTenant(token);
    const appt = await prisma.appointment.findFirst({ where: { transactionId: txn.id } });
    expect(appt.status).toBe("Completed");
    expect(appt.outcome).toBe("Completed");
  });

  it("rests at Completed when a tenant is already linked", async () => {
    const { token } = await makeOfficer();
    const tenant = await factory.tenant({ name: "Ana" });
    const txn = await atPhotoshoot(token, { tenantId: tenant.id });
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
    const { token } = await makeOfficer();
    const txn = await shotWithNoTenant(token);
    const tenant = await factory.tenant({ name: "Ana" });

    const res = await request(app).patch(`/api/leasing-transactions/${txn.id}/link`)
      .set("Authorization", `Bearer ${token}`).send({ tenantId: tenant.id });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("Completed");
    expect(res.body.stageData.PHOTOSHOOT.status).toBe("Completed");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd server && npx vitest run tests/contractSigning.test.js -t "Awaiting Prospect"
```

Expected: FAIL — the first test gets `"Completed"`, because nothing sets `Awaiting Prospect` yet.

- [ ] **Step 3: Rest Photoshoot at `Awaiting Prospect` when there is no tenant**

In `server/src/services/appointmentService.js`, in `complete`, replace the two lines from `const updated = ...` through the `syncStageStatus` call:

```js
  const updated = await prisma.appointment.update({ where: { id }, data: { status: "Completed", outcome } });
  // The shoot itself completed — but with nobody in view the stage rests at
  // Awaiting Prospect, so the board tells "live and being marketed" apart from
  // "just shot".
  const stageStatus = appt.stage === "PHOTOSHOOT" && outcome === "Completed" && !txn.tenantId
    ? "Awaiting Prospect"
    : outcome;
  await syncStageStatus(txn, appt.stage, stageStatus);
```

- [ ] **Step 4: Clear it when a tenant is linked**

In `server/src/services/leasingTransactionService.js`, in `linkRecords`, change the first line to capture the transaction:

```js
  const txn = await loadOrThrow(id);
```

Then, immediately before the `await prisma.leasingTransaction.update({ where: { id }, data });` call, add:

```js
  // A prospect has appeared, so the shoot is simply done again and the
  // transaction is ready for its Letter of Intent.
  if (data.tenantId && txn.stage === "PHOTOSHOOT" && txn.status === "Awaiting Prospect") {
    data.status = "Completed";
    data.stageData = {
      ...(txn.stageData || {}),
      PHOTOSHOOT: { ...(txn.stageData?.PHOTOSHOOT || {}), status: "Completed" },
    };
  }
```

- [ ] **Step 5: Run the tests to verify they pass**

```bash
cd server && npx vitest run tests/contractSigning.test.js
```

Expected: PASS, 20 tests.

- [ ] **Step 6: Run the full server suite**

```bash
cd server && npm test
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add server/src/services/appointmentService.js server/src/services/leasingTransactionService.js server/tests/contractSigning.test.js
git commit -m "feat(leasing): rest Photoshoot at Awaiting Prospect until a tenant appears

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 7: Upload a document under a named slot

**Files:**
- Modify: `client/src/lib/resource.js` (`uploadDocument`, line 53)
- Modify: `client/src/components/TransactionDocuments.vue`
- Test: `client/tests/TransactionDocuments.test.js` (create)

**Interfaces:**
- Consumes: `TRANSACTION_DOCUMENT_TYPES` from Task 2; the `docType` field on documents from Task 5.
- Produces: `leasingTransactions.uploadDocument(id, file, docType = null)` — third parameter added, defaulting to `null`.

- [ ] **Step 1: Write the failing test**

Create `client/tests/TransactionDocuments.test.js`:

```js
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";

// The two named slots read from the shared registry, above the loose
// attachments. Uploading into a slot replaces what is there.
vi.mock("../src/lib/resource.js", () => ({
  leasingTransactions: {
    uploadDocument: vi.fn(() => Promise.resolve({})),
    deleteDocument: vi.fn(() => Promise.resolve({})),
    downloadDocument: vi.fn(),
  },
}));

import TransactionDocuments from "../src/components/TransactionDocuments.vue";
import { leasingTransactions } from "../src/lib/resource.js";

const DOCS = [
  { id: "d1", filename: "loi.pdf", size: 2048, docType: "LETTER_OF_INTENT", uploadedByName: "Officer O", createdAt: "2026-09-01T00:00:00Z" },
  { id: "d2", filename: "extra.pdf", size: 1024, docType: null, uploadedByName: "Officer O", createdAt: "2026-09-02T00:00:00Z" },
];

const mountDocs = (documents = DOCS) =>
  mount(TransactionDocuments, {
    props: { transactionId: "t1", documents, canUpload: true, canManage: true },
  });

const slot = (w, label) => w.findAll(".slot").find((s) => s.text().includes(label));

describe("TransactionDocuments", () => {
  beforeEach(() => { leasingTransactions.uploadDocument.mockClear(); });

  it("shows a named slot for each registry type", () => {
    const w = mountDocs();
    expect(w.findAll(".slot")).toHaveLength(2);
    expect(w.text()).toContain("Letter of Intent");
    expect(w.text()).toContain("Signed Lease Contract");
  });

  it("puts a typed document in its own slot, not the loose list", () => {
    const w = mountDocs();
    expect(slot(w, "Letter of Intent").text()).toContain("loi.pdf");
    expect(w.find(".list").text()).toContain("extra.pdf");
    expect(w.find(".list").text()).not.toContain("loi.pdf");
  });

  it("says plainly when a slot is still empty", () => {
    const w = mountDocs();
    expect(slot(w, "Signed Lease Contract").text()).toContain("Not uploaded yet");
  });

  it("uploads into the slot it belongs to", async () => {
    const w = mountDocs();
    const input = slot(w, "Signed Lease Contract").find("input[type='file']");
    const file = new File(["x"], "contract.pdf", { type: "application/pdf" });
    Object.defineProperty(input.element, "files", { value: [file] });
    await input.trigger("change");
    await flushPromises();
    expect(leasingTransactions.uploadDocument).toHaveBeenCalledWith("t1", file, "SIGNED_CONTRACT");
  });

  it("uploads a loose attachment with no type", async () => {
    const w = mountDocs();
    const input = w.find(".upload input[type='file']");
    const file = new File(["x"], "notes.pdf", { type: "application/pdf" });
    Object.defineProperty(input.element, "files", { value: [file] });
    await input.trigger("change");
    await flushPromises();
    expect(leasingTransactions.uploadDocument).toHaveBeenCalledWith("t1", file, null);
  });

  it("surfaces a rejected upload rather than failing quietly", async () => {
    leasingTransactions.uploadDocument.mockRejectedValue({ response: { data: { error: "Unknown document type" } } });
    const w = mountDocs();
    const input = slot(w, "Signed Lease Contract").find("input[type='file']");
    Object.defineProperty(input.element, "files", { value: [new File(["x"], "c.pdf")] });
    await input.trigger("change");
    await flushPromises();
    expect(w.find(".error").text()).toContain("Unknown document type");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd client && npx vitest run tests/TransactionDocuments.test.js
```

Expected: FAIL — no `.slot` elements exist; the component renders one flat list.

- [ ] **Step 3: Add the third parameter to the resource helper**

In `client/src/lib/resource.js`, replace `uploadDocument`:

```js
  uploadDocument: (id, file, docType = null) => {
    const form = new FormData();
    form.append("file", file);
    if (docType) form.append("docType", docType);
    return api.post(`/leasing-transactions/${id}/documents`, form).then((r) => r.data);
  },
```

- [ ] **Step 4: Render the named slots**

In `client/src/components/TransactionDocuments.vue`, change the existing Vue import from `import { ref } from "vue";` to:

```js
import { ref, computed } from "vue";
```

Then add one new import directly below the existing `import { leasingTransactions } from "../lib/resource.js";` line:

```js
import { TRANSACTION_DOCUMENT_TYPES } from "../../../shared/transactionDocuments.js";
```

Then add, after the `fileInput` ref:

```js
// The named slots come from the shared registry; anything untyped stays in the
// loose list below them.
const slots = computed(() =>
  TRANSACTION_DOCUMENT_TYPES.map((t) => ({
    ...t,
    doc: props.documents.find((d) => d.docType === t.key) || null,
  })),
);
const loose = computed(() => props.documents.filter((d) => !d.docType));
```

Replace `onFile` with a version that carries the type, and keep a bare wrapper for the loose input:

```js
async function onFile(e, docType = null) {
  const file = e.target.files?.[0];
  if (!file) return;
  uploading.value = true; error.value = "";
  try {
    await leasingTransactions.uploadDocument(props.transactionId, file, docType);
    emit("changed");
  } catch (err) {
    error.value = err.response?.data?.error || "Upload failed (PDF, JPG, PNG or DOCX up to 10 MB).";
  } finally {
    uploading.value = false;
    e.target.value = "";
  }
}
```

In the template, replace `<ul v-if="documents.length" class="list">` … `</ul>` and the `<p v-else class="empty">` line with the slots block followed by the loose list:

```html
    <ul class="slots">
      <li v-for="s in slots" :key="s.key" class="slot">
        <div class="slot__head">{{ s.label }}</div>
        <div v-if="s.doc" class="slot__body">
          <button type="button" class="doc__name" @click="download(s.doc)">{{ s.doc.filename }}</button>
          <div class="doc__meta">{{ fmtSize(s.doc.size) }} · {{ s.doc.uploadedByName || "—" }} · {{ fmtDate(s.doc.createdAt) }}</div>
        </div>
        <p v-else class="slot__empty">Not uploaded yet.</p>
        <label v-if="canUpload" class="slot__upload">
          <span>{{ s.doc ? "Replace" : "Upload" }}</span>
          <input type="file" accept=".pdf,.jpg,.jpeg,.png,.docx" :disabled="uploading" @change="(e) => onFile(e, s.key)" />
        </label>
      </li>
    </ul>

    <div class="loose__head">Other attachments</div>
    <ul v-if="loose.length" class="list">
      <li v-for="d in loose" :key="d.id" class="doc">
        <span class="doc__icon" aria-hidden="true">📄</span>
        <div class="doc__body">
          <button type="button" class="doc__name" @click="download(d)">{{ d.filename }}</button>
          <div class="doc__meta">{{ fmtSize(d.size) }} · {{ d.uploadedByName || "—" }} · {{ fmtDate(d.createdAt) }}</div>
        </div>
        <button type="button" class="doc__dl" title="Download" @click="download(d)">↓</button>
        <button v-if="canManage" type="button" class="doc__del" title="Remove" @click="remove(d)">✕</button>
      </li>
    </ul>
    <p v-else class="empty">No other attachments.</p>
```

And change the loose upload input to pass no type:

```html
      <input ref="fileInput" type="file" accept=".pdf,.jpg,.jpeg,.png,.docx" @change="(e) => onFile(e, null)" :disabled="uploading" />
```

Add to the `<style scoped>` block:

```css
.slots { list-style: none; margin: 0 0 1rem; padding: 0; display: grid; gap: 0.5rem; }
.slot { display: grid; gap: 0.3rem; padding: 0.6rem 0.7rem; border: 1px solid var(--line); border-radius: var(--radius-sm); background: var(--paper); }
.slot__head { font-size: 0.72rem; font-weight: 700; letter-spacing: 0.07em; text-transform: uppercase; color: var(--muted); }
.slot__empty { margin: 0; font-size: 0.85rem; color: var(--faint); }
.slot__upload { display: inline-flex; align-items: center; gap: 0.45rem; font-size: 0.8rem; color: var(--muted); }
.slot__upload input { font: inherit; font-size: 0.78rem; }
.loose__head { font-size: 0.72rem; font-weight: 700; letter-spacing: 0.07em; text-transform: uppercase; color: var(--muted); margin-bottom: 0.4rem; }
```

- [ ] **Step 5: Run the test to verify it passes**

```bash
cd client && npx vitest run tests/TransactionDocuments.test.js
```

Expected: PASS, 6 tests.

- [ ] **Step 6: Build, because tests do not parse scoped CSS**

A dangling brace in a `<style scoped>` block passes every test in this repo and only fails the build.

```bash
cd client && npm run build
```

Expected: build succeeds.

- [ ] **Step 7: Commit**

```bash
git add client/src/lib/resource.js client/src/components/TransactionDocuments.vue client/tests/TransactionDocuments.test.js
git commit -m "feat(ui): named slots for the Letter of Intent and signed contract

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 8: Say what is blocking the advance

The officer should not have to click Advance to discover a 409.

**Files:**
- Modify: `client/src/views/TransactionDetailView.vue`
- Test: `client/tests/DeliveryTracker.test.js` (fix the 6-stage assertion)
- Test: `client/tests/TransactionDetailView.test.js`

**Interfaces:**
- Consumes: `txn.stage`, `txn.tenantId` and `txn.documents[].docType` from the transaction payload.
- Produces: nothing consumed downstream.

- [ ] **Step 1: Fix the tracker test, which still expects six stages**

The component itself needs no change — it is already derived from `LEASING_STAGES.length`. Its test hardcodes six.

```bash
cd client && npx vitest run tests/DeliveryTracker.test.js
```

Expected before the fix: FAIL, with `.ms` length `7` received against `6` expected.

Make these three edits in `client/tests/DeliveryTracker.test.js`:

1. Line 6, rename the case and update its count on line 9:

```js
  it("renders a hero with the tracking number and 7 milestones", () => {
    const w = mount(DeliveryTracker, { props: { reference: "RBU-2026-000001", currentStage: "APPROVAL", status: "Under Review" } });
    expect(w.find(".hero__ref").text()).toBe("RBU-2026-000001");
    expect(w.findAll(".ms")).toHaveLength(7);
```

2. Around line 16, the "delivered" case now means the contract is signed, not the shoot done — Photoshoot is no longer terminal:

```js
  it("shows a delivered state when the contract is Signed", () => {
    const w = mount(DeliveryTracker, { props: { reference: "RBU-2026-000002", currentStage: "CONTRACT_SIGNING", status: "Signed", finalStatus: "Signed" } });
```

and its `expect(w.findAll(".bar__seg.on")).toHaveLength(6);` becomes `toHaveLength(7);`.

3. Around line 26, the remaining `expect(w.findAll(".ms")).toHaveLength(6);` becomes `toHaveLength(7);`.

Re-run the file. If the `.bar__seg.on` count comes back as something other than 7, take the number the component actually produces — the tracker is correct and derived; only the test was pinned to six.

- [ ] **Step 2: Write the failing test for the blocker hint**

That file already defines a module-level `baseTxn`, mocks `leasingTransactions.get` to resolve it, and has a no-argument `mountView()` helper. Add an overriding helper directly beneath `mountView`, so each case can vary the transaction:

```js
// mountView() always serves baseTxn; these cases need to vary it.
async function mountWith(over) {
  leasingTransactions.get.mockResolvedValue({ ...baseTxn, ...over });
  return mountView();
}
```

Then append the four cases below, inside the existing top-level `describe` so they inherit that file's mocks and `beforeEach`. Note `documents` is not on `baseTxn` today, so every case passes it explicitly:

```js
  // Reaching Contract Signing needs a prospect and an LOI. Say which is missing
  // rather than letting the officer click Advance into a 409.
  it("names what is blocking the advance out of Photoshoot", async () => {
    const w = await mountWith({ stage: "PHOTOSHOOT", status: "Awaiting Prospect", tenantId: null, documents: [] });
    expect(w.find(".blockers").text()).toContain("Link a prospect tenant");
    expect(w.find(".blockers").text()).toContain("Upload the Letter of Intent");
  });

  it("drops a blocker once it is satisfied", async () => {
    const w = await mountWith({ stage: "PHOTOSHOOT", status: "Completed", tenantId: "t1", documents: [] });
    expect(w.find(".blockers").text()).not.toContain("Link a prospect tenant");
    expect(w.find(".blockers").text()).toContain("Upload the Letter of Intent");
  });

  it("shows no blockers once both are in place", async () => {
    const w = await mountWith({
      stage: "PHOTOSHOOT", status: "Completed", tenantId: "t1",
      documents: [{ id: "d1", filename: "loi.pdf", size: 10, docType: "LETTER_OF_INTENT" }],
    });
    expect(w.find(".blockers").exists()).toBe(false);
  });

  it("shows no blockers at any other stage", async () => {
    const w = await mountWith({ stage: "APPROVAL", status: "Submitted", tenantId: null, documents: [] });
    expect(w.find(".blockers").exists()).toBe(false);
  });
```

- [ ] **Step 3: Run the test to verify it fails**

```bash
cd client && npx vitest run tests/TransactionDetailView.test.js
```

Expected: FAIL — `.blockers` does not exist.

- [ ] **Step 4: Add the blocker list**

In `client/src/views/TransactionDetailView.vue`, add to `<script setup>`:

```js
// The two things Contract Signing needs. Mirrors the server's guard in
// leasingTransactionService.advance — if one changes, change both.
const blockers = computed(() => {
  if (txn.value?.stage !== "PHOTOSHOOT") return [];
  const out = [];
  if (!txn.value.tenantId) out.push("Link a prospect tenant");
  if (!(txn.value.documents || []).some((d) => d.docType === "LETTER_OF_INTENT")) {
    out.push("Upload the Letter of Intent");
  }
  return out;
});
```

Ensure `computed` is in the file's `vue` import.

In the template, immediately above the Advance control:

```html
        <ul v-if="blockers.length" class="blockers">
          <li v-for="b in blockers" :key="b">{{ b }}</li>
        </ul>
```

And in `<style scoped>`:

```css
.blockers { list-style: none; margin: 0 0 0.6rem; padding: 0.55rem 0.7rem; display: grid; gap: 0.25rem; border: 1px solid var(--warning, var(--line-strong)); border-radius: var(--radius-sm); background: var(--surface); font-size: 0.83rem; color: var(--muted); }
.blockers li::before { content: "→ "; color: var(--faint); }
```

- [ ] **Step 5: Run the client suite**

```bash
cd client && npm test
```

Expected: PASS.

- [ ] **Step 6: Build**

```bash
cd client && npm run build
```

Expected: build succeeds.

- [ ] **Step 7: Commit**

```bash
git add client/src/views/TransactionDetailView.vue client/tests/TransactionDetailView.test.js client/tests/DeliveryTracker.test.js
git commit -m "feat(ui): name what blocks the advance into Contract Signing

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 9: Full verification

**Files:** none modified.

- [ ] **Step 1: Run both suites**

```bash
cd server && npm test
```

```bash
cd client && npm test
```

Expected: PASS, both. Report the actual counts.

- [ ] **Step 2: Build the client**

```bash
cd client && npm run build
```

- [ ] **Step 3: Restart the API and walk the flow by hand**

The API has no watch mode, so it is still running the pre-change code.

Restart it, then in the UI: open a transaction at Photoshoot with no tenant, confirm both blockers show; link a tenant, confirm one blocker clears; upload a Letter of Intent, confirm the tracker moves to Contract Signing; upload a signed contract, confirm the stage reads Signed and the tracker shows seven steps.

- [ ] **Step 4: Confirm the deployment note is carried forward**

Two manual migrations are now pending on the office server:

```
server/prisma/manual-migrations/2026-09-07-lessee-requirements.sql
server/prisma/manual-migrations/2026-09-07-transaction-document-types.sql
```

Neither fails at startup. Both fail at first use with a 500.

---

## Notes for the implementer

**Starting a transaction directly at `CONTRACT_SIGNING` is still possible** and is left that way on purpose. `createTransaction` accepts any `startStage` in `STAGE_KEYS` and marks earlier stages `Skipped` — staff can already start at `PHOTOSHOOT` and skip everything before it. Adding a seventh key extends that existing discretion rather than opening a new hole. Do not add a guard for it in this plan.

**Two decisions in the spec were assumptions, not stated rules.** Both are recorded in its Open Items section. If the answer changes before this ships:
- *Document visibility* — typed documents inherit `assertCanAccess`, so the linked lessor and lessee can both download the LOI and the signed contract. Making either staff-only is one condition in `getDocumentForDownload`, and Task 5's last two tests are where it would be pinned.
- *Existing Photoshoot transactions* — left untouched, no backfill. They simply stop being the end of the line.
