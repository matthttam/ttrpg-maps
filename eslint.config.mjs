import tsParser from "@typescript-eslint/parser";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import obsidianmd from "eslint-plugin-obsidianmd";

export default [
  {
    files: ["src/**/*.ts"],
    ignores: ["src/**/*.test.ts", "src/__mocks__/**"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: "./tsconfig.json",
      },
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
      obsidianmd,
    },
    rules: {
      ...obsidianmd.configs.recommended,
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-floating-promises": "error",
      "no-restricted-globals": ["error", "confirm"],
    },
  },
  {
    files: ["src/**/*.test.ts", "src/__mocks__/**"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: "./tsconfig.json",
      },
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
      obsidianmd,
    },
    rules: {
      ...obsidianmd.configs.recommended,
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-floating-promises": "off",
      "no-restricted-globals": "off",
    },
  },
];
