import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { VitePWA } from "vite-plugin-pwa";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  // For GitHub Pages project sites, set ATLAS_BASE=/<repo>/ at build time.
  // Defaults to "/" for local dev and Lovable preview.
  base: process.env.ATLAS_BASE || "/",
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [
    react(),
    mode === "development" && componentTagger(),
    // Production-only PWA. devOptions.enabled = false so the service
    // worker is NEVER active during `vite dev` or in the Lovable editor
    // preview — registration is also iframe/host-guarded in src/main.tsx.
    VitePWA({
      registerType: "prompt",
      injectRegister: null, // we register manually in src/main.tsx
      devOptions: { enabled: false },
      includeAssets: [
        "icons/icon-192.png",
        "icons/icon-512.png",
        "icons/apple-touch-icon.png",
        "robots.txt",
      ],
      manifest: {
        name: "AstrathDeeprealm Atlas",
        short_name: "Astrath Atlas",
        description: "Interactive fantasy world atlas for AstrathDeeprealm.",
        start_url: "./atlas",
        scope: "./",
        display: "standalone",
        theme_color: "#18313f",
        background_color: "#0f1a22",
        icons: [
          { src: "icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icons/icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any maskable" },
        ],
      },
      workbox: {
        // Precache the built shell (HTML/JS/CSS) + small bundled assets.
        globPatterns: ["**/*.{js,css,html,ico,svg,woff2}"],
        // OAuth-style callbacks must always hit the network.
        navigateFallbackDenylist: [/^\/~oauth/, /^\/auth/],
        cleanupOutdatedCaches: true,
        // Allow caching the larger published atlas.json safely.
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
        runtimeCaching: [
          // HTML navigations: network-first so users see new builds.
          {
            urlPattern: ({ request }) => request.mode === "navigate",
            handler: "NetworkFirst",
            options: {
              cacheName: "atlas-html",
              networkTimeoutSeconds: 3,
              expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 7 },
            },
          },
          // Player atlas data: prefer fresh, fall back to cache when offline.
          {
            urlPattern: ({ url }) =>
              url.pathname.endsWith("/atlas/atlas.json") ||
              url.pathname.endsWith("/atlas/search-index.json"),
            handler: "NetworkFirst",
            options: {
              cacheName: "atlas-data",
              networkTimeoutSeconds: 4,
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          // Local atlas assets (maps/images/icons committed to /public/atlas/assets).
          {
            urlPattern: ({ url }) => url.pathname.includes("/atlas/assets/"),
            handler: "CacheFirst",
            options: {
              cacheName: "atlas-assets",
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 60 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          // Google Fonts stylesheet + files.
          {
            urlPattern: ({ url }) => url.origin === "https://fonts.googleapis.com",
            handler: "StaleWhileRevalidate",
            options: { cacheName: "google-fonts-css" },
          },
          {
            urlPattern: ({ url }) => url.origin === "https://fonts.gstatic.com",
            handler: "CacheFirst",
            options: {
              cacheName: "google-fonts-files",
              expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          // External http(s) images (e.g. pinimg) are NOT promised offline,
          // but we cache opportunistically so repeat online visits are fast.
          {
            urlPattern: ({ url, request, sameOrigin }) =>
              request.destination === "image" && !sameOrigin,
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: "external-images",
              expiration: { maxEntries: 60, maxAgeSeconds: 60 * 60 * 24 * 14 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime", "@tanstack/react-query", "@tanstack/query-core"],
  },
}));
