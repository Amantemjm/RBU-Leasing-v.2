import "dotenv/config";
import { prisma } from "../src/lib/prisma.js";
import { hashPassword } from "../src/services/authService.js";
import { seedEstates } from "./estatesSeed.js";

async function main() {
  const email = "admin@rbu.local";
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log("admin exists");
  } else {
    await prisma.user.create({
      data: {
        name: "RBU Admin",
        email,
        passwordHash: await hashPassword("admin123"),
        role: "ADMIN",
      },
    });
    console.log("seeded admin@rbu.local / admin123");
  }

  await seedEstates(prisma);
  console.log("seeded estate/tower hierarchy");
}
main().finally(() => prisma.$disconnect());
