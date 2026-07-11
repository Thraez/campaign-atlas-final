/**
 * Shared result types for the two publish endpoints.
 * Canonical definitions live in src/atlas/publish/publishTypes.ts
 * (so client UI can import them without crossing the tsconfig.app boundary).
 * This re-export makes them available to scripts/ without duplication.
 */
export type {
  PublishScanReason,
  PublishCheckResult,
  PublishPushResult,
} from "../../src/atlas/publish/publishTypes";
