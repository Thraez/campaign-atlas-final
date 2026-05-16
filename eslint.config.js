import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist", ".claude/worktrees/**", "dist-ssr"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      "react-hooks/refs": "error",
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-unused-vars": "off",
      "@typescript-eslint/no-explicit-any": "off",
      // Guardrail: this project is ESM ("type": "module"). A dynamic
      // require() inside vite.config.ts (or anything it bundles, e.g.
      // scripts/vite-plugin-atlas-save.ts) becomes an illegal runtime
      // `Dynamic require of "X" is not supported` and crashes the dev
      // server mid-save. Use a static `import` (Node paths) or
      // `await import()` (lazy/browser-safe paths) instead. Distinct from
      // @typescript-eslint/no-require-imports so a copied disable comment
      // can't silently reintroduce the crash.
      "no-restricted-syntax": [
        "error",
        {
          selector: "CallExpression[callee.name='require']",
          message:
            "require() is banned in this ESM project — it crashes the bundled vite.config/save server. Use `import` or `await import()`.",
        },
      ],
    },
  },
);
