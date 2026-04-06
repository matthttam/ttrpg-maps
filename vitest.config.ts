import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "jsdom",
    setupFiles: ["tests/__mocks__/obsidian-dom.ts"],
    include: ["tests/**/*.test.ts"],
    alias: {
      obsidian: path.resolve(__dirname, "tests/__mocks__/obsidian.ts"),
    },
    coverage: {
      include: [
        "src/utils/**/*.ts",
        "src/map/**/*.ts",
        "src/types.ts",
        "src/distance.ts",
        "src/DataManager.ts",
      ],
    },
  },
});
