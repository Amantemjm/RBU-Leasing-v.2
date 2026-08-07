// Loads server/.env by absolute path (relative to this file), so it works no
// matter what the process working directory is — e.g. when launched as a
// Windows Service, whose CWD is not the server folder. Imported first in
// index.js, before any module that reads process.env (Prisma, JWT).
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config({ path: path.join(path.dirname(fileURLToPath(import.meta.url)), "../.env") });
