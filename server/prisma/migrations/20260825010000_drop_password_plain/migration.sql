-- Passwords are known only to the account holder: drop the recoverable
-- plaintext copy that backed the admin credential list. Irreversible by
-- design — an admin can reset a password but can never read one.
ALTER TABLE "User" DROP COLUMN "passwordPlain";
