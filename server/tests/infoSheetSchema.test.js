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

describe("buildSchemaFromConfig — choice fields", () => {
  const config = {
    title: "Choices",
    sections: [
      { title: "A", fields: [
        { key: "sex", label: "Sex", type: "radio", options: ["Male", "Female"], required: true },
        { key: "channel", label: "Channel", type: "checkboxes", options: ["SMS", "Email"], allowOther: true },
        { key: "unitType", label: "Unit Type", type: "radio", options: ["Studio"], allowOther: true },
      ] },
    ],
  };
  const schema = buildSchemaFromConfig(config);

  it("accepts a radio value, a checkbox array, and a write-in companion", () => {
    const out = schema.parse({ sex: "Male", channel: ["SMS", "Email"], channelOther: "Telegram", unitType: "", unitTypeOther: "2-Bedroom" });
    expect(out.sex).toBe("Male");
    expect(out.channel).toEqual(["SMS", "Email"]);
    expect(out.channelOther).toBe("Telegram");
    expect(out.unitTypeOther).toBe("2-Bedroom");
  });

  it("defaults an omitted checkbox group to an empty array", () => {
    const out = schema.parse({ sex: "Female" });
    expect(out.channel).toEqual([]);
  });

  it("rejects a missing required radio", () => {
    expect(() => schema.parse({ channel: ["SMS"] })).toThrow();
  });

  it("satisfies a required choice via its write-in companion", () => {
    const cfg = { title: "T", sections: [{ title: "A", fields: [
      { key: "unitType", label: "Unit Type", type: "radio", options: ["Studio"], allowOther: true, required: true },
    ] }] };
    const s = buildSchemaFromConfig(cfg);
    expect(() => s.parse({ unitType: "", unitTypeOther: "Loft" })).not.toThrow();
    expect(() => s.parse({ unitType: "" })).toThrow();
  });
});
