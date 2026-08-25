-- Restores the recoverable password copy that backs the admin credential list
-- (masked in the Users table, revealed with an eye toggle).
--
-- Nullable on purpose and NOT back-filled: the plaintext dropped by
-- 20260825010000_drop_password_plain is unrecoverable from the bcrypt hash, so
-- accounts that existed before this migration read as "—" until their password
-- is next set or reset.
ALTER TABLE "User" ADD COLUMN "passwordPlain" TEXT;
