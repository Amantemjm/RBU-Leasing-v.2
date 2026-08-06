import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Integration tests share one PostgreSQL database and reset tables between
    // tests (see tests/helpers.js resetCrudTables). Running test files in
    // parallel workers would let them wipe each other's data mid-test, so files
    // must run serially. The suite is small; the cost is a few extra seconds.
    fileParallelism: false,
  },
});
