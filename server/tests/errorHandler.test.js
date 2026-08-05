import { describe, it, expect } from "vitest";
import { z } from "zod";
import { errorHandler } from "../src/middleware/error.js";
import { NotFoundError, ConflictError, InvalidReferenceError } from "../src/lib/errors.js";

function mockRes() {
  return { statusCode: 0, body: null,
    status(c){ this.statusCode = c; return this; },
    json(b){ this.body = b; return this; } };
}

describe("errorHandler", () => {
  it("maps ZodError to 400 with details", () => {
    const res = mockRes();
    let err;
    try { z.object({ name: z.string() }).parse({}); } catch (e) { err = e; }
    errorHandler(err, {}, res, () => {});
    expect(res.statusCode).toBe(400);
    expect(Array.isArray(res.body.details)).toBe(true);
  });

  it("maps NotFoundError to 404", () => {
    const res = mockRes();
    errorHandler(new NotFoundError("nope"), {}, res, () => {});
    expect(res.statusCode).toBe(404);
  });

  it("maps ConflictError to 409", () => {
    const res = mockRes();
    errorHandler(new ConflictError("busy"), {}, res, () => {});
    expect(res.statusCode).toBe(409);
  });

  it("maps InvalidReferenceError to 400", () => {
    const res = mockRes();
    errorHandler(new InvalidReferenceError("bad ref"), {}, res, () => {});
    expect(res.statusCode).toBe(400);
  });

  it("still maps INVALID_CREDENTIALS to 401", () => {
    const res = mockRes();
    errorHandler(new Error("INVALID_CREDENTIALS"), {}, res, () => {});
    expect(res.statusCode).toBe(401);
  });

  it("falls back to 500 for unknown errors", () => {
    const res = mockRes();
    errorHandler(new Error("boom"), {}, res, () => {});
    expect(res.statusCode).toBe(500);
  });
});
