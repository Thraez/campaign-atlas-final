/**
 * Validates schemas/world.schema.json (Q98) against the two real world.yaml
 * files, so a loader/schema drift fails a test instead of surfacing only as
 * silent missing-autocomplete in an editor.
 */
import { describe, it, expect, beforeAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";
import Ajv, { type ValidateFunction } from "ajv";
import { loadWorldConfig } from "../../../scripts/atlas/loadWorldConfig";

const SCHEMA_PATH = path.resolve(__dirname, "../../../schemas/world.schema.json");

let validate: ValidateFunction;

beforeAll(() => {
  const schema = JSON.parse(fs.readFileSync(SCHEMA_PATH, "utf8"));
  const ajv = new Ajv({ allErrors: true, strict: false });
  validate = ajv.compile(schema);
});

function loadYaml(relPath: string): unknown {
  const raw = fs.readFileSync(path.resolve(__dirname, "../../../", relPath), "utf8");
  return yaml.load(raw);
}

describe("schemas/world.schema.json", () => {
  it("validates the seed-world example against the schema", () => {
    const data = loadYaml("examples/seed-world/_atlas/world.yaml");
    const valid = validate(data);
    expect(validate.errors, JSON.stringify(validate.errors)).toBeFalsy();
    expect(valid).toBe(true);
  });

  it("validates the real astrath-deeprealm world.yaml against the schema", () => {
    const data = loadYaml("content/astrath-deeprealm/_atlas/world.yaml");
    const valid = validate(data);
    expect(validate.errors, JSON.stringify(validate.errors)).toBeFalsy();
    expect(valid).toBe(true);
  });

  it("both real world.yaml files also still load cleanly via loadWorldConfig", () => {
    expect(() => loadWorldConfig("examples", "seed-world")).not.toThrow();
    expect(() => loadWorldConfig("content", "astrath-deeprealm")).not.toThrow();
    expect(loadWorldConfig("examples", "seed-world")?.maps.length).toBeGreaterThan(0);
    expect(loadWorldConfig("content", "astrath-deeprealm")?.maps.length).toBeGreaterThan(0);
  });

  it("both real world.yaml files carry the yaml-language-server $schema header", () => {
    const seed = fs.readFileSync(
      path.resolve(__dirname, "../../../examples/seed-world/_atlas/world.yaml"),
      "utf8",
    );
    const real = fs.readFileSync(
      path.resolve(__dirname, "../../../content/astrath-deeprealm/_atlas/world.yaml"),
      "utf8",
    );
    expect(seed).toMatch(/# yaml-language-server: \$schema=.*world\.schema\.json/);
    expect(real).toMatch(/# yaml-language-server: \$schema=.*world\.schema\.json/);
  });

  it("rejects a world.yaml with no maps (schema drift guard)", () => {
    const valid = validate({ maps: [] });
    expect(valid).toBe(false);
  });

  it("rejects a route missing required waypoints (schema drift guard)", () => {
    const valid = validate({
      maps: [{ id: "m1", width: 10, height: 10 }],
      routes: [{ id: "r1", mapId: "m1", name: "Road" }],
    });
    expect(valid).toBe(false);
  });

  it("rejects a grid overlay with an invalid kind (schema drift guard)", () => {
    const valid = validate({
      maps: [{ id: "m1", width: 10, height: 10, grid: { kind: "triangle", size: 10 } }],
    });
    expect(valid).toBe(false);
  });

  it("allows unrecognized extra keys at every level (permissive by design)", () => {
    const valid = validate({
      someUnknownTopLevelKey: true,
      maps: [{ id: "m1", width: 10, height: 10, someUnknownMapKey: 42 }],
    });
    expect(validate.errors, JSON.stringify(validate.errors)).toBeFalsy();
    expect(valid).toBe(true);
  });
});
