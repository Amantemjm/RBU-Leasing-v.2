// Sets a new password for the seeded admin (admin@rbu.local).
// Usage:  node scripts/set-admin-password.js "<new-password>"   (min 8 chars)
// Run this before exposing the app on the network.
import "../src/env.js";
import { prisma } from "../src/lib/prisma.js";
import { hashPassword } from "../src/services/authService.js";

const pw = process.argv[2];
if (!pw || pw.length < 8) {
  console.error('Usage: node scripts/set-admin-password.js "<new-password>"  (min 8 chars)');
  process.exit(1);
}

try {
  const passwordHash = await hashPassword(pw);
  const user = await prisma.user.update({
    where: { email: "admin@rbu.local" },
    data: { passwordHash },
  });
  console.log(`Password updated for ${user.email}.`);
} catch (err) {
  console.error("Failed to update password:", err.message);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
