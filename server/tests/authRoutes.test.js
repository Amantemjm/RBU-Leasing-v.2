import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { hashPassword } from "../src/services/authService.js";

const app = createApp();

beforeAll(async () => {
  await prisma.user.deleteMany({ where: { email: "itest@rbu.local" } });
  await prisma.user.create({
    data: { name: "IT", email: "itest@rbu.local",
      passwordHash: await hashPassword("pw123456"), role: "VIEWER" },
  });
});

describe("POST /api/auth/login", () => {
  it("returns a token for valid credentials", async () => {
    const res = await request(app).post("/api/auth/login")
      .send({ email: "itest@rbu.local", password: "pw123456" });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
    expect(res.body.user.role).toBe("VIEWER");
  });

  it("rejects bad credentials with 401", async () => {
    const res = await request(app).post("/api/auth/login")
      .send({ email: "itest@rbu.local", password: "wrong" });
    expect(res.status).toBe(401);
  });

  it("blocks a VIEWER from registering users (403)", async () => {
    const login = await request(app).post("/api/auth/login")
      .send({ email: "itest@rbu.local", password: "pw123456" });
    const res = await request(app).post("/api/auth/register")
      .set("Authorization", `Bearer ${login.body.token}`)
      .send({ name: "X", email: "x@rbu.local", password: "pw123456", role: "VIEWER" });
    expect(res.status).toBe(403);
  });
});
