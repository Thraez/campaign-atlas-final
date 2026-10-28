import { describe, it, expect } from "vitest";
import yaml from "js-yaml";
import { parseCharacterKeys, serializeCharacterKeys } from "@/atlas/secrets/characterKeysFile";

describe("character-keys.yaml parser (eval-2026-10/36)", () => {
  it("keeps every key, scalars as the text the DM typed", () => {
    expect(
      parseCharacterKeys(
        "Aria: k1\nBob: 12345\nCara: 0123\nDag: true\nEli: 0x1F\nFen: 2024-01-01\n",
      ),
    ).toEqual({
      ok: true,
      entries: [
        { name: "Aria", key: "k1" },
        { name: "Bob", key: "12345" },
        { name: "Cara", key: "0123" },
        { name: "Dag", key: "true" },
        { name: "Eli", key: "0x1F" },
        { name: "Fen", key: "2024-01-01" },
      ],
      unsupported: [],
    });
  });

  it("names entries that have no key or a nested value instead of dropping them", () => {
    expect(parseCharacterKeys("Aria: k1\nBob:\nCara:\n  inner: x\nDag: [a, b]\nEli: ~\n")).toEqual({
      ok: true,
      entries: [{ name: "Aria", key: "k1" }],
      unsupported: ["Bob", "Cara", "Dag", "Eli"],
    });
  });

  it("an empty or comment-only file has no entries", () => {
    expect(parseCharacterKeys("")).toEqual({ ok: true, entries: [], unsupported: [] });
    expect(parseCharacterKeys("# keys go here\n")).toEqual({
      ok: true,
      entries: [],
      unsupported: [],
    });
  });

  it("a file that isn't a map, or isn't YAML, is an error that doesn't quote the keys", () => {
    const list = parseCharacterKeys("- secret-one\n- secret-two\n");
    expect(list.ok).toBe(false);
    const broken = parseCharacterKeys('Aria: k1\nBob: "secret-two\n');
    expect(broken.ok).toBe(false);
    const dup = parseCharacterKeys("Aria: secret-one\nAria: secret-two\n");
    expect(dup.ok).toBe(false);
    for (const r of [list, broken, dup]) {
      if (r.ok) continue;
      expect(r.error).not.toMatch(/secret-/);
    }
  });

  it("serializes so the build's strings-only read sees every key", () => {
    const text = serializeCharacterKeys([
      { name: "Aria", key: "k1" },
      { name: "Bob", key: "12345" },
      { name: "  ", key: "blank-name" },
      { name: " Cara ", key: "true" },
    ]);
    expect(yaml.load(text)).toEqual({ Aria: "k1", Bob: "12345", Cara: "true" });
    expect(parseCharacterKeys(text)).toEqual({
      ok: true,
      entries: [
        { name: "Aria", key: "k1" },
        { name: "Bob", key: "12345" },
        { name: "Cara", key: "true" },
      ],
      unsupported: [],
    });
  });
});
