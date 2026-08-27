import "dotenv/config";
import { prisma } from "../src/lib/prisma.js";
import { hashPassword, SUPER_ADMIN_EMAIL } from "../src/services/authService.js";
import { seedEstates } from "./estatesSeed.js";

async function main() {
  const email = SUPER_ADMIN_EMAIL;
  // Super admin: always guaranteed present with a known password and ADMIN role.
  await prisma.user.upsert({
    where: { email },
    // Only the ADMIN role is re-asserted on an existing account. The password is
    // deliberately NOT reset here: re-seeding used to clobber a changed admin
    // password back to the default, which browsers flag as breached. Use
    // scripts/set-admin-password.js to change it.
    update: { role: "ADMIN" },
    create: {
      name: "Super Admin", email,
      passwordHash: await hashPassword("admin123"), passwordPlain: "admin123", role: "ADMIN",
    },
  });
  console.log(`seeded super admin ${email} / admin123`);

  await seedEstates(prisma);
  console.log("seeded estate/tower hierarchy");
}
main().finally(() => prisma.$disconnect());
