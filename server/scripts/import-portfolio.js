import "../src/env.js";
import { createRequire } from "module";
import { prisma } from "../src/lib/prisma.js";
import { text, money, toDate, leaseStatus, key } from "../src/lib/importClean.js";
import { towerNameFor } from "../src/lib/towerMap.js";

const require = createRequire(import.meta.url);
const ExcelJS = require("exceljs");

const NOW = new Date(2026, 7, 7); // 2026-08-07
const file = process.argv[2] || "\\\\tsclient\\C\\Users\\taguicmja\\Downloads\\Unit Lease_Residential Leasing.xlsx";

async function main() {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  const ws = wb.getWorksheet("2026");
  if (!ws) throw new Error("Sheet '2026' not found");

  console.log("Wiping existing CRUD tables…");
  await prisma.lease.deleteMany();
  await prisma.unit.deleteMany();
  await prisma.tenant.deleteMany();
  await prisma.unitOwner.deleteMany();

  // Map seeded towers by canonical name so imported units link to a Tower.
  const towerByName = new Map((await prisma.tower.findMany()).map((t) => [t.name, t.id]));

  const owners = new Map();
  const tenants = new Map();
  const units = new Map();
  let leases = 0, skipped = 0;
  const skips = [];

  // Fixed column map (exceljs .values is 1-indexed; v[1] is an unlabeled
  // row-number column that is sometimes empty, sometimes numbered — ignored).
  for (let r = 2; r <= ws.rowCount; r++) {
    const v = ws.getRow(r).values;

    const managedBy = text(v[2]);
    const building = text(v[3]);
    const unitNumber = text(v[4]);
    const unitType = text(v[5]) || "OTHER";
    const floor = text(v[6]);
    const slotNo = text(v[7]);
    const lessor = text(v[8]);
    const lessee = text(v[9]);
    const startDate = toDate(v[10]);
    const endDate = toDate(v[11]);
    const renewalPeriod = text(v[12]);
    const monthlyRent = money(v[13]);
    const advanceRent = text(v[14]);
    const securityDeposit = text(v[15]);
    const modeOfPayment = text(v[16]);
    const serviceFee = text(v[17]);
    const source = text(v[18]);
    const remarks = text(v[19]);

    if (!lessee || !unitNumber || !startDate || !endDate || monthlyRent == null) {
      if (lessee || unitNumber) { skipped++; skips.push({ row: r, lessee, unitNumber }); }
      continue;
    }

    const ownerName = lessor || "Unknown Owner";
    let ownerId = owners.get(key(ownerName));
    if (!ownerId) {
      const o = await prisma.unitOwner.create({ data: { name: ownerName } });
      ownerId = o.id; owners.set(key(ownerName), ownerId);
    }

    let tenantId = tenants.get(key(lessee));
    if (!tenantId) {
      const t = await prisma.tenant.create({ data: { name: lessee } });
      tenantId = t.id; tenants.set(key(lessee), tenantId);
    }

    const uKey = `${key(building)}|${key(unitNumber)}`;
    let unitId = units.get(uKey);
    if (!unitId) {
      const towerId = towerByName.get(towerNameFor(building)) ?? null;
      const u = await prisma.unit.create({
        data: {
          ownerId, unitNumber, building, towerId, floor, slotNo, type: unitType,
          baseRent: monthlyRent, status: "OCCUPIED",
        },
      });
      unitId = u.id; units.set(uKey, unitId);
    }

    await prisma.lease.create({
      data: {
        unitId, tenantId, startDate, endDate, monthlyRent,
        status: leaseStatus(endDate, NOW),
        advanceRent, securityDeposit, modeOfPayment, serviceFee, source, renewalPeriod, remarks, managedBy,
      },
    });
    leases++;
  }

  console.log(`\nImported: ${owners.size} owners, ${tenants.size} tenants, ${units.size} units, ${leases} leases.`);
  console.log(`Skipped ${skipped} incomplete rows.`);
  if (skips.length) console.log("First few skips:", skips.slice(0, 8));
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
