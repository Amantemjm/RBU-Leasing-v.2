import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "../src/lib/prisma.js";
import { resetCrudTables } from "./helpers.js";
import { seedEstates, ESTATE_HIERARCHY } from "../prisma/estatesSeed.js";

beforeEach(async () => { await resetCrudTables(); });

describe("seedEstates", () => {
  it("creates the full estate/tower hierarchy", async () => {
    await seedEstates(prisma);
    const estates = await prisma.estate.findMany({ include: { towers: true } });
    expect(estates).toHaveLength(5);
    expect(await prisma.tower.count()).toBe(15);

    const capitol = estates.find((e) => e.name === "Capitol Commons");
    expect(capitol.towers.map((t) => t.name).sort()).toEqual([
      "Empress at Capitol Commons",
      "Maven at Capitol Commons",
      "The Imperium at Capitol Commons",
      "The Royalton at Capitol Commons",
    ]);
    // every configured tower is present
    const totalConfigured = Object.values(ESTATE_HIERARCHY).reduce((n, t) => n + t.length, 0);
    expect(totalConfigured).toBe(15);
  });

  it("is idempotent — running twice does not duplicate", async () => {
    await seedEstates(prisma);
    await seedEstates(prisma);
    expect(await prisma.estate.count()).toBe(5);
    expect(await prisma.tower.count()).toBe(15);
  });
});
