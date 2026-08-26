import { describe, it, expect, beforeEach, afterAll } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";

const app = createApp();
const EMAILS = ["lessee.signup@x.com", "lessor.signup@x.com"];

async function cleanup() {
  for (const e of EMAILS) {
    const u = await prisma.user.findUnique({ where: { email: e } });
    if (u) await prisma.user.delete({ where: { id: u.id } });
  }
  await prisma.tenant.deleteMany({ where: { email: { in: EMAILS } } });
  await prisma.unitOwner.deleteMany({ where: { email: { in: EMAILS } } });
}
beforeEach(cleanup);
afterAll(cleanup);

// Signup is an APPLICATION, not an account handout — see accountApproval.test.js
// for the approve/reject side. These cover the public endpoint's own contract.
const base = { password: "pw12345678", consent: true };

describe("POST /api/auth/signup — public self-registration", () => {
  it("records a lessee application without a session or a tenant record", async () => {
    const res = await request(app).post("/api/auth/signup")
      .send({ ...base, name: "New Lessee", email: "lessee.signup@x.com", contactEmail: "lessee.signup@x.com", role: "TENANT" });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe("PENDING");
    expect(res.body.token).toBeUndefined();
    expect(res.body.user.role).toBe("TENANT");
    expect(await prisma.tenant.findFirst({ where: { email: "lessee.signup@x.com" } })).toBeNull();
  });

  it("records a lessor application without an owner record", async () => {
    const res = await request(app).post("/api/auth/signup")
      .send({ ...base, name: "New Lessor", email: "lessor.signup@x.com", contactEmail: "lessor.signup@x.com", role: "UNIT_OWNER" });
    expect(res.status).toBe(201);
    expect(res.body.user.role).toBe("UNIT_OWNER");
    expect(await prisma.unitOwner.findFirst({ where: { email: "lessor.signup@x.com" } })).toBeNull();
  });

  it("does NOT let the new account log in until it is approved", async () => {
    await request(app).post("/api/auth/signup")
      .send({ ...base, name: "New Lessee", email: "lessee.signup@x.com", contactEmail: "lessee.signup@x.com", role: "TENANT" });
    const login = await request(app).post("/api/auth/login")
      .send({ email: "lessee.signup@x.com", password: base.password });
    expect(login.status).toBe(403);
    expect(login.body.code).toBe("ACCOUNT_PENDING");
  });

  it("rejects a duplicate username/email (409)", async () => {
    const body = { ...base, name: "A", email: "lessee.signup@x.com", contactEmail: "lessee.signup@x.com", role: "TENANT" };
    await request(app).post("/api/auth/signup").send(body);
    const res = await request(app).post("/api/auth/signup").send({ ...body, name: "B" });
    expect(res.status).toBe(409);
  });

  it("rejects a staff role via self-signup (400)", async () => {
    const res = await request(app).post("/api/auth/signup")
      .send({ ...base, name: "X", email: "lessor.signup@x.com", contactEmail: "x@x.com", role: "ADMIN" });
    expect(res.status).toBe(400);
  });
});
