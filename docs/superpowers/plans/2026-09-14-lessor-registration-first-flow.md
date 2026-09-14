# Registration-First Lessor Application Flow — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the lessor entry point into register-unit-then-sign-up, with a single officer decision (Approve / For Revision / Reject) that a non-approved applicant can see and act on from a restricted status page.

**Architecture:** The unit is collected first on a new public wizard and carried in client state until one `POST /auth/signup` submits it with the account, reusing the existing `pendingUnit` column. Non-approved accounts receive a restricted JWT that `verifyJwt` refuses by default — only the application-status routes opt in via `verifyJwtAllowPending`. Approval materialises the unit as `APPROVED`, which opens the onboarding transaction and makes the requirements step live.

**Tech Stack:** Express 5 · Prisma 6 (PostgreSQL) · zod · Vue 3 (`<script setup>`) · vue-router · Pinia · Vitest + @vue/test-utils + happy-dom

**Spec:** `docs/superpowers/specs/2026-09-14-lessor-registration-first-onboarding-design.md`

**Scope note:** This is Plan A of two. Plan B covers the rest of the spec and ships after this: splitting the seven lessor documents into four per-unit and three per-owner, the two partial unique indexes and back-fill migration that needs, the `publish()` and `lessorAcceptanceGuard` changes that follow from it, the requirements UI split, and the `For Resubmission` → `For Revision` rename in `shared/lessorRequirements.js`. Nothing in Plan A depends on Plan B.

**House test conventions** — every new server test file follows the existing shape, which is not the default Vitest one:

```js
import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";   // named export, and it is a factory
import { resetCrudTables } from "./helpers.js";
import { prisma } from "../src/lib/prisma.js"; // named export, NOT default
import { hashPassword } from "../src/services/authService.js";

const app = createApp();
beforeEach(async () => { await resetCrudTables(); });
```

## Global Constraints

- Server commands run from `server/`, client commands from `client/`. Test: `npm test`. Single file: `npx vitest run tests/<file> --reporter=verbose`.
- **Never `git add -A`, `git add .`, or `git add <directory>`.** Stage only the exact files each step names.
- **Never run `prisma migrate`.** The committed Prisma history has drifted from the deployed databases. Schema changes are additive, idempotent SQL in `server/prisma/manual-migrations/`, applied by hand.
- Migrations must be applied to **both** `rbu_leasing` (from `server/.env`) and `rbu_leasing_test` (from `server/.env.test`), or the server tests fail against a database without the column.
- **psql is v18 here, and the Prisma URL must have `?schema=public` stripped** or psql refuses it with `invalid URI query parameter: "schema"`. The working loop, run from `server/`:
  ```bash
  PSQL="/c/Program Files/PostgreSQL/18/bin/psql.exe"
  for F in .env .env.test; do
    URL=$(grep -m1 '^DATABASE_URL=' "$F" | sed 's/^DATABASE_URL=//; s/^"//; s/"$//; s/?schema=public$//')
    "$PSQL" "$URL" -v ON_ERROR_STOP=1 -f prisma/manual-migrations/<file>.sql
  done
  ```
- Never print a database password into output. Read connection strings from the env files, never echo them.
- **The `rbuleasing.exe` Windows service locks the generated Prisma client.** If `npx prisma generate` fails with `EPERM`, stop and report BLOCKED — stopping that service needs UAC elevation.
- The status vocabulary shown to users is exactly **Pending Review · Approved · For Revision · Rejected**. `PENDING` keeps its database name and is displayed as "Pending Review".
- The `pendingUnit` whitelist is exactly: `estateId`, `towerId`, `unitNumber`, `floor`, `slotNo`, `type`, `baseRent`. `unitNumber` is the only required one. It applies to resubmission as well as signup.

---

### Task 1: Account decision states — `FOR_REVISION`, and rejection that keeps the row

**Files:**
- Create: `server/prisma/manual-migrations/2026-09-14-account-for-revision.sql`
- Modify: `server/prisma/schema.prisma` (the `AccountStatus` enum)
- Modify: `server/src/validation/user.js`
- Modify: `server/src/services/authService.js` (`rejectAccount`, new `reviseAccount`)
- Modify: `server/src/controllers/authController.js`
- Modify: `server/src/routes/authRoutes.js`
- Test: `server/tests/accountApproval.test.js`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `reviseAccount(id, approver, remarks)` → `{ id, name, email, status: "FOR_REVISION", remarks }`; `rejectAccount(id, approver, reason)` → `{ id, name, email, status: "REJECTED", reason }` and **no longer deletes the row**. Route `PATCH /api/auth/pending/:id/revise`. Validation export `reviseAccountSchema`.

- [ ] **Step 1: Write the failing tests**

Add to `server/tests/accountApproval.test.js`, inside the existing `describe("Rejecting an account")` block's file scope:

```js
describe("For Revision", () => {
  it("keeps the row, records remarks, and leaves the unit unmaterialised", async () => {
    await signup();
    const u = await pendingUser();
    const res = await request(app).patch(`/api/auth/pending/${u.id}/revise`)
      .set("Authorization", `Bearer ${tokens.admin()}`)
      .send({ remarks: "Tower does not match the unit number" });
    expect(res.status).toBe(200);

    const after = await prisma.user.findUnique({ where: { id: u.id } });
    expect(after.status).toBe("FOR_REVISION");
    expect(after.rejectionReason).toBe("Tower does not match the unit number");
    expect(after.unitOwnerId).toBeNull();
    expect(await prisma.unit.count({ where: { unitNumber: "19A" } })).toBe(0);
  });

  it("refuses empty remarks", async () => {
    await signup();
    const u = await pendingUser();
    const res = await request(app).patch(`/api/auth/pending/${u.id}/revise`)
      .set("Authorization", `Bearer ${tokens.admin()}`).send({ remarks: "" });
    expect(res.status).toBe(400);
  });

  it("can still be approved after a revision round", async () => {
    await signup();
    const u = await pendingUser();
    await request(app).patch(`/api/auth/pending/${u.id}/revise`)
      .set("Authorization", `Bearer ${tokens.admin()}`).send({ remarks: "fix the floor" });
    const res = await request(app).patch(`/api/auth/pending/${u.id}/approve`)
      .set("Authorization", `Bearer ${tokens.admin()}`).send();
    expect(res.status).toBe(200);
  });
});
```

- [ ] **Step 2: Rewrite the three tests that assert deletion**

These assert the old behaviour and are now wrong. Replace them in place — do not delete them.

In `"creates no unit when the application is rejected"`, replace the final line:

```js
    // was: expect(await prisma.user.findUnique({ where: { id: user.id } })).toBeNull();
    const after = await prisma.user.findUnique({ where: { id: user.id } });
    expect(after.status).toBe("REJECTED");
    expect(after.unitOwnerId).toBeNull();
```

Replace the body of `"deletes the account and creates no linked record"`, renaming it:

```js
  it("keeps the account with a reason and creates no linked record", async () => {
    await signup();
    const u = await pendingUser();
    const res = await request(app).patch(`/api/auth/pending/${u.id}/reject`)
      .set("Authorization", `Bearer ${tokens.admin()}`)
      .send({ reason: "Could not verify identity" });
    expect(res.status).toBe(200);

    // The row survives so the applicant can be told why. Their username stays
    // taken — a genuine re-application needs an officer to reopen the account.
    const after = await pendingUser();
    expect(after.status).toBe("REJECTED");
    expect(after.rejectionReason).toBe("Could not verify identity");
    expect(await prisma.tenant.count()).toBe(0);
  });
```

