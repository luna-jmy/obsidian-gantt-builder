import js from "@eslint/js";
import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";
import obsidianmdModule from "eslint-plugin-obsidianmd";

const obsidianmd = obsidianmdModule.default ?? obsidianmdModule;

export default defineConfig(
  {
    ignores: ["eslint.config.mjs", "main.js", "node_modules/**"],
  },
  {
    ...js.configs.recommended,
    languageOptions: {
      globals: {
        atob: "readonly",
        console: "readonly",
        crypto: "readonly",
        document: "readonly",
        Image: "readonly",
        navigator: "readonly",
        process: "readonly",
        URL: "readonly",
      },
    },
  },
  ...tseslint.configs.recommendedTypeChecked.map((config) => ({
    ...config,
    files: ["**/*.ts"],
  })),
  ...obsidianmd.configs.recommended,
  {
    files: ["**/*.ts"],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        project: "./tsconfig.json",
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/await-thenable": "error",
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": [
        "error",
        {
          checksVoidReturn: true,
        },
      ],
      "@typescript-eslint/no-unnecessary-type-assertion": "error",
      "@typescript-eslint/require-await": "error",
      "obsidianmd/ui/sentence-case": "error",
    },
  },
);
