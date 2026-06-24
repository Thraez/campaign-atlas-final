import { it, expect, beforeEach } from "vitest";
import {
  loadAllNotes,
  loadNote,
  saveNote,
  deleteNote,
  exportNotesJson,
  importNotesJson,
  _resetNotesForTests,
} from "@/atlas/notes/playerNotes";

const STORAGE_KEY = "atlas-player-notes-v1";

beforeEach(() => _resetNotesForTests());

it("loadNote returns null for empty entityId", () => {
  expect(loadNote("")).toBeNull();
});

it("loadNote returns null when no note exists", () => {
  expect(loadNote("saltmere")).toBeNull();
});

it("saveNote + loadNote round-trip", () => {
  saveNote("saltmere", "mysterious fog");
  const n = loadNote("saltmere");
  expect(n?.text).toBe("mysterious fog");
  expect(typeof n?.updatedAt).toBe("string");
});

it("saveNote with empty text deletes the note", () => {
  saveNote("saltmere", "something");
  saveNote("saltmere", "");
  expect(loadNote("saltmere")).toBeNull();
});

it("deleteNote removes the note", () => {
  saveNote("saltmere", "keep this a moment");
  deleteNote("saltmere");
  expect(loadNote("saltmere")).toBeNull();
});

it("loadAllNotes returns {} when localStorage contains corrupt JSON", () => {
  window.localStorage.setItem(STORAGE_KEY, "not-json{{");
  expect(loadAllNotes()).toEqual({});
});

it("loadAllNotes skips entries missing text or updatedAt", () => {
  window.localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ good: { text: "hi", updatedAt: "2026-01-01T00:00:00Z" }, bad: { nope: true } }),
  );
  const notes = loadAllNotes();
  expect(notes["good"]?.text).toBe("hi");
  expect(notes["bad"]).toBeUndefined();
});

it("exportNotesJson / importNotesJson wrapped-format round-trip", () => {
  saveNote("a", "alpha");
  saveNote("b", "bravo");
  const json = exportNotesJson();
  _resetNotesForTests();
  const result = importNotesJson(json);
  expect(result.errors).toHaveLength(0);
  expect(result.imported).toBe(2);
  expect(loadNote("a")?.text).toBe("alpha");
  expect(loadNote("b")?.text).toBe("bravo");
});

it("importNotesJson accepts a raw NoteMap (no _format key)", () => {
  const raw = JSON.stringify({ x: { text: "xray", updatedAt: "2026-01-01T00:00:00Z" } });
  const result = importNotesJson(raw);
  expect(result.errors).toHaveLength(0);
  expect(result.imported).toBe(1);
  expect(loadNote("x")?.text).toBe("xray");
});

it("importNotesJson returns error on invalid JSON", () => {
  const result = importNotesJson("not json{{");
  expect(result.imported).toBe(0);
  expect(result.errors.length).toBeGreaterThan(0);
  expect(result.errors[0]).toMatch(/Not valid JSON/i);
});

it("importNotesJson skips entries missing text, records error", () => {
  const json = JSON.stringify({ bad: { updatedAt: "2026-01-01T00:00:00Z" } });
  const result = importNotesJson(json);
  expect(result.imported).toBe(0);
  expect(result.errors.some((e) => e.includes('"bad"'))).toBe(true);
});
