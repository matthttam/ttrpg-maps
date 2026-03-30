import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "jsdom",
    setupFiles: ["src/__mocks__/obsidian-dom.ts"],
    include: ["src/**/*.test.ts"],
    alias: {
      obsidian: path.resolve(__dirname, "src/__mocks__/obsidian.ts"),
    },
    coverage: {
      include: [
        "src/utils/**/*.ts",
        "src/map/**/*.ts",
        "src/types.ts",
        "src/distance.ts",
        "src/DataManager.ts",
      ],
      exclude: [
        "src/**/*.test.ts",
        "src/__mocks__/**",
      ],
    },
  },
});
