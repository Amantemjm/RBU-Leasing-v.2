import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Integration tests share one PostgreSQL database and reset tables between
    // tests (see tests/helpers.js resetCrudTables). Running test files in
    // parallel workers would let them wipe each other's data mid-test, so files
    // must run serially. The suite is small; the cost is a few extra seconds.
    fileParallelism: false,
    // Force the dedicated test database (rbu_leasing_test) before any test or
    // Prisma client loads, so the destructive suite never touches Dev data.
    setupFiles: ["./tests/setup.env.js"],
  },
});
