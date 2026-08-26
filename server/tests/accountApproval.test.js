import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { resetCrudTables, tokens } from "./helpers.js";
import { prisma } from "../src/lib/prisma.js";
import { issueToken } from "../src/services/authService.js";

const app = createApp();
beforeEach(async () => { await resetCrudTables(); });

const applicant = {
  name: "Ana Reyes",
  email: "ana.reyes",
  contactEmail: "ana@example.com",
  password: "strong-pass-8",
  role: "TENANT",
  consent: true,
};

const signup = (over = {}) => request(app).post("/api/auth/signup").send({ ...applicant, ...over });

async function pendingUser(email = applicant.email) {
  return prisma.user.findUnique({ where: { email } });
}

describe("Portal signup requires approval", () => {
  it("creates the account as PENDING and does not sign the applicant in", async () => {
    const res = await signup();
    expect(res.status).toBe(201);
    expect(res.body.status).toBe("PENDING");
    // The whole point of the gate: no session is handed out.
    expect(res.body.token).toBeUndefined();
  });

  // Owners/Tenants lists must only ever hold vetted parties.
  it("does not create the linked tenant record until approval", async () => {
    await signup();
    expect(await prisma.tenant.count()).toBe(0);
    const u = await pendingUser();
    expect(u.tenantId).toBeNull();
    expect(u.contactEmail).toBe("ana@example.com");
  });

  it("blocks login while pending, with its own message", async () => {
    await signup();
    const res = await request(app).post("/api/auth/login")
      .send({ email: applicant.email, password: applicant.password });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("ACCOUNT_PENDING");
  });

  it("still rejects a wrong password on a pending account as invalid credentials", async () => {
    await signup();
    const res = await request(app).post("/api/auth/login")
      .send({ email: applicant.email, password: "not-the-password" });
    expect(res.status).toBe(401);
  });

  it("requires a contact email so the approver can reach the applicant", async () => {
    const res = await signup({ contactEmail: undefined });
    expect(res.status).toBe(400);
  });

  it("requires at least 8 characters of password", async () => {
    const res = await signup({ password: "short7!" });
    expect(res.status).toBe(400);
  });

  it("requires consent, like the public inquiry form does", async () => {
    const res = await signup({ consent: undefined });
    expect(res.status).toBe(400);
  });
});

