import "dotenv/config";
import { prisma } from "../src/lib/prisma.js";
import { hashPassword } from "../src/services/authService.js";
import { seedEstates } from "./estatesSeed.js";

async function main() {
  const email = "admin@rbu.local";
  // Super admin: always guaranteed present with a known password and ADMIN role.
  await prisma.user.upsert({
    where: { email },
    update: { passwordHash: await hashPassword("admin123"), passwordPlain: "admin123", role: "ADMIN" },
    create: {
      name: "Super Admin", email,
      passwordHash: await hashPassword("admin123"), passwordPlain: "admin123", role: "ADMIN",
    },
  });
  console.log("seeded super admin admin@rbu.local / admin123");

  await seedEstates(prisma);
  console.log("seeded estate/tower hierarchy");
}
main().finally(() => prisma.$disconnect());
