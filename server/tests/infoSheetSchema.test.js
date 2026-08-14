import { describe, it, expect } from "vitest";
import { buildSchemaFromConfig } from "../src/lib/infoSheetSchema.js";

const config = {
  title: "Test",
  sections: [
    { title: "A", fields: [
      { key: "name", label: "Name", type: "text", required: true },
      { key: "email", label: "Email", type: "email", required: true },
      { key: "age", label: "Age", type: "number" },
      { key: "note", label: "Note", type: "textarea" },
    ] },
  ],
};

describe("buildSchemaFromConfig", () => {
  const schema = buildSchemaFromConfig(config);

  it("accepts a valid object and coerces numbers", () => {
    const out = schema.parse({ name: "Ana", email: "ana@x.com", age: "30", note: "" });
    expect(out.name).toBe("Ana");
    expect(out.age).toBe(30);
  });

  it("rejects a missing required field", () => {
    expect(() => schema.parse({ email: "ana@x.com" })).toThrow();
  });

  it("rejects an empty required field", () => {
    expect(() => schema.parse({ name: "  ", email: "ana@x.com" })).toThrow();
  });

  it("rejects an invalid email", () => {
    expect(() => schema.parse({ name: "Ana", email: "nope" })).toThrow();
  });

  it("rejects unknown keys", () => {
    expect(() => schema.parse({ name: "Ana", email: "ana@x.com", hacker: "x" })).toThrow();
  });

  it("allows optional fields to be omitted", () => {
    const out = schema.parse({ name: "Ana", email: "ana@x.com" });
    expect(out.name).toBe("Ana");
  });
});
