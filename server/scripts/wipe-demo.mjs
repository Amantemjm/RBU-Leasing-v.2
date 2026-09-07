// Clears every module's data, keeping only the ADMIN login and the
// estate/tower catalogue (reference data that units point at).
//
// Deletion order follows the foreign keys: inquiries reference users, users
// reference owners/tenants, so those go last.
//
// Destructive. Back up first:
//   pg_dump -h localhost -U postgres -d rbu_leasing -f backups/<stamp>.sql
import "dotenv/config";
import { prisma } from "../src/lib/prisma.js";

const admin = await prisma.user.findFirst({ where: { role: "ADMIN" }, select: { id: true, name: true, email: true } });
if (!admin) throw new Error("No ADMIN user found — refusing to wipe, you would be locked out.");

const steps = [
  ["auditLog", () => prisma.auditLog.deleteMany()],
  ["transactionEvent", () => prisma.transactionEvent.deleteMany()],
  ["transactionDocument", () => prisma.transactionDocument.deleteMany()],
  ["approvalStep", () => prisma.approvalStep.deleteMany()],
  ["appointment", () => prisma.appointment.deleteMany()],
  ["leasingTransaction", () => prisma.leasingTransaction.deleteMany()],
  ["inquiry", () => prisma.inquiry.deleteMany()],
  ["lease", () => prisma.lease.deleteMany()],
  ["unitPhoto", () => prisma.unitPhoto.deleteMany()],
  ["unitListing", () => prisma.unitListing.deleteMany()],
  ["unit", () => prisma.unit.deleteMany()],
  ["requirement", () => prisma.requirement.deleteMany()],
  ["lessorRequirement", () => prisma.lessorRequirement.deleteMany()],
  ["lesseeRequirement", () => prisma.lesseeRequirement.deleteMany()],
  ["lessorInfoSheet", () => prisma.lessorInfoSheet.deleteMany()],
  ["lesseeInfoSheet", () => prisma.lesseeInfoSheet.deleteMany()],
  ["pageFormEntry", () => prisma.pageFormEntry.deleteMany()],
  ["pageForm", () => prisma.pageForm.deleteMany()],
  ["cmsForm", () => prisma.cmsForm.deleteMany()],
  ["user (all but admin)", () => prisma.user.deleteMany({ where: { NOT: { id: admin.id } } })],
  ["tenant", () => prisma.tenant.deleteMany()],
  ["unitOwner", () => prisma.unitOwner.deleteMany()],
];

console.log(`Keeping admin: ${admin.name} (${admin.email})`);
for (const [name, fn] of steps) {
  try {
    const r = await fn();
    if (r.count) console.log(`${String(r.count).padStart(6)}  deleted from ${name}`);
  } catch (e) {
    console.log(`  SKIP ${name} — ${e.message.split("\n")[0].slice(0, 90)}`);
  }
}
console.log(`\nKept: ${await prisma.estate.count()} estates, ${await prisma.tower.count()} towers, ${await prisma.user.count()} user`);
await prisma.$disconnect();
