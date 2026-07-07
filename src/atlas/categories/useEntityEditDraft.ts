import { useCallback, useRef, useState } from "react";
import type { EntityVisibility } from "@/atlas/content/schema";

export interface EntityEditFields {
  id: string;
  type: string;
  visibility: EntityVisibility;
  summary: string;
}
export interface EntityEditDraft {
  sourcePath: string;
  baseHash: string;
  fields: EntityEditFields;
  body: string;
  pristine: string;
}
export type EntityEditSnapshot = EntityEditDraft | null;

function fingerprint(fields: EntityEditFields, body: string): string {
  return JSON.stringify({ fields, body });
}

export interface EntityEditDraftAPI {
  draft: EntityEditDraft | null;
  load: (init: Omit<EntityEditDraft, "pristine">) => void;
  setField: <K extends keyof EntityEditFields>(k: K, v: EntityEditFields[K]) => void;
  setBody: (b: string) => void;
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

  const load = useCallback((init: Omit<EntityEditDraft, "pristine">) => {
    setDraft({ ...init, pristine: fingerprint(init.fields, init.body) });
  }, []);
  const setField = useCallback(<K extends keyof EntityEditFields>(k: K, v: EntityEditFields[K]) => {
    setDraft((d) => (d ? { ...d, fields: { ...d.fields, [k]: v } } : d));
  }, []);
  const setBody = useCallback((b: string) => {
    setDraft((d) => (d ? { ...d, body: b } : d));
  }, []);
  const clear = useCallback(() => setDraft(null), []);
  const isDirty = useCallback(
    () =>
      !!ref.current && fingerprint(ref.current.fields, ref.current.body) !== ref.current.pristine,
    [],
  );
  const snapshot = useCallback<() => EntityEditSnapshot>(() => ref.current, []);
  const applySnapshot = useCallback((s: EntityEditSnapshot) => setDraft(s), []);

  return { draft, load, setField, setBody, clear, isDirty, snapshot, applySnapshot };
}