Leave `"blocks login after rejection like any other unknown account"` failing for now — Task 2 owns login and rewrites it there.

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run tests/accountApproval.test.js --reporter=verbose`
Expected: FAIL — the revise route 404s, and `after.status` is `undefined` because rejection still deletes the row.

- [ ] **Step 4: Write the migration**

Create `server/prisma/manual-migrations/2026-09-14-account-for-revision.sql`:

```sql
-- A third decision on an application: neither accepted nor refused, but sent
-- back with remarks for the applicant to correct and resubmit. Additive and
-- idempotent, in line with the other manual migrations here — the committed
-- Prisma history has drifted on the deployed databases.
--
-- ALTER TYPE ... ADD VALUE cannot be used in the same transaction that then
-- reads the new value, so this runs on its own. IF NOT EXISTS makes a second
-- run a no-op.
ALTER TYPE "AccountStatus" ADD VALUE IF NOT EXISTS 'FOR_REVISION';
```

- [ ] **Step 5: Apply it to both databases**

Run from `server/`, using the loop in Global Constraints with `2026-09-14-account-for-revision.sql`.
Expected: `ALTER TYPE` printed twice. The command must not echo the URL — it holds the password.

- [ ] **Step 6: Update the schema and regenerate**

In `server/prisma/schema.prisma`, add the value to the enum:

```prisma
enum AccountStatus {
  PENDING
  FOR_REVISION
  APPROVED
  REJECTED
}
```

Then: `npx prisma generate`
Expected: `Generated Prisma Client`. If it fails with `EPERM`, stop and report BLOCKED.

- [ ] **Step 7: Add the validation schema**

In `server/src/validation/user.js`, beside `rejectAccountSchema`:

```js
export const reviseAccountSchema = z.object({
  // Required: "For Revision" with no explanation is the failure mode this
  // status exists to prevent — the applicant would not know what to change.
  remarks: z.string().min(1, "Remarks are required"),
});
```

- [ ] **Step 8: Implement the service functions**

In `server/src/services/authService.js`, replace the body of `rejectAccount` and add `reviseAccount` beside it:

```js
// A decision is only open while the applicant has not been finally judged.
// FOR_REVISION is included so an officer can reject an application they had
// previously sent back.
const DECIDABLE = ["PENDING", "FOR_REVISION"];

export async function rejectAccount(id, approver, reason) {
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) throw new NotFoundError("account not found");
  if (!DECIDABLE.includes(user.status)) {
    throw new ConflictError(`account is already ${user.status.toLowerCase()}`);
  }
  // The row is kept rather than deleted: the applicant signs in to a read-only
  // status page to be told why, which a deleted row cannot do.
  const updated = await prisma.user.update({
    where: { id },
    data: {
      status: "REJECTED",
      rejectionReason: reason,
      approvedById: approver.userId,
      approvedByName: await approverName(approver),
      decidedAt: new Date(),
    },
  });
  return { id: updated.id, name: updated.name, email: updated.email, status: updated.status, reason };
}

export async function reviseAccount(id, approver, remarks) {
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) throw new NotFoundError("account not found");
  if (!DECIDABLE.includes(user.status)) {
    throw new ConflictError(`account is already ${user.status.toLowerCase()}`);
  }
  const updated = await prisma.user.update({
    where: { id },
    data: {
      status: "FOR_REVISION",
      rejectionReason: remarks, // one column carries the remarks for both
      approvedById: approver.userId,
      approvedByName: await approverName(approver),
      decidedAt: new Date(),
    },
  });
  return { id: updated.id, name: updated.name, email: updated.email, status: updated.status, remarks };
}
```

Also widen `approveAccount`'s guard from `if (user.status !== "PENDING")` to:

```js
  if (!DECIDABLE.includes(user.status)) {
    throw new ConflictError(`account is already ${user.status.toLowerCase()}`);
  }
```

- [ ] **Step 9: Wire the controller and route**

In `server/src/controllers/authController.js`, add beside `reject`:

```js
export async function revise(req, res, next) {
  try {
    const { remarks } = reviseAccountSchema.parse(req.body);
    res.json(await reviseAccount(req.params.id, req.user, remarks));
  } catch (err) { next(err); }
}
```

Add `reviseAccount` to the `authService.js` import and `reviseAccountSchema` to the `validation/user.js` import in that file.

In `server/src/routes/authRoutes.js`, add `revise` to the controller import and the route beside the others:

```js
router.patch("/pending/:id/revise", verifyJwt, requireRole("ADMIN", "LEASING_OFFICER"), revise);
```

- [ ] **Step 10: Run the tests**

Run: `npx vitest run tests/accountApproval.test.js --reporter=verbose`
Expected: PASS, except `"blocks login after rejection like any other unknown account"`, which Task 2 rewrites.

- [ ] **Step 11: Commit**

```bash
git add server/prisma/manual-migrations/2026-09-14-account-for-revision.sql server/prisma/schema.prisma server/src/validation/user.js server/src/services/authService.js server/src/controllers/authController.js server/src/routes/authRoutes.js server/tests/accountApproval.test.js
git commit -m "feat(approvals): send an application back for revision, and stop deleting rejections

rejectAccount deleted the user row, so the rejectionReason column it
ignored was always empty and no applicant was ever told why. The row is
kept now, which is also what lets a For Revision round exist at all."
```

---

### Task 2: Restricted sessions

**Files:**
- Modify: `server/src/services/authService.js` (`issueToken`, `loginUser`)
- Modify: `server/src/middleware/auth.js`
- Test: `server/tests/restrictedSession.test.js` (create)
- Test: `server/tests/accountApproval.test.js` (the login test left failing in Task 1)

**Interfaces:**
- Consumes: `AccountStatus.FOR_REVISION` from Task 1.
- Produces: JWTs carrying `status`; `req.user.status`; `verifyJwt` (refuses any non-`APPROVED` token with 403) and `verifyJwtAllowPending` (admits any authenticated token) from `server/src/middleware/auth.js`. `loginUser` returns `{ token, user: { ..., status } }`.

- [ ] **Step 1: Write the failing tests**

Create `server/tests/restrictedSession.test.js`:

```js
import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { resetCrudTables } from "./helpers.js";
import { prisma } from "../src/lib/prisma.js";
import { hashPassword } from "../src/services/authService.js";

const app = createApp();
beforeEach(async () => { await resetCrudTables(); });

async function applicant(status = "PENDING") {
  return prisma.user.create({
    data: {
      name: "Applicant", email: `applicant.${status}@x.com`, contactEmail: "a@x.com",
      role: "UNIT_OWNER", status, passwordHash: await hashPassword("secret123"),
      passwordPlain: "secret123", pendingUnit: { unitNumber: "19A" },
    },
  });
}
async function signIn(email) {
  return request(app).post("/api/auth/login").send({ email, password: "secret123" });
}

describe("Restricted sessions", () => {
  it.each(["PENDING", "FOR_REVISION", "REJECTED"])("admits a %s account and reports its status", async (status) => {
    const u = await applicant(status);
    const res = await signIn(u.email);
    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
    expect(res.body.user.status).toBe(status);
  });

  it("refuses a restricted token on an ordinary protected route", async () => {
    const u = await applicant("PENDING");
    const { body } = await signIn(u.email);
    const res = await request(app).get("/api/units").set("Authorization", `Bearer ${body.token}`);
    expect(res.status).toBe(403);
  });

  it("refuses a restricted token on the account queue too", async () => {
    const u = await applicant("PENDING");
    const { body } = await signIn(u.email);
    const res = await request(app).get("/api/auth/pending").set("Authorization", `Bearer ${body.token}`);
    expect(res.status).toBe(403);
  });

  it("still admits an approved account everywhere", async () => {
    const u = await applicant("APPROVED");
    const { body } = await signIn(u.email);
    const res = await request(app).get("/api/auth/me").set("Authorization", `Bearer ${body.token}`);
    expect(res.status).toBe(200);
  });
});
```

- [ ] **Step 2: Rewrite the two login tests this inverts**

`server/tests/accountApproval.test.js` asserts the behaviour being replaced in two places. Both must be rewritten, not deleted. The file already defines an `applicant` object whose `.password` is the one `signup()` posts — use it rather than a literal.

Replace `"blocks login while pending, with its own message"` (which expects `403` / `ACCOUNT_PENDING`):

```js
  it("lets a pending applicant sign in to a restricted session", async () => {
    await signup();
    const res = await request(app).post("/api/auth/login")
      .send({ email: applicant.email, password: applicant.password });
    // Signing in is the only way to tell an applicant where they stand —
    // there is no outbound email. The token is restricted; restrictedSession
    // .test.js covers what it cannot reach.
    expect(res.status).toBe(200);
    expect(res.body.user.status).toBe("PENDING");
  });
