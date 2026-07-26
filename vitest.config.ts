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
    include: ["src/**/*.{test,spec}.{ts,tsx}", "scripts/**/*.test.ts"],
    testTimeout: 60_000,
    hookTimeout: 60_000,
    teardownTimeout: 30_000,
    // Fork pool with a bounded worker count: on a 4GB CI/dev-machine budget,
    // vitest's default (one worker per CPU core, unbounded) piles up enough
    // concurrent jsdom heaps across this suite's ~200 files to OOM the
    // coordinator. Forks (separate processes, isolate: true) reclaim memory
    // on exit unlike threads sharing one V8 heap, and capping at 3 keeps
    // peak concurrent memory bounded without serializing the whole run.
    pool: "forks",
    poolOptions: {
      forks: {
        maxForks: 3,
        minForks: 1,
        isolate: true,
      },
    },
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      // Signal for the risky surfaces (secret scrubbing, Save, build); the
      // shadcn ui primitives and test files are noise here.
      include: ["src/**/*.{ts,tsx}", "scripts/atlas/**/*.ts"],
      exclude: [
        "src/test/**",
        "src/**/*.test.{ts,tsx}",
        "src/components/ui/**",
        "**/*.d.ts",
      ],
    },
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
