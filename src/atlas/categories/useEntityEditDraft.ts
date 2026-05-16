import { useCallback, useRef, useState } from "react";

export interface EntityEditFields {
  id: string;
  type: string;
  visibility: string;
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
  setField: (k: keyof EntityEditFields, v: string) => void;
  setBody: (b: string) => void;
  clear: () => void;
  isDirty: () => boolean;
  snapshot: () => EntityEditSnapshot;
  applySnapshot: (s: EntityEditSnapshot) => void;
}

export function useEntityEditDraft(): EntityEditDraftAPI {
  const [draft, setDraft] = useState<EntityEditDraft | null>(null);
  const ref = useRef<EntityEditDraft | null>(null);
  ref.current = draft;

  const load = useCallback((init: Omit<EntityEditDraft, "pristine">) => {
    setDraft({ ...init, pristine: fingerprint(init.fields, init.body) });
  }, []);
  const setField = useCallback((k: keyof EntityEditFields, v: string) => {
    setDraft((d) => (d ? { ...d, fields: { ...d.fields, [k]: v } } : d));
  }, []);
  const setBody = useCallback((b: string) => {
    setDraft((d) => (d ? { ...d, body: b } : d));
  }, []);
  const clear = useCallback(() => setDraft(null), []);
  const isDirty = useCallback(
    () => !!ref.current && fingerprint(ref.current.fields, ref.current.body) !== ref.current.pristine,
    [],
  );
  const snapshot = useCallback<() => EntityEditSnapshot>(() => ref.current, []);
  const applySnapshot = useCallback((s: EntityEditSnapshot) => setDraft(s), []);

  return { draft, load, setField, setBody, clear, isDirty, snapshot, applySnapshot };
}