```

Replace `"blocks login after rejection like any other unknown account"`:

```js
  it("lets a rejected applicant sign in to be told why", async () => {
    await signup();
    const u = await pendingUser();
    await request(app).patch(`/api/auth/pending/${u.id}/reject`)
      .set("Authorization", `Bearer ${tokens.admin()}`).send({ reason: "Could not verify identity" });

    const res = await request(app).post("/api/auth/login")
      .send({ email: applicant.email, password: applicant.password });
    expect(res.status).toBe(200);
    expect(res.body.user.status).toBe("REJECTED");
  });
```

Leave `"still rejects a wrong password on a pending account as invalid credentials"` exactly as it is — it must keep passing. The password check still precedes everything, which is what stops account statuses leaking to someone guessing credentials.

`server/tests/authSignup.test.js` asserts the same refusal and must be rewritten too. Replace `"does NOT let the new account log in until it is approved"`:

```js
  it("lets the new account log in, but only to a restricted session", async () => {
    await request(app).post("/api/auth/signup")
      .send({ ...base, name: "New Lessee", email: "lessee.signup@x.com", contactEmail: "lessee.signup@x.com", role: "TENANT" });
    const login = await request(app).post("/api/auth/login")
      .send({ email: "lessee.signup@x.com", password: base.password });
    expect(login.status).toBe(200);
    expect(login.body.user.status).toBe("PENDING");

    // The gate moved from the door to the rooms: the session exists but
    // verifyJwt refuses every route except the application-status ones.
    const blocked = await request(app).get("/api/units")
      .set("Authorization", `Bearer ${login.body.token}`);
    expect(blocked.status).toBe(403);
  });
```

Then confirm nothing else asserts the old refusal:

```bash
grep -rn "ACCOUNT_PENDING\|ACCOUNT_REJECTED\|AccountPendingError\|AccountRejectedError" server/tests server/src client/src
```

Expected after this task: hits only in `client/src/views/LoginView.vue` (Task 7 owns it) and nowhere in `server/`.

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run tests/restrictedSession.test.js --reporter=verbose`
Expected: FAIL — login returns 403 `AccountPendingError` for `PENDING`, and `res.body.user.status` is `undefined`.

- [ ] **Step 4: Put the status in the token**

In `server/src/services/authService.js`:

```js
export function issueToken({ id, role, unitOwnerId = null, tenantId = null, status = "APPROVED" }) {
  return jwt.sign(
    { userId: id, role, unitOwnerId: unitOwnerId ?? null, tenantId: tenantId ?? null, status },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || "1d" },
  );
}
```

The `status = "APPROVED"` default keeps every existing caller (staff login, tests, seed scripts) issuing full tokens without edits.

- [ ] **Step 5: Let non-approved accounts sign in**

In `loginUser`, delete the two throwing lines and pass the status through:

```js
  // Every status may sign in. A non-approved account receives a restricted
  // token that verifyJwt refuses everywhere except the application-status
  // routes — the status page is the only way to tell an applicant where they
  // stand, because the system has no outbound email.
  const token = issueToken({
    id: user.id, role: user.role, unitOwnerId: user.unitOwnerId,
    tenantId: user.tenantId, status: user.status,
  });
  return {
    token,
    user: {
      id: user.id, name: user.name, email: user.email, role: user.role,
      unitOwnerId: user.unitOwnerId, tenantId: user.tenantId, status: user.status,
    },
  };
```

`AccountPendingError` and `AccountRejectedError` were thrown only by these two lines. Delete both classes from `server/src/lib/errors.js` and drop them from this file's import — nothing else throws them, and an error class no code can raise is a false promise to whoever reads the error surface next.

`client/src/views/LoginView.vue` still tests for the `ACCOUNT_PENDING` code. That branch is now unreachable but harmless (a string comparison against a code the server no longer sends); Task 7 removes it.

- [ ] **Step 6: Make the middleware fail closed**

Replace `verifyJwt` in `server/src/middleware/auth.js`:

```js
function decode(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Missing token" });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = {
      userId: decoded.userId,
      role: decoded.role,
      unitOwnerId: decoded.unitOwnerId ?? null,
      tenantId: decoded.tenantId ?? null,
      // Tokens issued before this shipped carry no status. Treating them as
      // approved is correct: they could only have been issued to an approved
      // account, since nothing else could sign in.
      status: decoded.status ?? "APPROVED",
    };
    next();
  } catch {
    return res.status(401).json({ error: "Invalid token" });
  }
}

// Admits any authenticated account, approved or not. Use ONLY on the
// application-status routes — this is the opt-in half of the gate.
export function verifyJwtAllowPending(req, res, next) {
  return decode(req, res, next);
}

// The default, and deliberately the strict one. verifyJwt is applied per route
// file across ~20 mounts; a `requireApproved` that each of them had to opt into
// would gate nothing the day someone forgets one. Failing closed here means a
// new route is protected by default and widening access is a visible edit.
export function verifyJwt(req, res, next) {
  return decode(req, res, () => {
    if (req.user.status !== "APPROVED") {
      return res.status(403).json({ error: "Your account is not approved yet" });
    }
    next();
  });
}
```

- [ ] **Step 7: Run the tests**

Run: `npx vitest run tests/restrictedSession.test.js tests/accountApproval.test.js --reporter=verbose`
Expected: PASS.

- [ ] **Step 8: Run the whole server suite**

Run: `npm test`
Expected: PASS, 56 files. Any failure here means a test was signing in as a non-approved account and relying on the old refusal — read it before changing it.

- [ ] **Step 9: Commit**

```bash
git add server/src/services/authService.js server/src/middleware/auth.js server/tests/restrictedSession.test.js server/tests/accountApproval.test.js
git commit -m "feat(auth): restricted sessions for accounts awaiting a decision

An applicant could not sign in and there is no outbound email, so they
had no way to learn anything between applying and being approved. They
sign in now with a token verifyJwt refuses by default; only the
application-status routes opt in, so every existing route stays gated
without needing an edit."
```

---

### Task 3: Application status API

**Files:**
- Modify: `server/src/services/authService.js` (`getApplication`, `resubmitApplication`)
- Modify: `server/src/controllers/authController.js`
- Modify: `server/src/routes/authRoutes.js`
- Modify: `server/src/validation/user.js`
- Test: `server/tests/application.test.js` (create)

**Interfaces:**
- Consumes: `verifyJwtAllowPending` (Task 2), `pendingUnitSchema` (existing).
- Produces: `GET /api/auth/application` → `{ status, remarks, name, contactEmail, role, pendingUnit, decidedAt }`. `PATCH /api/auth/application` → same shape with `status: "PENDING"`. Validation export `resubmitSchema`.

- [ ] **Step 1: Write the failing tests**

Create `server/tests/application.test.js`:

