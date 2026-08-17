// Seeds a small, realistic portfolio for demo/testing: owners (each assigned to
// a Leasing Officer), units in the seeded Ortigas towers, tenants, and leases
// (some units occupied, some left vacant). Re-runnable — clears the portfolio
// first. Does NOT touch users, estates, or towers.
import "../src/env.js";
import { prisma } from "../src/lib/prisma.js";

async function main() {
  await prisma.lease.deleteMany();
  await prisma.unit.deleteMany();
  await prisma.tenant.deleteMany();
  await prisma.unitOwner.deleteMany();

  const officers = Object.fromEntries(
    (await prisma.user.findMany({ where: { role: "LEASING_OFFICER" } })).map((o) => [o.email, o.id]),
  );
  const towers = Object.fromEntries((await prisma.tower.findMany()).map((t) => [t.name, t.id]));

  const MARK = officers["markhangka@sales-ortigas.com.ph"];
  const LEAH = officers["leah.fallorina@sales-ortigas.com.ph"];
  const JON = officers["leasing.leciasja@sales-ortigas.com.ph"];

  const ownerDefs = [
    { name: "Capitol Heights Holdings", officer: MARK, tower: "Maven at Capitol Commons", email: "capitol.heights@example.com", phone: "0917-100-0001" },
    { name: "Imperium Property Group", officer: MARK, tower: "The Imperium at Capitol Commons", email: "imperium.pg@example.com", phone: "0917-100-0002" },
    { name: "Circulo Verde Estates", officer: LEAH, tower: "Ibiza Tower", email: "circulo.verde@example.com", phone: "0917-100-0003" },
    { name: "Majorca Realty", officer: LEAH, tower: "Majorca Residences", email: "majorca.realty@example.com", phone: "0917-100-0004" },
    { name: "Greenhills Property Corp", officer: JON, tower: "Viridian in Greenhills", email: "greenhills.pc@example.com", phone: "0917-100-0005" },
    { name: "Galleon Land Inc", officer: JON, tower: "Residences at The Galleon", email: "galleon.land@example.com", phone: "0917-100-0006" },
  ];

  const unitTemplates = [
    { type: "STUDIO", sizeSqm: 28, baseRent: 22000, floor: "12" },
    { type: "1BR", sizeSqm: 42, baseRent: 35000, floor: "15" },
    { type: "2BR", sizeSqm: 65, baseRent: 55000, floor: "18" },
  ];

  const units = []; // { id, baseRent }
  for (const [i, od] of ownerDefs.entries()) {
    const owner = await prisma.unitOwner.create({
      data: { name: od.name, email: od.email, phone: od.phone, address: "Ortigas Center, Pasig City", assignedOfficerId: od.officer },
    });
    for (const [j, ut] of unitTemplates.entries()) {
      const u = await prisma.unit.create({
        data: {
          ownerId: owner.id, towerId: towers[od.tower] || null,
          unitNumber: `${10 + i}${String.fromCharCode(65 + j)}`,
          building: od.tower, floor: ut.floor, type: ut.type, sizeSqm: ut.sizeSqm,
          baseRent: ut.baseRent, status: "VACANT", approvalStatus: "APPROVED",
        },
      });
      units.push({ id: u.id, baseRent: ut.baseRent });
    }
  }

  const tenantNames = [
    "Maria Clara Santos", "Jose Rizal Cruz", "Andres Bonifacio Reyes", "Gabriela Silang Torres",
    "Emilio Aguinaldo Lim", "Melchora Aquino Tan", "Apolinario Mabini Garcia", "Juan Luna Ramos",
  ];
  const tenants = [];
  for (const [i, name] of tenantNames.entries()) {
    tenants.push(await prisma.tenant.create({
      data: { name, email: `tenant${i + 1}@example.com`, phone: `0918-200-00${String(i + 1).padStart(2, "0")}`, address: "Metro Manila" },
    }));
  }

  // Lease a spread of units so every officer has a mix of occupied and vacant:
  // each owner's first unit (indices 0,3,6,…) plus two extras. The rest stay VACANT.
  const leaseIndices = [0, 3, 6, 9, 12, 15, 1, 10];
  for (let i = 0; i < leaseIndices.length && i < tenants.length; i++) {
    const u = units[leaseIndices[i]];
    const start = new Date(2026, i % 12, 1);
    const end = new Date(start.getFullYear() + 1, start.getMonth(), start.getDate());
    await prisma.lease.create({
      data: { unitId: u.id, tenantId: tenants[i].id, startDate: start, endDate: end, monthlyRent: u.baseRent, deposit: u.baseRent * 2, status: "ACTIVE" },
    });
    await prisma.unit.update({ where: { id: u.id }, data: { status: "OCCUPIED" } });
  }

  console.log("Seeded test data:", {
    owners: await prisma.unitOwner.count(),
    units: await prisma.unit.count(),
    tenants: await prisma.tenant.count(),
    leases: await prisma.lease.count(),
  });
}

main().then(() => prisma.$disconnect()).catch((e) => { console.error(e); process.exit(1); });
