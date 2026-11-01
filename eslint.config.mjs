import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";

import convexPlugin from "@convex-dev/eslint-plugin";

export default defineConfig([
  { ignores: ["convex/_generated/**", "dist/**", ".context/**"] },

  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },

  ...convexPlugin.configs.recommended,
]);