```js
import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { resetCrudTables } from "./helpers.js";
import { prisma } from "../src/lib/prisma.js";
import { hashPassword } from "../src/services/authService.js";

const app = createApp();
beforeEach(async () => { await resetCrudTables(); });

async function applicantToken(status, rejectionReason = null) {
  const user = await prisma.user.create({
    data: {
      name: "Applicant", email: `app.${status}@x.com`, contactEmail: "a@x.com",
      role: "UNIT_OWNER", status, rejectionReason,
      passwordHash: await hashPassword("secret123"), passwordPlain: "secret123",
      pendingUnit: { unitNumber: "19A", floor: "19" },
    },
  });
  const res = await request(app).post("/api/auth/login").send({ email: user.email, password: "secret123" });
  return { user, token: res.body.token };
}

describe("Application status", () => {
  it("returns the applicant's own status and unit", async () => {
    const { token } = await applicantToken("PENDING");
    const res = await request(app).get("/api/auth/application").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("PENDING");
    expect(res.body.pendingUnit.unitNumber).toBe("19A");
  });

  it("returns the remarks on a For Revision application", async () => {
    const { token } = await applicantToken("FOR_REVISION", "Tower does not match");
    const res = await request(app).get("/api/auth/application").set("Authorization", `Bearer ${token}`);
    expect(res.body.status).toBe("FOR_REVISION");
    expect(res.body.remarks).toBe("Tower does not match");
  });

  it("never returns the password hash", async () => {
    const { token } = await applicantToken("PENDING");
    const res = await request(app).get("/api/auth/application").set("Authorization", `Bearer ${token}`);
    expect(res.body.passwordHash).toBeUndefined();
    expect(res.body.passwordPlain).toBeUndefined();
  });

  it("resubmits a corrected unit and returns to Pending Review", async () => {
    const { user, token } = await applicantToken("FOR_REVISION", "wrong floor");
    const res = await request(app).patch("/api/auth/application")
      .set("Authorization", `Bearer ${token}`)
      .send({ unit: { unitNumber: "20B", floor: "20" } });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("PENDING");

    const after = await prisma.user.findUnique({ where: { id: user.id } });
    expect(after.status).toBe("PENDING");
    expect(after.pendingUnit.unitNumber).toBe("20B");
    expect(after.rejectionReason).toBeNull();
  });

  it("refuses resubmission unless the application is For Revision", async () => {
    const { token } = await applicantToken("PENDING");
    const res = await request(app).patch("/api/auth/application")
      .set("Authorization", `Bearer ${token}`).send({ unit: { unitNumber: "20B" } });
    expect(res.status).toBe(409);
  });

  it("refuses a rejected applicant's resubmission", async () => {
    const { token } = await applicantToken("REJECTED", "not verified");
    const res = await request(app).patch("/api/auth/application")
      .set("Authorization", `Bearer ${token}`).send({ unit: { unitNumber: "20B" } });
    expect(res.status).toBe(409);
  });

  it("strips anything outside the unit whitelist", async () => {
    const { user, token } = await applicantToken("FOR_REVISION", "fix it");
    await request(app).patch("/api/auth/application")
      .set("Authorization", `Bearer ${token}`)
      .send({ unit: { unitNumber: "20B", ownerId: "x", approvalStatus: "APPROVED" } });

    const after = await prisma.user.findUnique({ where: { id: user.id } });
    expect(after.pendingUnit.ownerId).toBeUndefined();
    expect(after.pendingUnit.approvalStatus).toBeUndefined();
  });

  it("cannot escalate role or status through the resubmission body", async () => {
    const { user, token } = await applicantToken("FOR_REVISION", "fix it");
    await request(app).patch("/api/auth/application")
      .set("Authorization", `Bearer ${token}`)
      .send({ unit: { unitNumber: "20B" }, role: "ADMIN", status: "APPROVED", unitOwnerId: "x" });

    const after = await prisma.user.findUnique({ where: { id: user.id } });
    expect(after.role).toBe("UNIT_OWNER");
    expect(after.status).toBe("PENDING");
    expect(after.unitOwnerId).toBeNull();
  });

  it("requires a token", async () => {
    const res = await request(app).get("/api/auth/application");
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/application.test.js --reporter=verbose`
Expected: FAIL — 404, the route does not exist.

- [ ] **Step 3: Add the validation schema**

In `server/src/validation/user.js`:

```js
// Resubmission from the application status page. `.strip()` on pendingUnitSchema
// drops unknown unit keys; naming `unit` as the only field here is what stops a
// restricted session setting role, status or unitOwnerId on itself.
export const resubmitSchema = z.object({
  unit: pendingUnitSchema,
});
```

- [ ] **Step 4: Implement the service functions**

In `server/src/services/authService.js`:

```js
const APPLICATION_SELECT = {
  id: true, name: true, email: true, contactEmail: true, role: true,
  status: true, rejectionReason: true, decidedAt: true, pendingUnit: true, createdAt: true,
};

function asApplication(user) {
  const { rejectionReason, ...rest } = user;
  // One column carries both a rejection reason and revision remarks; the client
  // reads one field and decides what to call it from the status.
  return { ...rest, remarks: rejectionReason };
}

export async function getApplication(userId) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: APPLICATION_SELECT });
  if (!user) throw new NotFoundError("account not found");
  return asApplication(user);
}

export async function resubmitApplication(userId, unit) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new NotFoundError("account not found");
  if (user.status !== "FOR_REVISION") {
    throw new ConflictError("this application is not open for revision");
  }
  const updated = await prisma.user.update({
    where: { id: userId },
    // Only these three fields. The unit has already been through
    // pendingUnitSchema, so no key outside the whitelist can be here.
    data: { pendingUnit: unit, status: "PENDING", rejectionReason: null },
    select: APPLICATION_SELECT,
  });
  return asApplication(updated);
}
```

- [ ] **Step 5: Wire the controller and routes**

In `server/src/controllers/authController.js`:

```js
export async function application(req, res, next) {
  try {
    res.json(await getApplication(req.user.userId));
  } catch (err) { next(err); }
}

export async function resubmit(req, res, next) {
  try {
    const { unit } = resubmitSchema.parse(req.body);
    res.json(await resubmitApplication(req.user.userId, unit));
  } catch (err) { next(err); }
}
```

Add `getApplication` / `resubmitApplication` to the service import and `resubmitSchema` to the validation import.

In `server/src/routes/authRoutes.js`, import `verifyJwtAllowPending` alongside `verifyJwt` and add:

```js
// The only two routes a non-approved account may reach.
router.get("/application", verifyJwtAllowPending, application);
router.patch("/application", verifyJwtAllowPending, resubmit);
```

- [ ] **Step 6: Run the tests**

Run: `npx vitest run tests/application.test.js --reporter=verbose`
Expected: PASS, 9 tests.

- [ ] **Step 7: Commit**

```bash
git add server/src/services/authService.js server/src/controllers/authController.js server/src/routes/authRoutes.js server/src/validation/user.js server/tests/application.test.js
git commit -m "feat(application): let an applicant read their own status and resubmit

The resubmission body names `unit` and nothing else, so a restricted
session cannot set its own role, status or unitOwnerId."
```

---

### Task 4: Approval materialises an approved unit and opens the transaction

**Files:**
- Modify: `server/src/services/authService.js` (`buildPendingUnit`, `approveAccount`)
- Test: `server/tests/accountApproval.test.js`

**Interfaces:**
- Consumes: `ensureForUnit(unit, actor)` from `server/src/services/leasingTransactionService.js` (exists, from the 2026-09-08 pipeline).
- Produces: no new exports. `approveAccount` now creates the unit with `approvalStatus: "APPROVED"` and opens its onboarding transaction.

- [ ] **Step 1: Write the failing tests**

Add to `server/tests/accountApproval.test.js`:

```js
describe("Approval materialises a reviewed unit", () => {
  it("creates the unit APPROVED, not DRAFT", async () => {
    await signup();
    const u = await pendingUser();
    await request(app).patch(`/api/auth/pending/${u.id}/approve`)
      .set("Authorization", `Bearer ${tokens.admin()}`).send();

    const after = await prisma.user.findUnique({ where: { id: u.id } });
    const unit = await prisma.unit.findFirst({ where: { ownerId: after.unitOwnerId } });
    // The officer reviewed these details as part of this same decision, so
    // DRAFT would ask a second time for something already approved.
    expect(unit.approvalStatus).toBe("APPROVED");
  });

  it("opens the onboarding transaction at SEND_REQUIREMENTS", async () => {
    await signup();
    const u = await pendingUser();
    await request(app).patch(`/api/auth/pending/${u.id}/approve`)
      .set("Authorization", `Bearer ${tokens.admin()}`).send();

    const after = await prisma.user.findUnique({ where: { id: u.id } });
    const unit = await prisma.unit.findFirst({ where: { ownerId: after.unitOwnerId } });
    const txn = await prisma.leasingTransaction.findFirst({ where: { unitId: unit.id } });
    expect(txn).toBeTruthy();
    expect(txn.stage).toBe("SEND_REQUIREMENTS");
    expect(txn.stageData.INQUIRY.status).toBe("Skipped");
  });

  it("still approves when no unit was described", async () => {
    const user = await prisma.user.create({
      data: {
        name: "No Unit", email: "nounit@x.com", contactEmail: "nounit@x.com",
        role: "UNIT_OWNER", status: "PENDING", passwordHash: "x", passwordPlain: "x",
      },
    });
    const res = await request(app).patch(`/api/auth/pending/${user.id}/approve`)
      .set("Authorization", `Bearer ${tokens.admin()}`).send();
    expect(res.status).toBe(200);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/accountApproval.test.js -t "materialises" --reporter=verbose`
Expected: FAIL — `expected 'DRAFT' to be 'APPROVED'`, and the transaction is null.

