import { useCallback, useRef, useState } from "react";
import type { EntityVisibility } from "@/atlas/content/schema";
import { isValidVisibility } from "@/atlas/content/visibility";
import { parseFrontmatter } from "@/atlas/import/frontmatter";

export interface EntityEditFields {
  id: string;
  type: string;
  visibility: EntityVisibility;
  summary: string;
}
export interface DraftSecret {
  id: string;
  for?: string;
  password?: string;
  teaser?: string;
  reveal: string;
}
export interface EntityEditDraft {
  sourcePath: string;
  baseHash: string;
  fields: EntityEditFields;
  body: string;
  secrets: DraftSecret[];
  pristine: string;
}
export type EntityEditSnapshot = EntityEditDraft | null;
export type EntityEditDraftInit = Omit<EntityEditDraft, "pristine" | "secrets"> & {
  secrets?: DraftSecret[];
};

/** What the entity panel edits: the four atlas fields, the body and the secrets. */
export interface EntityEditContent {
  fields: EntityEditFields;
  body: string;
  secrets: DraftSecret[];
}

function fingerprint(fields: EntityEditFields, body: string, secrets: DraftSecret[]): string {
  return JSON.stringify({ fields, body, secrets });
}

/** The draft's view of an entity file as it sits on disk. */
export function draftContentFromDisk(raw: string): EntityEditContent {
  const fm = parseFrontmatter(raw);
  const atlas = (fm.data.atlas as Record<string, unknown>) ?? {};
  return {
    fields: {
      id: String(atlas.id ?? ""),
      type: String(atlas.type ?? ""),
      visibility: isValidVisibility(atlas.visibility) ? atlas.visibility : "dm",
      summary: String(atlas.summary ?? ""),
    },
    body: fm.content,
    secrets: Array.isArray(atlas.secrets) ? (atlas.secrets as DraftSecret[]) : [],
  };
}

export interface RebaseOutcome {
  /** The DM changed the body and so did the disk: the DM's body wins on Save. */
  bodyOverwritten: boolean;
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Move a draft onto a newer file. Per field (id, type, visibility, summary),
 * body and secrets list: what the DM changed since the draft's base
 * (`pristine`) is kept; anything they didn't touch takes the disk's value.
 * `baseHash` and `pristine` become the new file's. Null when the draft is for
 * another sourcePath.
 */
export function rebaseDraft(
  d: EntityEditDraft,
  sourcePath: string,
  baseHash: string,
  disk: EntityEditContent,
): { draft: EntityEditDraft; outcome: RebaseOutcome } | null {
  if (d.sourcePath !== sourcePath) return null;
  const base = JSON.parse(d.pristine) as EntityEditContent;
  const pick = <T>(mine: T, was: T, theirs: T): T => (same(mine, was) ? theirs : mine);
  const fields = { ...d.fields };
  for (const k of Object.keys(fields) as Array<keyof EntityEditFields>) {
    (fields as Record<string, unknown>)[k] = pick(d.fields[k], base.fields[k], disk.fields[k]);
  }
  const bodyMine = d.body !== base.body;
  const bodyOverwritten = bodyMine && disk.body !== base.body && disk.body !== d.body;
  const body = pick(d.body, base.body, disk.body);
  const secrets = pick(d.secrets, base.secrets, disk.secrets);
  return {
    draft: {
      ...d,
      baseHash,
      fields,
      body,
      secrets,
      pristine: fingerprint(disk.fields, disk.body, disk.secrets),
    },
    outcome: { bodyOverwritten },
  };
}

export interface EntityEditDraftAPI {
  draft: EntityEditDraft | null;
  load: (init: EntityEditDraftInit) => void;
  setField: <K extends keyof EntityEditFields>(k: K, v: EntityEditFields[K]) => void;
  setBody: (b: string) => void;
  setSecrets: (updater: DraftSecret[] | ((prev: DraftSecret[]) => DraftSecret[])) => void;
  clear: () => void;
  isDirty: () => boolean;
  snapshot: () => EntityEditSnapshot;
  applySnapshot: (s: EntityEditSnapshot) => void;
  /**
   * Move the draft onto the file now on disk (see `rebaseDraft`). Returns null
   * and changes nothing when the live draft is for another sourcePath.
   */
  rebase: (sourcePath: string, baseHash: string, disk: EntityEditContent) => RebaseOutcome | null;
}

export function useEntityEditDraft(): EntityEditDraftAPI {
  const [draft, setDraft] = useState<EntityEditDraft | null>(null);
  const ref = useRef<EntityEditDraft | null>(null);
  // Mirror draft into ref synchronously so snapshot/isDirty closures always
  // read the latest value without needing to be re-created on each render.
  // eslint-disable-next-line react-hooks/refs
  ref.current = draft;

  const load = useCallback((init: EntityEditDraftInit) => {
    const secrets = init.secrets ?? [];
    setDraft({ ...init, secrets, pristine: fingerprint(init.fields, init.body, secrets) });
  }, []);
  const setField = useCallback(<K extends keyof EntityEditFields>(k: K, v: EntityEditFields[K]) => {
    setDraft((d) => (d ? { ...d, fields: { ...d.fields, [k]: v } } : d));
  }, []);
  const setBody = useCallback((b: string) => {
    setDraft((d) => (d ? { ...d, body: b } : d));
  }, []);
  const setSecrets = useCallback(
    (updater: DraftSecret[] | ((prev: DraftSecret[]) => DraftSecret[])) => {
      setDraft((d) => {
        if (!d) return d;
        const next =
          typeof updater === "function"
            ? (updater as (prev: DraftSecret[]) => DraftSecret[])(d.secrets)
            : updater;
        return { ...d, secrets: next };
      });
    },
    [],
  );
  const clear = useCallback(() => setDraft(null), []);
  const isDirty = useCallback(
    () =>
      !!ref.current &&
      fingerprint(ref.current.fields, ref.current.body, ref.current.secrets) !==
        ref.current.pristine,
    [],
  );
  const snapshot = useCallback<() => EntityEditSnapshot>(() => ref.current, []);
  const applySnapshot = useCallback((s: EntityEditSnapshot) => setDraft(s), []);
  const rebase = useCallback<EntityEditDraftAPI["rebase"]>((sourcePath, baseHash, disk) => {
    // The outcome is read from the latest rendered draft; the updater applies
    // the same rule to whatever state is current when React runs it.
    const now = ref.current ? rebaseDraft(ref.current, sourcePath, baseHash, disk) : null;
    if (!now) return null;
    setDraft((d) => (d ? (rebaseDraft(d, sourcePath, baseHash, disk)?.draft ?? d) : d));
    return now.outcome;
  }, []);

  return {
    draft,
    load,
    setField,
    setBody,
    setSecrets,
    clear,
    isDirty,
    snapshot,
    applySnapshot,
    rebase,
  };
}
