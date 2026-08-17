// Runs before any test module is imported (Vitest setupFiles). Vite has already
// loaded server/.env into process.env by now (pointing at the Dev DB); we force
// the dedicated test database on top so the destructive integration suite
// (resetCrudTables) never touches Dev data. override:true is required because
// dotenv will not replace an already-set variable otherwise.
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config({
  path: path.join(path.dirname(fileURLToPath(import.meta.url)), "../.env.test"),
  override: true,
});