- [ ] **Step 3: Create the unit as approved**

In `buildPendingUnit`, change the last property:

```js
    // Approved outright: this unit's details were just reviewed as half of the
    // application decision. DRAFT means "the lessor is still describing it",
    // which is no longer true by the time this runs.
    approvalStatus: "APPROVED",
```

- [ ] **Step 4: Open the transaction after the approval commits**

In `approveAccount`, capture the created unit inside the transaction and open its onboarding transaction after the commit:

```js
    if (user.role === "UNIT_OWNER") {
      const owner = await tx.unitOwner.create({ data: { name: user.name, email: user.contactEmail } });
      data.unitOwnerId = owner.id;
      if (user.pendingUnit) {
        createdUnit = await tx.unit.create({
          data: await buildPendingUnit(tx, owner.id, user.pendingUnit),
          include: { owner: true },
        });
        data.pendingUnit = null; // consumed
      }
    }
```

Declare `let createdUnit = null;` above the `prisma.$transaction` call, and after it returns:

```js
  // Outside the transaction and deliberately not fatal. An approved account
  // whose transaction failed to open is recoverable; an approval that
  // half-applied is not. Mirrors approveUnit's handling of the same call.
  if (createdUnit) {
    try {
      await ensureForUnit(createdUnit, approver);
    } catch (err) {
      console.error(`Could not open onboarding transaction for unit ${createdUnit.id}:`, err);
    }
  }
```

Restructure `approveAccount` so the `$transaction` result is held in a variable and returned after this block, rather than returned directly. Import `ensureForUnit` from `./leasingTransactionService.js`.

**If that import is circular** (`leasingTransactionService` importing from `authService`), use a deferred import inside the function instead:

```js
    const { ensureForUnit } = await import("./leasingTransactionService.js");
```

- [ ] **Step 5: Run the tests**

Run: `npx vitest run tests/accountApproval.test.js --reporter=verbose`
Expected: PASS.

- [ ] **Step 6: Run the whole server suite**

Run: `npm test`
Expected: PASS. Watch `unitOnboarding.test.js` and `unitListingPublishGate.test.js` — they assume units start `DRAFT` from signup. If one fails, read it: a test that approved an account and then submitted the unit for approval no longer needs that step.

- [ ] **Step 7: Commit**

```bash
git add server/src/services/authService.js server/tests/accountApproval.test.js
git commit -m "feat(approval): materialise a reviewed unit as APPROVED and open its pipeline

Unit approval already opens the onboarding transaction at
SEND_REQUIREMENTS, so approving the application is what puts the lessor
on the requirements step — the seam that makes this one workflow rather
than two queues."
```

---

### Task 5: The public registration wizard

**Files:**
- Create: `client/src/views/RegisterUnitPublicView.vue`
- Modify: `client/src/router/index.js`
- Modify: `client/src/views/LandingView.vue:27`
- Test: `client/tests/RegisterUnitPublicView.test.js` (create)
- Test: `client/tests/LandingView.test.js`
- Test: `client/tests/router.test.js`

**Interfaces:**
- Consumes: `publicRefs.estates()` / `publicRefs.towers(estateId)` from `client/src/lib/resource.js` (exists); `POST /auth/signup` (unchanged).
- Produces: route `/register-unit`; `sessionStorage` key `rbu.lessorApplication` holding `{ unit }` only.

- [ ] **Step 1: Write the failing tests**

Create `client/tests/RegisterUnitPublicView.test.js`:

```js
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import RegisterUnitPublicView from "../src/views/RegisterUnitPublicView.vue";

vi.mock("../src/lib/api.js", () => ({ api: { post: vi.fn(() => Promise.resolve({ data: {} })) } }));
vi.mock("../src/lib/resource.js", () => ({
  publicRefs: { estates: vi.fn(() => Promise.resolve([{ id: "e1", name: "Capitol Commons" }])),
                towers: vi.fn(() => Promise.resolve([{ id: "t1", name: "Empress" }])) },
}));

const stubs = { PublicShell: { template: "<div><slot /></div>" }, RouterLink: { template: "<a><slot /></a>" } };
const mountView = () => mount(RegisterUnitPublicView, { global: { stubs } });

beforeEach(() => { sessionStorage.clear(); vi.clearAllMocks(); });

describe("Public registration wizard", () => {
  it("opens on the unit step, not the account step", () => {
    const w = mountView();
    expect(w.find("#unitNumber").exists()).toBe(true);
    expect(w.find("#password").exists()).toBe(false);
  });

  it("will not advance without a unit number", async () => {
    const w = mountView();
    await w.find("form").trigger("submit");
    await flushPromises();
    expect(w.text()).toContain("Unit number is required");
    expect(w.find("#password").exists()).toBe(false);
  });

  it("advances to the account step once a unit number is given", async () => {
    const w = mountView();
    await w.find("#unitNumber").setValue("19A");
    await w.find("form").trigger("submit");
    await flushPromises();
    expect(w.find("#password").exists()).toBe(true);
  });

  it("restores the unit step from sessionStorage after a remount", async () => {
    const w = mountView();
    await w.find("#unitNumber").setValue("19A");
    await w.find("form").trigger("submit");
    await flushPromises();
    w.unmount();

    const again = mountView();
    await flushPromises();
    await again.find("#unitNumber").setValue("");
    expect(sessionStorage.getItem("rbu.lessorApplication")).toContain("19A");
  });

  it("submits the unit and the account in one request", async () => {
    const { api } = await import("../src/lib/api.js");
    const w = mountView();
    await w.find("#unitNumber").setValue("19A");
    await w.find("form").trigger("submit");
    await flushPromises();

    await w.find("#name").setValue("Jane Lessor");
    await w.find("#username").setValue("janelessor");
    await w.find("#contactEmail").setValue("jane@x.com");
    await w.find("#password").setValue("secret12345");
    await w.find("#confirm").setValue("secret12345");
    await w.find("#consent").setValue(true);
    await w.find("form").trigger("submit");
    await flushPromises();

    expect(api.post).toHaveBeenCalledTimes(1);
    const [url, payload] = api.post.mock.calls[0];
    expect(url).toBe("/auth/signup");
    expect(payload.role).toBe("UNIT_OWNER");
    expect(payload.unit.unitNumber).toBe("19A");
    expect(payload.name).toBe("Jane Lessor");
  });

  it("clears the saved draft after a successful submit", async () => {
    const w = mountView();
    await w.find("#unitNumber").setValue("19A");
    await w.find("form").trigger("submit");
    await flushPromises();
    await w.find("#name").setValue("Jane Lessor");
    await w.find("#username").setValue("janelessor");
    await w.find("#contactEmail").setValue("jane@x.com");
    await w.find("#password").setValue("secret12345");
    await w.find("#confirm").setValue("secret12345");
    await w.find("#consent").setValue(true);
    await w.find("form").trigger("submit");
    await flushPromises();
    expect(sessionStorage.getItem("rbu.lessorApplication")).toBeNull();
  });

  it("never writes the password to sessionStorage", async () => {
    const w = mountView();
    await w.find("#unitNumber").setValue("19A");
    await w.find("form").trigger("submit");
    await flushPromises();
    await w.find("#password").setValue("secret12345");
    expect(sessionStorage.getItem("rbu.lessorApplication")).not.toContain("secret12345");
  });
});
```

Add to `client/tests/LandingView.test.js`:

```js
it("sends the lessor to register a unit, not to signup", () => {
  const w = mountLanding();
  const lessor = w.findAll("a").find((a) => a.text().includes("I'm a Lessor"));
  expect(lessor.attributes("href") ?? lessor.attributes("to")).toBe("/register-unit");
});
```

Match the existing mount helper in that file rather than the invented `mountLanding` if it differs.

Add to `client/tests/router.test.js`:

```js
it("redirects the old lessor signup link to the wizard", async () => {
  await router.push("/signup?as=LESSOR");
  expect(router.currentRoute.value.path).toBe("/register-unit");
});

it("leaves the lessee signup path alone", async () => {
  await router.push("/signup");
  expect(router.currentRoute.value.path).toBe("/signup");
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/RegisterUnitPublicView.test.js --reporter=verbose`
Expected: FAIL — cannot resolve `../src/views/RegisterUnitPublicView.vue`.

