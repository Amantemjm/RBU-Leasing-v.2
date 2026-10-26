-- The application no longer writes or reads User."passwordPlain": a password is
-- something the system checks, not something it can tell you. This clears the
-- readable copies stored before that change, so a database dump no longer holds
-- anyone's real password.
--
-- The column itself is kept, so existing backups and the schema stay valid;
-- dropping it is a separate decision. Idempotent: a second run finds nothing to
-- clear. Plain SQL — no DO block, which cannot run on the office machine.
UPDATE "User" SET "passwordPlain" = NULL WHERE "passwordPlain" IS NOT NULL;