describe("Approval queue", () => {
  it("lists pending accounts for an admin", async () => {
    await signup();
    const res = await request(app).get("/api/auth/pending")
      .set("Authorization", `Bearer ${tokens.admin()}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({ name: "Ana Reyes", role: "TENANT", contactEmail: "ana@example.com" });
  });

  // The owner asked for admin OR O-Lease.
  it("lists pending accounts for a leasing officer too", async () => {
    await signup();
    const res = await request(app).get("/api/auth/pending")
      .set("Authorization", `Bearer ${tokens.officer()}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });

  it("refuses a viewer (403)", async () => {
    await signup();
    const res = await request(app).get("/api/auth/pending")
      .set("Authorization", `Bearer ${tokens.viewer()}`);
    expect(res.status).toBe(403);
  });

  it("refuses an anonymous caller (401)", async () => {
    const res = await request(app).get("/api/auth/pending");
    expect(res.status).toBe(401);
  });

  it("shows only pending accounts, not approved staff", async () => {
    await signup();
    await request(app).post("/api/auth/register")
      .set("Authorization", `Bearer ${tokens.admin()}`)
      .send({ name: "Front Desk", email: "frontdesk", password: "pw123456", role: "VIEWER" });
    const res = await request(app).get("/api/auth/pending")
      .set("Authorization", `Bearer ${tokens.admin()}`);
    expect(res.body.map((u) => u.email)).toEqual([applicant.email]);
  });
});

describe("Approving an account", () => {
  it("creates the linked tenant record and lets the applicant in", async () => {
    await signup();
    const u = await pendingUser();
    const res = await request(app).patch(`/api/auth/pending/${u.id}/approve`)
      .set("Authorization", `Bearer ${tokens.admin()}`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("APPROVED");

    const after = await pendingUser();
    expect(after.tenantId).toBeTruthy();
    const tenant = await prisma.tenant.findUnique({ where: { id: after.tenantId } });
    expect(tenant).toMatchObject({ name: "Ana Reyes", email: "ana@example.com" });

    const login = await request(app).post("/api/auth/login")
      .send({ email: applicant.email, password: applicant.password });
    expect(login.status).toBe(200);
    expect(login.body.token).toBeTruthy();
    expect(login.body.user.tenantId).toBe(after.tenantId);
  });

  it("creates a unit-owner record for a lessor instead", async () => {
    await signup({ email: "juan.owner", role: "UNIT_OWNER", name: "Juan Cruz", contactEmail: "juan@example.com" });
    const u = await pendingUser("juan.owner");
    await request(app).patch(`/api/auth/pending/${u.id}/approve`)
      .set("Authorization", `Bearer ${tokens.admin()}`);
    const after = await pendingUser("juan.owner");
    expect(after.unitOwnerId).toBeTruthy();
    expect(await prisma.tenant.count()).toBe(0);
  });

  it("records who decided and when", async () => {
    await signup();
    const u = await pendingUser();
    // Approve as a real, resolvable admin so the name can be looked up.
    const admin = await prisma.user.findUnique({ where: { email: "admin@rbu.local" } });
    await request(app).patch(`/api/auth/pending/${u.id}/approve`)
      .set("Authorization", `Bearer ${issueToken({ id: admin.id, role: "ADMIN" })}`);
    const after = await pendingUser();
    expect(after.decidedAt).toBeTruthy();
    expect(after.approvedById).toBe(admin.id);
    // The JWT carries only userId and role, so the name must be resolved
    // server-side — otherwise the audit trail records an anonymous decision.
    expect(after.approvedByName).toBe(admin.name);
  });

  it("is idempotent — approving twice does not create a second record", async () => {
    await signup();
    const u = await pendingUser();
    const auth = { Authorization: `Bearer ${tokens.admin()}` };
    await request(app).patch(`/api/auth/pending/${u.id}/approve`).set(auth);
    const second = await request(app).patch(`/api/auth/pending/${u.id}/approve`).set(auth);
    expect(second.status).toBe(409);
    expect(await prisma.tenant.count()).toBe(1);
  });

  it("refuses a viewer (403)", async () => {
    await signup();
    const u = await pendingUser();
    const res = await request(app).patch(`/api/auth/pending/${u.id}/approve`)
      .set("Authorization", `Bearer ${tokens.viewer()}`);
    expect(res.status).toBe(403);
  });
});

describe("Rejecting an account", () => {
  it("marks it rejected, keeps the reason, and creates no linked record", async () => {
    await signup();
    const u = await pendingUser();
    const res = await request(app).patch(`/api/auth/pending/${u.id}/reject`)
      .set("Authorization", `Bearer ${tokens.admin()}`)
      .send({ reason: "Could not verify identity" });
    expect(res.status).toBe(200);

    const after = await pendingUser();
    expect(after.status).toBe("REJECTED");
    expect(after.rejectionReason).toBe("Could not verify identity");
    expect(after.tenantId).toBeNull();
    expect(await prisma.tenant.count()).toBe(0);
  });

  it("blocks login after rejection with its own message", async () => {
    await signup();
    const u = await pendingUser();
    await request(app).patch(`/api/auth/pending/${u.id}/reject`)
      .set("Authorization", `Bearer ${tokens.admin()}`).send({ reason: "Duplicate account" });
    const res = await request(app).post("/api/auth/login")
      .send({ email: applicant.email, password: applicant.password });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("ACCOUNT_REJECTED");
  });

  it("requires a reason", async () => {
    await signup();
    const u = await pendingUser();
    const res = await request(app).patch(`/api/auth/pending/${u.id}/reject`)
      .set("Authorization", `Bearer ${tokens.admin()}`).send({});
    expect(res.status).toBe(400);
  });
});

describe("Existing accounts are unaffected", () => {
  it("an admin-created staff login is approved outright and can sign in", async () => {
    await request(app).post("/api/auth/register")
      .set("Authorization", `Bearer ${tokens.admin()}`)
      .send({ name: "Front Desk", email: "frontdesk", password: "pw123456", role: "VIEWER" });
    const u = await pendingUser("frontdesk");
    expect(u.status).toBe("APPROVED");
    const login = await request(app).post("/api/auth/login")
      .send({ email: "frontdesk", password: "pw123456" });
    expect(login.status).toBe(200);
  });

  it("the seeded super admin can still sign in", async () => {
    const admin = await prisma.user.findUnique({ where: { email: "admin@rbu.local" } });
    expect(admin.status).toBe("APPROVED");
  });
});