- [ ] **Step 3: Write the view**

Create `client/src/views/RegisterUnitPublicView.vue`. Two steps in one component; step 1 is the unit, step 2 the account. Reuse the field markup and styling from `SignupView.vue` (account fields, password toggles, strength meter) and `RegisterUnitView.vue` (unit fields, hints) rather than inventing new ones.

```vue
<script setup>
import { ref, computed, watch, onMounted } from "vue";
import { RouterLink } from "vue-router";
import { api } from "../lib/api.js";
import { publicRefs } from "../lib/resource.js";
import PublicShell from "../components/PublicShell.vue";
import OnboardingProgress from "../components/OnboardingProgress.vue";

// The unit comes first: this page is reached from the landing card that
// promises "List your unit". Nothing reaches the server until the final
// submit, so an application is either complete or never started.
const DRAFT_KEY = "rbu.lessorApplication";
const UNIT_TYPES = ["Studio", "1 Bedroom", "2 Bedrooms", "3 Bedrooms", "3 Bedrooms Bi-level", "Penthouse"];

const step = ref(1);
const unit = ref({ estateId: "", towerId: "", unitNumber: "", floor: "", slotNo: "", type: "", baseRent: "" });
const estateOptions = ref([]);
const towerOptions = ref([]);

const name = ref(""); const username = ref(""); const contactEmail = ref("");
const password = ref(""); const confirm = ref(""); const consent = ref(false);
const showPassword = ref(false); const showConfirm = ref(false);

const submitting = ref(false); const submitted = ref(false);
const formError = ref(""); const errors = ref({});

// Only the unit is persisted. The password lives in component state and must
// never reach storage.
watch(unit, (u) => sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ unit: u })), { deep: true });

onMounted(async () => {
  try {
    const saved = JSON.parse(sessionStorage.getItem(DRAFT_KEY) || "null");
    if (saved?.unit) unit.value = { ...unit.value, ...saved.unit };
  } catch { /* a corrupt draft is not worth failing the page over */ }
  estateOptions.value = await publicRefs.estates();
});

async function onEstateChange() {
  unit.value.towerId = "";
  towerOptions.value = unit.value.estateId ? await publicRefs.towers(unit.value.estateId) : [];
}

watch(() => unit.value.unitNumber, () => delete errors.value.unitNumber);
watch(name, () => delete errors.value.name);
watch(username, () => delete errors.value.username);
watch(contactEmail, () => delete errors.value.contactEmail);
watch(password, () => { delete errors.value.password; delete errors.value.confirm; });
watch(confirm, () => delete errors.value.confirm);
watch(consent, () => delete errors.value.consent);

const submitLabel = computed(() => {
  if (step.value === 1) return "Continue to your account";
  return submitting.value ? "Submitting…" : "Submit application";
});

function validateUnit() {
  const e = {};
  if (!unit.value.unitNumber.trim()) e.unitNumber = "Unit number is required.";
  errors.value = e;
  return Object.keys(e).length === 0;
}

function validateAccount() {
  const e = {};
  if (!name.value.trim()) e.name = "Enter your full name.";
  if (username.value.trim().length < 3) e.username = "Username must be at least 3 characters.";
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(contactEmail.value.trim())) e.contactEmail = "Enter a valid email address.";
  if (password.value.length < 8) e.password = "Password must be at least 8 characters.";
  if (confirm.value !== password.value) e.confirm = "Passwords do not match.";
  if (!consent.value) e.consent = "Please agree before continuing.";
  errors.value = e;
  return Object.keys(e).length === 0;
}

function submit() {
  formError.value = "";
  if (step.value === 1) {
    if (!validateUnit()) return;
    step.value = 2;
    return;
  }
  if (!validateAccount()) return;
  return send();
}

function unitPayload() {
  const u = { unitNumber: unit.value.unitNumber.trim() };
  for (const k of ["towerId", "floor", "slotNo", "type"]) {
    if (unit.value[k]) u[k] = String(unit.value[k]).trim();
  }
  if (unit.value.estateId) u.estateId = unit.value.estateId;
  if (unit.value.baseRent !== "") u.baseRent = Number(unit.value.baseRent);
  return u;
}

async function send() {
  submitting.value = true;
  try {
    await api.post("/auth/signup", {
      name: name.value.trim(),
      email: username.value.trim(),
      contactEmail: contactEmail.value.trim(),
      password: password.value,
      role: "UNIT_OWNER",
      consent: true,
      unit: unitPayload(),
    });
    sessionStorage.removeItem(DRAFT_KEY);
    submitted.value = true;
  } catch (e) {
    formError.value = e.response?.data?.error || "Could not submit your application.";
  } finally {
    submitting.value = false;
  }
}
</script>
```

The template renders `<OnboardingProgress :current="step === 1 ? 'unit' : 'account'" />` above the form, the two steps behind `v-if="step === 1"` / `v-else`, a Back button on step 2 that sets `step = 1`, and a `submitted` panel telling the applicant their status is **Pending Review** with a `RouterLink to="/login"` labelled "Check your application status".

Give the account inputs the ids the tests query: `#name`, `#username`, `#contactEmail`, `#password`, `#confirm`, `#consent`. Unit inputs: `#estateId`, `#towerId`, `#unitNumber`, `#floor`, `#type`, `#baseRent`, `#slotNo`.

- [ ] **Step 4: Register the route and repoint the landing card**

In `client/src/router/index.js`, import the view and add beside the other public routes:

```js
  { path: "/register-unit", component: RegisterUnitPublicView, meta: { ownsThemeToggle: true } }, // public lessor wizard: unit first, then account
```

Redirect the old lessor entry, leaving the plain `/signup` alone for lessees:

```js
  {
    path: "/signup",
    component: SignupView,
    meta: { ownsThemeToggle: true },
    // The lessor path now starts with the unit, not the account.
    beforeEnter: (to) => (to.query.as === "LESSOR" ? "/register-unit" : true),
  },
```

In `client/src/views/LandingView.vue:27`, change the lessor card's target:

```vue
          <RouterLink to="/register-unit" class="choice">
```

- [ ] **Step 5: Run the tests**

Run: `npx vitest run tests/RegisterUnitPublicView.test.js tests/LandingView.test.js tests/router.test.js --reporter=verbose`
Expected: PASS. `OnboardingProgress` does not exist until Task 6 — stub it in this file's `stubs` object for now and remove the stub in Task 6.

- [ ] **Step 6: Commit**

```bash
git add client/src/views/RegisterUnitPublicView.vue client/src/router/index.js client/src/views/LandingView.vue client/tests/RegisterUnitPublicView.test.js client/tests/LandingView.test.js client/tests/router.test.js
git commit -m "feat(lessor): register the unit first, then the account

The landing card promises \"List your unit\" and then asked for one last,
as a step the applicant could skip. It is the entry point now."
```

---

### Task 6: The progress indicator

**Files:**
- Create: `client/src/components/OnboardingProgress.vue`
- Create: `shared/onboardingSteps.js`
- Test: `client/tests/OnboardingProgress.test.js` (create)

**Interfaces:**
- Consumes: nothing.
- Produces: `ONBOARDING_STEPS` from `shared/onboardingSteps.js` — `[{ key, label }]` for `unit`, `account`, `review`, `requirements`, `verification`. Component props: `current` (a step key) and `statuses` (an optional `{ [key]: "Pending Review" | "Approved" | "For Revision" | "Rejected" }`).

- [ ] **Step 1: Write the failing test**

Create `client/tests/OnboardingProgress.test.js`:

```js
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import OnboardingProgress from "../src/components/OnboardingProgress.vue";

describe("OnboardingProgress", () => {
  it("renders the five onboarding steps in order", () => {
    const w = mount(OnboardingProgress, { props: { current: "unit" } });
    const labels = w.findAll("[data-step]").map((n) => n.attributes("data-step"));
    expect(labels).toEqual(["unit", "account", "review", "requirements", "verification"]);
  });

  it("marks the current step", () => {
    const w = mount(OnboardingProgress, { props: { current: "review" } });
    expect(w.get('[data-step="review"]').attributes("aria-current")).toBe("step");
  });

  it("marks steps before the current one as done", () => {
    const w = mount(OnboardingProgress, { props: { current: "review" } });
    expect(w.get('[data-step="unit"]').classes()).toContain("is-done");
    expect(w.get('[data-step="requirements"]').classes()).not.toContain("is-done");
  });

  it("shows a status on the step that carries one", () => {
    const w = mount(OnboardingProgress, {
      props: { current: "review", statuses: { review: "For Revision" } },
    });
    expect(w.get('[data-step="review"]').text()).toContain("For Revision");
  });

  it("renders without statuses", () => {
    const w = mount(OnboardingProgress, { props: { current: "unit" } });
    expect(w.text()).toContain("Your unit");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/OnboardingProgress.test.js --reporter=verbose`
