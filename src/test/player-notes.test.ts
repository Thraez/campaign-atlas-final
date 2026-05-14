/**
 * Unit tests for the player-local notes storage layer.
 * Verifies load/save/delete roundtrip, export/import roundtrip,
 * and graceful degradation when localStorage is corrupt or unavailable.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  loadAllNotes,
  loadNote,
  saveNote,
  deleteNote,
  exportNotesJson,
  importNotesJson,
  _resetNotesForTests,
} from "@/atlas/notes/playerNotes";

beforeEach(() => {
  _resetNotesForTests();
});

afterEach(() => {
  _resetNotesForTests();
  vi.unstubAllGlobals();
});

describe("player-notes: basic roundtrip", () => {
  it("save then load returns the note", () => {
    saveNote("thornhold", "Players found the hidden door behind the bar.");
    const n = loadNote("thornhold");
    expect(n).not.toBeNull();
    expect(n!.text).toBe("Players found the hidden door behind the bar.");
    expect(typeof n!.updatedAt).toBe("string");
  });

  it("loadNote on a never-saved id returns null", () => {
    expect(loadNote("nope-never-saved")).toBeNull();
  });

  it("saving empty string deletes the entry", () => {
    saveNote("thornhold", "first content");
    expect(loadNote("thornhold")?.text).toBe("first content");
    saveNote("thornhold", "");
    expect(loadNote("thornhold")).toBeNull();
  });

  it("deleteNote removes the entry", () => {
    saveNote("thornhold", "X");
    deleteNote("thornhold");
    expect(loadNote("thornhold")).toBeNull();
  });

  it("loadAllNotes returns every saved note", () => {
    saveNote("a", "alpha");
    saveNote("b", "beta");
    saveNote("c", "gamma");
    const all = loadAllNotes();
    expect(Object.keys(all).sort()).toEqual(["a", "b", "c"]);
    expect(all.a.text).toBe("alpha");
    expect(all.b.text).toBe("beta");
    expect(all.c.text).toBe("gamma");
  });
});

describe("player-notes: export / import", () => {
  it("export → import preserves all notes", () => {
    saveNote("a", "alpha");
    saveNote("b", "beta");
    const json = exportNotesJson();

    _resetNotesForTests();
    expect(loadAllNotes()).toEqual({});

    const result = importNotesJson(json);
    expect(result.imported).toBe(2);
    expect(result.errors).toEqual([]);
    expect(loadNote("a")?.text).toBe("alpha");
    expect(loadNote("b")?.text).toBe("beta");
  });

  it("import accepts a raw NoteMap shape (no wrapper)", () => {
    const raw = JSON.stringify({
      x: { text: "raw shape", updatedAt: "2026-01-01T00:00:00Z" },
    });
    const result = importNotesJson(raw);
    expect(result.imported).toBe(1);
    expect(loadNote("x")?.text).toBe("raw shape");
  });

  it("import merges into existing notes rather than replacing", () => {
    saveNote("kept", "existing value");
    const result = importNotesJson(
      JSON.stringify({ added: { text: "new value", updatedAt: "2026-01-01T00:00:00Z" } })
    );
    expect(result.imported).toBe(1);
    expect(loadNote("kept")?.text).toBe("existing value");
    expect(loadNote("added")?.text).toBe("new value");
  });

  it("import reports JSON-parse failure without crashing", () => {
    const result = importNotesJson("not-json-at-all");
    expect(result.imported).toBe(0);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("import skips invalid entries and counts the valid ones", () => {
    const result = importNotesJson(
      JSON.stringify({
        good: { text: "ok", updatedAt: "2026-01-01T00:00:00Z" },
        broken: "not an object",
        missing_text: { updatedAt: "2026-01-01T00:00:00Z" },
      })
    );
    expect(result.imported).toBe(1);
    expect(result.errors.length).toBeGreaterThanOrEqual(2);
    expect(loadNote("good")?.text).toBe("ok");
  });
});

describe("player-notes: degraded environments", () => {
  it("corrupt localStorage value yields empty map without throwing", () => {
    window.localStorage.setItem("atlas-player-notes-v1", "this is not json{");
    expect(() => loadAllNotes()).not.toThrow();
    expect(loadAllNotes()).toEqual({});
  });

  it("non-object localStorage value yields empty map without throwing", () => {
    window.localStorage.setItem("atlas-player-notes-v1", '"a string"');
    expect(loadAllNotes()).toEqual({});
  });

  it("entries with wrong types in the blob are ignored", () => {
    window.localStorage.setItem(
      "atlas-player-notes-v1",
      JSON.stringify({
        good: { text: "ok", updatedAt: "2026-01-01" },
        bad: { text: 42, updatedAt: "2026-01-01" },
        also_bad: "string-instead-of-object",
      })
    );
    const all = loadAllNotes();
    expect(Object.keys(all)).toEqual(["good"]);
  });

  it("save with localStorage throwing on setItem does not crash", () => {
    // Force setItem to throw for the next call (simulates quota exceeded).
    const original = Storage.prototype.setItem;
    let calls = 0;
    Storage.prototype.setItem = function (key: string, value: string) {
      if (key === "atlas-player-notes-v1") {
        calls += 1;
        throw new Error("QuotaExceededError");
      }
      return original.call(this, key, value);
    };
    try {
      expect(() => saveNote("x", "should fail silently")).not.toThrow();
      expect(calls).toBeGreaterThan(0);
    } finally {
      Storage.prototype.setItem = original;
    }
  });
});
