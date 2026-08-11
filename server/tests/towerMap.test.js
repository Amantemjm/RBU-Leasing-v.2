import { describe, it, expect } from "vitest";
import { towerNameFor } from "../src/lib/towerMap.js";

describe("towerNameFor (decode column C)", () => {
  it("maps Maven wings to Maven at Capitol Commons", () => {
    expect(towerNameFor("MAVEN SOUTH")).toBe("Maven at Capitol Commons");
    expect(towerNameFor("Maven North")).toBe("Maven at Capitol Commons");
  });
  it("maps Royalton / Imperium (Capitol Commons)", () => {
    expect(towerNameFor("Royalton in CC")).toBe("The Royalton at Capitol Commons");
    expect(towerNameFor("IMPERIUM")).toBe("The Imperium at Capitol Commons");
  });
  it("maps Avila / AST / ANT to Avila North and South", () => {
    expect(towerNameFor("CV AST")).toBe("Avila North and South");
    expect(towerNameFor("CV ANT")).toBe("Avila North and South");
    expect(towerNameFor("CV Avila South")).toBe("Avila North and South");
  });
  it("maps the Circulo Verde towers", () => {
    expect(towerNameFor("CV Ibiza Tower")).toBe("Ibiza Tower");
    expect(towerNameFor("CV Seville")).toBe("Seville Residences");
    expect(towerNameFor("CV Lleida")).toBe("Lleida Tower");
    expect(towerNameFor("CV Majorca Tower")).toBe("Majorca Residences");
  });
  it("maps Connor / Viridian (Greenhills) and Maple (Ortigas East)", () => {
    expect(towerNameFor("CONNOR")).toBe("Connor at Greenhills");
    expect(towerNameFor("Viridian in GH")).toBe("Viridian in Greenhills");
    expect(towerNameFor("Maple")).toBe("Maple at Verdant Towers");
  });
  it("returns null for unknown / ambiguous values", () => {
    expect(towerNameFor("ICC")).toBeNull();
    expect(towerNameFor("Glaston")).toBeNull();
    expect(towerNameFor("VGCC")).toBeNull();
    expect(towerNameFor("")).toBeNull();
    expect(towerNameFor(null)).toBeNull();
  });
});
