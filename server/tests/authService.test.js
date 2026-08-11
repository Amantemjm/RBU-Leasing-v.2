import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword, issueToken } from "../src/services/authService.js";
import jwt from "jsonwebtoken";

describe("authService pure helpers", () => {
  it("hashes and verifies a password", async () => {
    const hash = await hashPassword("secret123");
    expect(hash).not.toBe("secret123");
    expect(await verifyPassword("secret123", hash)).toBe(true);
    expect(await verifyPassword("wrong", hash)).toBe(false);
  });

  it("issues a JWT carrying id and role", () => {
    process.env.JWT_SECRET = "test-secret";
    const token = issueToken({ id: "u1", role: "ADMIN" });
    const decoded = jwt.verify(token, "test-secret");
    expect(decoded.userId).toBe("u1");
    expect(decoded.role).toBe("ADMIN");
  });

  it("issues a JWT carrying owner/tenant links", () => {
    process.env.JWT_SECRET = "test-secret";
    const token = issueToken({ id: "u2", role: "UNIT_OWNER", unitOwnerId: "o9", tenantId: null });
    const decoded = jwt.verify(token, "test-secret");
    expect(decoded.unitOwnerId).toBe("o9");
    expect(decoded.tenantId).toBeNull();
  });
});