Expected: FAIL — cannot resolve the component.

- [ ] **Step 3: Write the shared step registry**

Create `shared/onboardingSteps.js`:

```js
// The lessor's path from the landing card to a verified unit. Steps 4 and 5
// mirror the SEND_REQUIREMENTS and APPROVAL stages of the leasing transaction
// that unit approval opens — this list is for display; it is not a second
// state machine.
export const ONBOARDING_STEPS = [
  { key: "unit",         label: "Your unit" },
  { key: "account",      label: "Your account" },
  { key: "review",       label: "Application review" },
  { key: "requirements", label: "Requirements" },
  { key: "verification", label: "Verification" },
];

export const ONBOARDING_STEP_KEYS = ONBOARDING_STEPS.map((s) => s.key);
```

- [ ] **Step 4: Write the component**

Create `client/src/components/OnboardingProgress.vue`:

```vue
<script setup>
import { computed } from "vue";
import { ONBOARDING_STEPS, ONBOARDING_STEP_KEYS } from "../../../shared/onboardingSteps.js";

const props = defineProps({
  current: { type: String, required: true },
  statuses: { type: Object, default: () => ({}) },
});

const currentIndex = computed(() => ONBOARDING_STEP_KEYS.indexOf(props.current));
const steps = computed(() =>
  ONBOARDING_STEPS.map((s, i) => ({
    ...s,
    done: i < currentIndex.value,
    isCurrent: i === currentIndex.value,
    status: props.statuses[s.key] || null,
  })),
);
</script>

<template>
  <ol class="prog" aria-label="Application progress">
    <li
      v-for="(s, i) in steps" :key="s.key"
      :data-step="s.key"
      :class="{ 'is-done': s.done, 'is-current': s.isCurrent }"
      :aria-current="s.isCurrent ? 'step' : undefined"
    >
      <span class="prog__n" aria-hidden="true">{{ s.done ? "✓" : i + 1 }}</span>
      <span class="prog__l">{{ s.label }}</span>
      <span v-if="s.status" class="prog__s">{{ s.status }}</span>
    </li>
  </ol>
</template>
```

Add scoped styles following the existing token vocabulary (`--accent-text`, `--muted`, `--line`, `--good`, `--warn`, `--danger`), collapsing to a vertical list under 620px.

Check the relative import depth against a sibling component that imports from `shared/` (`grep -rn "shared/" client/src/components/ | head -3`) and match it — do not guess.

- [ ] **Step 5: Run the tests, and drop the stub from Task 5**

Remove the `OnboardingProgress` stub from `client/tests/RegisterUnitPublicView.test.js`.

Run: `npx vitest run tests/OnboardingProgress.test.js tests/RegisterUnitPublicView.test.js --reporter=verbose`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add shared/onboardingSteps.js client/src/components/OnboardingProgress.vue client/tests/OnboardingProgress.test.js client/tests/RegisterUnitPublicView.test.js
git commit -m "feat(lessor): one progress indicator for the whole onboarding path"
```

---

### Task 7: The application status page

**Files:**
- Create: `client/src/views/ApplicationStatusView.vue`
- Modify: `client/src/router/index.js`
- Modify: `client/src/stores/auth.js`
- Modify: `client/src/lib/resource.js`
- Test: `client/tests/ApplicationStatusView.test.js` (create)
- Test: `client/tests/router.test.js`

**Interfaces:**
- Consumes: `GET /auth/application`, `PATCH /auth/application` (Task 3); `OnboardingProgress` (Task 6).
- Produces: route `/app/application`; `auth.status` on the store; `application.get()` / `application.resubmit(unit)` in `resource.js`.

- [ ] **Step 1: Write the failing tests**

Create `client/tests/ApplicationStatusView.test.js`:

```js
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import ApplicationStatusView from "../src/views/ApplicationStatusView.vue";

const get = vi.fn();
const resubmit = vi.fn(() => Promise.resolve({ status: "PENDING" }));
vi.mock("../src/lib/resource.js", () => ({ application: { get: (...a) => get(...a), resubmit: (...a) => resubmit(...a) } }));

const stubs = { RouterLink: { template: "<a><slot /></a>" } };
const mountView = () => mount(ApplicationStatusView, { global: { stubs } });

beforeEach(() => { vi.clearAllMocks(); });

describe("Application status page", () => {
  it("shows Pending Review while awaiting a decision", async () => {
    get.mockResolvedValue({ status: "PENDING", pendingUnit: { unitNumber: "19A" }, remarks: null });
    const w = mountView();
    await flushPromises();
    expect(w.text()).toContain("Pending Review");
    expect(w.find("form").exists()).toBe(false);
  });

  it("shows the remarks and an editable unit form on For Revision", async () => {
    get.mockResolvedValue({ status: "FOR_REVISION", pendingUnit: { unitNumber: "19A" }, remarks: "Tower does not match" });
    const w = mountView();
    await flushPromises();
    expect(w.text()).toContain("For Revision");
    expect(w.text()).toContain("Tower does not match");
    expect(w.get("#unitNumber").element.value).toBe("19A");
  });

  it("resubmits the corrected unit", async () => {
    get.mockResolvedValue({ status: "FOR_REVISION", pendingUnit: { unitNumber: "19A" }, remarks: "wrong" });
    const w = mountView();
    await flushPromises();
    await w.get("#unitNumber").setValue("20B");
    await w.get("form").trigger("submit");
    await flushPromises();
    expect(resubmit).toHaveBeenCalledWith(expect.objectContaining({ unitNumber: "20B" }));
  });

  it("shows the reason and no form when rejected", async () => {
    get.mockResolvedValue({ status: "REJECTED", pendingUnit: { unitNumber: "19A" }, remarks: "Could not verify identity" });
    const w = mountView();
    await flushPromises();
    expect(w.text()).toContain("Rejected");
    expect(w.text()).toContain("Could not verify identity");
    expect(w.find("form").exists()).toBe(false);
  });

  it("refuses to resubmit an empty unit number", async () => {
    get.mockResolvedValue({ status: "FOR_REVISION", pendingUnit: { unitNumber: "19A" }, remarks: "wrong" });
    const w = mountView();
    await flushPromises();
    await w.get("#unitNumber").setValue("");
    await w.get("form").trigger("submit");
    await flushPromises();
    expect(resubmit).not.toHaveBeenCalled();
  });
});
```

Add to `client/tests/router.test.js`:

```js
it("sends a non-approved account to the application page from any portal route", async () => {
  const auth = useAuthStore();
  auth.$patch({ token: "t", user: { role: "UNIT_OWNER", status: "PENDING" } });
  await router.push("/app/my-units");
  expect(router.currentRoute.value.path).toBe("/app/application");
});

it("leaves an approved account alone", async () => {
  const auth = useAuthStore();
  auth.$patch({ token: "t", user: { role: "UNIT_OWNER", status: "APPROVED" } });
  await router.push("/app/my-units");
  expect(router.currentRoute.value.path).toBe("/app/my-units");
});
```

Match the store-priming style already used in that file rather than the invented `$patch` shape if it differs.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/ApplicationStatusView.test.js --reporter=verbose`
Expected: FAIL — cannot resolve the view.

- [ ] **Step 3: Add the resource helpers**

In `client/src/lib/resource.js`, following the existing export style:

```js
export const application = {
  get: () => api.get("/auth/application").then((r) => r.data),
  resubmit: (unit) => api.patch("/auth/application", { unit }).then((r) => r.data),
};
```

- [ ] **Step 4: Expose the status on the auth store**

In `client/src/stores/auth.js`, carry `status` through from the login response and add a getter:

```js
    // Anything other than APPROVED is a restricted session: the server refuses
    // every route but the application-status ones, and the router keeps the
    // user on the page that explains why.
    isApproved: (s) => (s.user?.status ?? "APPROVED") === "APPROVED",
```

The `?? "APPROVED"` default matters: a session restored from storage before this shipped has no `status`, and must not be locked out.

- [ ] **Step 5: Write the view**

Create `client/src/views/ApplicationStatusView.vue`. It loads `application.get()` on mount, renders `OnboardingProgress` with `current="review"` and `:statuses="{ review: label }"`, and switches on the status:

```js
const STATUS_LABEL = {
  PENDING: "Pending Review",
  FOR_REVISION: "For Revision",
  APPROVED: "Approved",
  REJECTED: "Rejected",
};
```

`For Revision` renders the unit fields (ids matching the tests: `#unitNumber` at minimum, plus `#floor`, `#type`, `#baseRent`, `#slotNo`) inside a `<form>` that validates a non-empty unit number before calling `application.resubmit(unit)`; on success it re-reads the application so the page flips to Pending Review. Every other status renders read-only, with no `<form>` element at all — the tests assert its absence.

- [ ] **Step 6: Register the route and guard**

In `client/src/router/index.js`, add as a child of `/app`:

```js
      // Reachable by a non-approved account, and the only thing it can reach.
      { path: "application", component: ApplicationStatusView, meta: { roles: ["UNIT_OWNER", "TENANT"], allowPending: true } },
```

Extend `router.beforeEach`, after the `requiresAuth` check:

```js
  // A restricted session gets one page. This is convenience, not security —
  // the server refuses the routes regardless.
  if (auth.isAuthenticated && !auth.isApproved) {
    return to.meta.allowPending ? undefined : "/app/application";
  }
```

- [ ] **Step 7: Send a restricted session to the right place from sign-in**

`client/src/views/LoginView.vue` has two things that Task 2 invalidated: its
`catch` branch tests for an `ACCOUNT_PENDING` code the server no longer sends,
and its comment claims "a rejected application is deleted outright", which is no
longer true. It also routes every successful sign-in to a portal home the guard
will immediately bounce.

First add the test to `client/tests/LoginView.test.js` (create the file if absent, matching the mocking style of `ApplicationStatusView.test.js`):

```js
it("sends a non-approved account straight to the application page", async () => {
  post.mockResolvedValue({ data: { token: "t", user: { role: "UNIT_OWNER", status: "PENDING" } } });
  const w = mountLogin();
  await w.get("#email").setValue("jane");
  await w.get("#password").setValue("secret12345");
  await w.get("form").trigger("submit");
  await flushPromises();
  expect(push).toHaveBeenCalledWith("/app/application");
});

it("still sends an approved owner to their units", async () => {
  post.mockResolvedValue({ data: { token: "t", user: { role: "UNIT_OWNER", status: "APPROVED" } } });
  const w = mountLogin();
  await w.get("#email").setValue("jane");
  await w.get("#password").setValue("secret12345");
  await w.get("form").trigger("submit");
  await flushPromises();
  expect(push).toHaveBeenCalledWith("/app/my-units");
});
```

Then in `submit()`, route on approval and simplify the catch:

```js
    auth.setSession(data);
    // A restricted session has exactly one page it may open; sending it to a
    // portal home just to be bounced by the guard shows a flash of the wrong
    // screen.
    const home = !auth.isApproved
      ? "/app/application"
      : auth.isOwner ? "/app/my-units" : auth.isTenant ? "/app/my-lease" : "/app";
    router.push(home);
  } catch {
    // Every account that exists can now sign in, whatever its status, so the
    // only way to land here is credentials that do not match.
    error.value = "We couldn't find an account with those details. Check your username and password, or create an account below if you don't have one yet.";
  }
```

- [ ] **Step 8: Run the tests**

Run: `npx vitest run tests/ApplicationStatusView.test.js tests/router.test.js tests/LoginView.test.js --reporter=verbose`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add client/src/views/ApplicationStatusView.vue client/src/views/LoginView.vue client/src/router/index.js client/src/stores/auth.js client/src/lib/resource.js client/tests/ApplicationStatusView.test.js client/tests/router.test.js client/tests/LoginView.test.js
git commit -m "feat(application): a status page a waiting applicant can actually reach

For Revision is only a useful decision if the applicant can act on it,
which means signing in before approval and editing the unit in place."
```

---

### Task 8: The officer's For Revision action

**Files:**
- Modify: `client/src/views/AccountApprovalsView.vue`
- Modify: `client/src/lib/resource.js`
- Test: `client/tests/AccountApprovalsView.test.js`

**Interfaces:**
- Consumes: `PATCH /api/auth/pending/:id/revise` (Task 1).
- Produces: `accounts.revise(id, remarks)` in `resource.js`.

- [ ] **Step 1: Write the failing tests**

Add to `client/tests/AccountApprovalsView.test.js`, matching the file's existing mocking style:

```js
it("offers a For Revision action beside approve and reject", async () => {
  const w = await mountApprovals([{ id: "u1", name: "Jane", role: "UNIT_OWNER", pendingUnit: { unitNumber: "19A" } }]);
  expect(w.text()).toContain("For Revision");
});

it("sends the remarks with the revision", async () => {
  const w = await mountApprovals([{ id: "u1", name: "Jane", role: "UNIT_OWNER", pendingUnit: { unitNumber: "19A" } }]);
  const btn = w.findAll("button").find((b) => b.text().includes("For Revision"));
  await btn.trigger("click");
  await w.get('[data-test="revise-remarks"]').setValue("Tower does not match");
  await w.get('[data-test="revise-confirm"]').trigger("click");
  await flushPromises();
  expect(revise).toHaveBeenCalledWith("u1", "Tower does not match");
});

it("will not send an empty revision remark", async () => {
  const w = await mountApprovals([{ id: "u1", name: "Jane", role: "UNIT_OWNER", pendingUnit: { unitNumber: "19A" } }]);
  await w.findAll("button").find((b) => b.text().includes("For Revision")).trigger("click");
  await w.get('[data-test="revise-confirm"]').trigger("click");
  await flushPromises();
  expect(revise).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/AccountApprovalsView.test.js --reporter=verbose`
Expected: FAIL — no "For Revision" text in the rendered card.

- [ ] **Step 3: Add the resource helper**

In `client/src/lib/resource.js`, beside the existing approve/reject helpers:

```js
  revise: (id, remarks) => api.patch(`/auth/pending/${id}/revise`, { remarks }).then((r) => r.data),
```

- [ ] **Step 4: Add the action to the view**

In `client/src/views/AccountApprovalsView.vue`, add a third button beside Approve and Reject that opens a remarks prompt with `data-test="revise-remarks"` and `data-test="revise-confirm"`, mirroring however the existing Reject reason is collected. Guard on a non-empty trimmed remark before calling `accounts.revise`, then refresh the queue — a revised application leaves it, since `listPendingAccounts` selects `status: "PENDING"` only.

- [ ] **Step 5: Run the tests**

Run: `npx vitest run tests/AccountApprovalsView.test.js --reporter=verbose`
Expected: PASS.

- [ ] **Step 6: Run both full suites**

Run from `server/`: `npm test` — expected PASS.
Run from `client/`: `npm test` — expected PASS.

- [ ] **Step 7: Commit**

```bash
git add client/src/views/AccountApprovalsView.vue client/src/lib/resource.js client/tests/AccountApprovalsView.test.js
git commit -m "feat(approvals): send an application back for revision with remarks

Remarks are required — For Revision with no explanation leaves the
applicant guessing at what to change."
```

---

## Verification

After Task 8, confirm the whole path by hand against the running dev servers (`/register-unit` on the client, API on 5050):

1. Landing → "I'm a Lessor" lands on `/register-unit` with the unit step showing.
2. Submitting without a unit number is refused; with one, the account step appears.
3. Submitting the application shows Pending Review.
4. Signing in as that applicant lands on `/app/application` and no portal route is reachable.
5. As an officer, For Revision with remarks; the applicant sees them and resubmits; the application returns to the queue.
6. Approve; the applicant now reaches the portal, and `My Units` holds an `APPROVED` unit with an open transaction at Send Requirements.
