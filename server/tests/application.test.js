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
