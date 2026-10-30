/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "happy-dom",
    include: ["**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      include: ["src/framework/**/*.ts", "src/demo/services/VendorService.ts"],
      exclude: [
        "node_modules/**",
        "**/*.config.*",
        "**/*.d.ts",
        "**/*.test.ts",
        "**/types/**",
      ],
      // Global floor for the whole runtime (ratchet upward as tests are
      // added); the pure utility modules keep their original strict bar.
      thresholds: {
        statements: 20,
        branches: 18,
        functions: 22,
        lines: 20,
        "src/framework/utils/{CartUtils,PlacementUtils}.ts": {
          statements: 80,
          branches: 65,
          functions: 95,
          lines: 80,
        },
      },
    },
  },
});
