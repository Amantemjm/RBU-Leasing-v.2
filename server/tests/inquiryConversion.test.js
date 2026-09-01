import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { resetCrudTables } from "./helpers.js";
import { prisma } from "../src/lib/prisma.js";

const app = createApp();
beforeEach(async () => { await resetCrudTables(); });

async function inquiry(over = {}) {
  return prisma.inquiry.create({ data: {
    category: "RESIDENCES", inquirerType: "LESSOR", inquiryType: "List Unit for Lease",
    fullName: "Maria Santos", email: "maria@example.com", consent: true, status: "NEW", ...over } });
}
const signup = (over = {}) => request(app).post("/api/auth/signup").send({
  name: "Maria Santos", email: "maria@example.com", contactEmail: "maria@example.com",
  password: "Passw0rd!123", role: "UNIT_OWNER", consent: true, ...over });

describe("inquiry → account linkage on signup", () => {
  it("links the newest matching open LESSOR inquiry and marks it CONVERTED", async () => {
    const older = await inquiry({ createdAt: new Date("2026-08-01T00:00:00Z") });
    const newer = await inquiry({ createdAt: new Date("2026-08-20T00:00:00Z") });
    const res = await signup();
    expect(res.status).toBe(201);
    const userId = res.body.user.id;
    const a = await prisma.inquiry.findUnique({ where: { id: newer.id } });
    const b = await prisma.inquiry.findUnique({ where: { id: older.id } });
    expect(a.status).toBe("CONVERTED");
    expect(a.convertedUserId).toBe(userId);
    expect(b.status).toBe("NEW"); // only the newest is linked
  });

  it("signup with no matching inquiry still succeeds and changes nothing", async () => {
    const res = await signup({ email: "solo@example.com", contactEmail: "solo@example.com" });
    expect(res.status).toBe(201);
    expect(await prisma.inquiry.count({ where: { status: "CONVERTED" } })).toBe(0);
  });

  it("does not link a LESSEE inquiry to a UNIT_OWNER signup", async () => {
    const lessee = await inquiry({ inquirerType: "LESSEE", inquiryType: "Unit Availability" });
    await signup();
    const still = await prisma.inquiry.findUnique({ where: { id: lessee.id } });
    expect(still.status).toBe("NEW");
  });

  it("ignores an already-converted/closed inquiry", async () => {
    await inquiry({ status: "CLOSED" });
    const res = await signup();
    expect(res.status).toBe(201);
    expect(await prisma.inquiry.count({ where: { status: "CONVERTED" } })).toBe(0);
  });
});
