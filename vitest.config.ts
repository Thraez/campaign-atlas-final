import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react-swc";
import path from "path";

export default defineConfig({
  plugins: [react()],
  // Mirror the build-time flag from vite.config.ts so editor-gated code
  // (src/App.tsx, src/pages/Landing.tsx, etc.) compiles under tests.
  // Tests run as if the editor build is enabled; per-test gate behavior is
  // exercised via runtime mocks of isDmToolsEnabled().
  define: { __INCLUDE_EDITOR__: "true" },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
