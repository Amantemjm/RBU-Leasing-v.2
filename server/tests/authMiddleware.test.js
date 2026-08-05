import { describe, it, expect, vi } from "vitest";
import { verifyJwt, requireRole } from "../src/middleware/auth.js";
import { issueToken } from "../src/services/authService.js";

function mockRes() {
  return { statusCode: 0, body: null,
    status(c){ this.statusCode = c; return this; },
    json(b){ this.body = b; return this; } };
}

describe("auth middleware", () => {
  it("rejects a request with no token", () => {
    const res = mockRes();
    verifyJwt({ headers: {} }, res, () => { throw new Error("should not call next"); });
    expect(res.statusCode).toBe(401);
  });

  it("accepts a valid token and sets req.user", () => {
    process.env.JWT_SECRET = "test-secret";
    const token = issueToken({ id: "u1", role: "ADMIN" });
    const req = { headers: { authorization: `Bearer ${token}` } };
    const next = vi.fn();
    verifyJwt(req, mockRes(), next);
    expect(next).toHaveBeenCalled();
    expect(req.user.role).toBe("ADMIN");
  });

  it("requireRole blocks the wrong role with 403", () => {
    const res = mockRes();
    requireRole("ADMIN")({ user: { role: "VIEWER" } }, res, () => { throw new Error("no"); });
    expect(res.statusCode).toBe(403);
  });
});
