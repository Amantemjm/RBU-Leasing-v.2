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

describe("POST /api/auth/signup — public self-registration", () => {
  it("creates a lessee account + linked tenant record and returns a session token", async () => {
    const res = await request(app).post("/api/auth/signup")
      .send({ name: "New Lessee", email: "lessee.signup@x.com", password: "pw123456", role: "TENANT" });
    expect(res.status).toBe(201);
    expect(res.body.token).toBeTruthy();
    expect(res.body.user.role).toBe("TENANT");
    expect(res.body.user.tenantId).toBeTruthy();
    const t = await prisma.tenant.findUnique({ where: { id: res.body.user.tenantId } });
    expect(t?.name).toBe("New Lessee");
  });

  it("creates a lessor account + linked owner record", async () => {
    const res = await request(app).post("/api/auth/signup")
      .send({ name: "New Lessor", email: "lessor.signup@x.com", password: "pw123456", role: "UNIT_OWNER" });
    expect(res.status).toBe(201);
    expect(res.body.user.role).toBe("UNIT_OWNER");
    expect(res.body.user.unitOwnerId).toBeTruthy();
  });

  it("lets the new account log in immediately", async () => {
    await request(app).post("/api/auth/signup")
      .send({ name: "New Lessee", email: "lessee.signup@x.com", password: "pw123456", role: "TENANT" });
    const login = await request(app).post("/api/auth/login")
      .send({ email: "lessee.signup@x.com", password: "pw123456" });
    expect(login.status).toBe(200);
    expect(login.body.user.role).toBe("TENANT");
  });

  it("rejects a duplicate username/email (409)", async () => {
    await request(app).post("/api/auth/signup")
      .send({ name: "A", email: "lessee.signup@x.com", password: "pw123456", role: "TENANT" });
    const res = await request(app).post("/api/auth/signup")
      .send({ name: "B", email: "lessee.signup@x.com", password: "pw123456", role: "TENANT" });
    expect(res.status).toBe(409);
  });

  it("rejects a staff role via self-signup (400)", async () => {
    const res = await request(app).post("/api/auth/signup")
      .send({ name: "X", email: "lessor.signup@x.com", password: "pw123456", role: "ADMIN" });
    expect(res.status).toBe(400);
  });
});
