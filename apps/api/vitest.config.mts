import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    // Every suite here is hermetic: Playwright, fetch and the network are
    // stubbed. Opt-in live checks live outside this suite (docs/TESTING.md).
    restoreMocks: true,
  },
});
