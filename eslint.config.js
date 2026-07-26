import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist", ".claude/**", "dist-ssr", "coverage"] },
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
  {
    // Guardrail: these are the player-graph entry modules — main.tsx, App.tsx,
    // and the lazy-loaded non-editor routes. A static import of editor code here
    // would defeat the __INCLUDE_EDITOR__ tree-shake (invariant 4 in
    // docs/CODEBASE_MAP.md) and ship DM tooling into the player bundle. This is
    // a fast lint tripwire in front of the build-time EDITOR_CODE_FINGERPRINTS
    // scan in scripts/check-no-secrets.ts. Dynamic import()/lazy() is exempt by
    // rule design — App.tsx's editor route uses it deliberately.
    files: [
      "src/main.tsx",
      "src/App.tsx",
      "src/pages/Landing.tsx",
      "src/pages/AtlasViewer.tsx",
      "src/pages/AtlasTimeline.tsx",
      "src/pages/AtlasBrowse.tsx",
      "src/pages/AtlasCredits.tsx",
      "src/pages/NotFound.tsx",
      "src/atlas/secrets/CharacterSecretsPage.tsx",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["*/pages/AtlasPlacementEditor", "@/pages/AtlasPlacementEditor"],
              message:
                "AtlasPlacementEditor is editor-only. Load it via dynamic import()/lazy() (see App.tsx), never a static import, so it stays tree-shaken out of player builds.",
            },
            {
              group: ["*/atlas/save/*", "@/atlas/save/*"],
              message:
                "@/atlas/save/* is editor-only save-flow code. Player entry points must not import it — it would ship editor logic into the player build.",
            },
          ],
        },
      ],
    },
  },
);
