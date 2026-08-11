// Backfill Unit.towerId from the free-text `building` (column C) using the
// tower decoder. Run:  node scripts/backfill-towers.js
import "../src/env.js";
import { prisma } from "../src/lib/prisma.js";
import { towerNameFor } from "../src/lib/towerMap.js";

async function main() {
  const byName = new Map((await prisma.tower.findMany()).map((t) => [t.name, t.id]));
  const units = await prisma.unit.findMany({ where: { towerId: null } });

  let updated = 0;
  const unmapped = new Map();
  for (const u of units) {
    const towerId = byName.get(towerNameFor(u.building)) ?? null;
    if (towerId) {
      await prisma.unit.update({ where: { id: u.id }, data: { towerId } });
      updated++;
    } else if (u.building) {
      unmapped.set(u.building, (unmapped.get(u.building) || 0) + 1);
    }
  }

  console.log(`Backfilled towerId on ${updated} unit(s).`);
  if (unmapped.size) {
    console.log("Unmapped building values (left unassigned):");
    for (const [b, n] of [...unmapped].sort((a, b) => b[1] - a[1])) console.log(`  ${n}  ${JSON.stringify(b)}`);
  }
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
