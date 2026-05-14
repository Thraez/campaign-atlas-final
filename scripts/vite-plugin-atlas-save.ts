/**
 * Vite dev-server plugin: POST /__atlas/save → write allowlisted source files
 * directly to disk in the local repository.
 *
 * apply: "serve" — physically excluded from production builds. No GitHub
 * API, no PAT, no auth. Vite's default localhost binding is the only access
 * control.
 */
import type { Plugin } from "vite";
import fs from "node:fs/promises";
import path from "node:path";
import { isWritableSourcePath } from "../src/atlas/save/sourcePathAllowlist";

const MAX_FILE_BYTES = 1024 * 1024;

export interface FileChange {
  path: string;
  contents: string;
}

export type HandlerResult =
  | { status: 200; payload: { written: number; paths: string[] } }
  | { status: 400 | 500; payload: { error: string; [k: string]: unknown } };

function isFileChange(v: unknown): v is FileChange {
  return (
    !!v && typeof v === "object" &&
    typeof (v as FileChange).path === "string" &&
    typeof (v as FileChange).contents === "string"
  );
}

export async function handleSaveRequest(
  body: unknown,
  repoRoot: string,
): Promise<HandlerResult> {
  if (!body || typeof body !== "object" || !Array.isArray((body as { changes?: unknown }).changes)) {
    return { status: 400, payload: { error: "InvalidBody", detail: "expected { changes: FileChange[] }" } };
  }
  const changes = (body as { changes: unknown[] }).changes;
  if (changes.length === 0) {
    return { status: 400, payload: { error: "InvalidBody", detail: "changes array is empty" } };
  }
  for (const c of changes) {
    if (!isFileChange(c)) {
      return { status: 400, payload: { error: "InvalidBody", detail: "each change must be { path, contents }" } };
    }
  }
  const list = changes as FileChange[];

  // Validate everything BEFORE writing anything (atomicity).
  for (const c of list) {
    if (!isWritableSourcePath(c.path)) {
      return { status: 400, payload: { error: "DisallowedPath", path: c.path } };
    }
  }
  for (const c of list) {
    const bytes = Buffer.byteLength(c.contents, "utf8");
    if (bytes > MAX_FILE_BYTES) {
      return { status: 400, payload: { error: "OversizedContent", path: c.path, bytes } };
    }
  }

  for (const c of list) {
    const abs = path.resolve(repoRoot, c.path);
    try {
      await fs.mkdir(path.dirname(abs), { recursive: true });
      await fs.writeFile(abs, c.contents, "utf8");
    } catch (e) {
      return {
        status: 500,
        payload: { error: "WriteFailed", path: c.path, detail: (e as Error).message },
      };
    }
  }

  return {
    status: 200,
    payload: { written: list.length, paths: list.map((c) => c.path) },
  };
}

export function atlasSavePlugin(): Plugin {
  return {
    name: "atlas-save",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use("/__atlas/save", (req, res, next) => {
        if (req.method !== "POST") return next();
        let raw = "";
        req.setEncoding("utf8");
        req.on("data", (chunk: string) => { raw += chunk; });
        req.on("end", async () => {
          let body: unknown;
          try {
            body = JSON.parse(raw);
          } catch {
            res.statusCode = 400;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ error: "InvalidBody", detail: "request body is not JSON" }));
            return;
          }
          const result = await handleSaveRequest(body, server.config.root);
          res.statusCode = result.status;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify(result.payload));
        });
      });
    },
  };
}