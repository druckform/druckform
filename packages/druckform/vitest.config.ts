import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Vitest's 5s default is a unit-test budget, and several of these are
    // integration tests that esbuild-transpile every component of every
    // bundled template. Standalone they run in 1-3s, but the parallel pool
    // inflates wall time several-fold, so they timed out sporadically and were
    // written off as "known flakes" — which cost more time in investigation and
    // standalone re-runs than the tests themselves take. Nothing here asserts
    // timing, so a generous budget loses no coverage.
    testTimeout: 30_000,
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      thresholds: { lines: 80 },
      exclude: [
        "src/diagram/**",
        "src/latex/tectonic.ts",
        // CLI entry-point: thin yargs wiring whose handlers just call command
        // functions that are themselves tested. The argv-parsing layer isn't
        // meaningfully unit-testable.
        "src/cli.ts",
        "dist/**",
        "vitest.config.ts",
        "tsup.config.ts",
        // Test fixtures and support code.
        "tests/**",
        // Bundled template components are loaded via an esbuild temp-file, so v8
        // can't attribute coverage to their source — their behavior is covered by
        // the block-component / tokens-to-latex / document-component tests instead.
        "templates/**",
      ],
    },
  },
});
