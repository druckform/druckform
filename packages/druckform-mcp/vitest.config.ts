import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      thresholds: { lines: 80 },
      exclude: [
        "dist/**",
        "vitest.config.ts",
        "tsup.config.ts",
        "src/index.ts", // process entrypoint, not unit-testable
        "src/mcp-server.ts", // stdio transport setup, not unit-testable
        "src/types.ts", // type declarations only
        "src/tools/**", // thin MCP protocol wrappers around tested business logic
      ],
    },
  },
});
