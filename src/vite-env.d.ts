/// <reference types="vite/client" />

// Build-time flag injected by vite.config.ts `define`. True in dev / editor
// builds, false in player production builds — used to dead-code the editor
// route and AtlasPlacementEditor import in src/App.tsx.
declare const __INCLUDE_EDITOR__: boolean;
