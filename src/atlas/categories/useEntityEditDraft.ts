import { useCallback, useRef, useState } from "react";
import type { EntityVisibility } from "@/atlas/content/schema";

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

function fingerprint(fields: EntityEditFields, body: string, secrets: DraftSecret[]): string {
  return JSON.stringify({ fields, body, secrets });
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

  return { draft, load, setField, setBody, setSecrets, clear, isDirty, snapshot, applySnapshot };
}
