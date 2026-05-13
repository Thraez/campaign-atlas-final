/**
 * Type-specific DM profile field definitions.
 *
 * The player-facing half of an entity profile (known_for, visible_traits,
 * rumors) is the SAME shape for every entity type. The DM half changes
 * meaningfully per type — an NPC has "wants/fears/secret", a faction has
 * "goal/methods/forbidden_line", and so on.
 *
 * This file is the single source of truth for both:
 *   - the UI form in EntitiesTab (which fields to render, with what labels)
 *   - the YAML key names that get written into atlas.profile.dm
 *
 * Keys here MUST match the YAML keys in entity frontmatter exactly.
 */

export interface ProfileFieldDef {
  key: string;
  label: string;
  placeholder?: string;
  multiline?: boolean;
}

/** Player-visible profile fields — universal across entity types. */
export const PLAYER_PROFILE_FIELDS: ProfileFieldDef[] = [
  { key: "known_for", label: "Known for", placeholder: "What players hear about this on the street.", multiline: true },
];
/** Player-visible list fields (string[] in YAML). */
export const PLAYER_PROFILE_LIST_FIELDS: ProfileFieldDef[] = [
  { key: "visible_traits", label: "Visible traits", placeholder: "Soft-spoken" },
  { key: "rumors", label: "Rumors", placeholder: "He knows where the drowned shrine is." },
];

/** DM profile fields by entity type. Unknown types fall back to NPC-style. */
export const DM_PROFILE_FIELDS_BY_TYPE: Record<string, ProfileFieldDef[]> = {
  npc: [
    { key: "wants", label: "Wants", multiline: true },
    { key: "fears", label: "Fears", multiline: true },
    { key: "will_not", label: "Will not", multiline: true },
    { key: "secret", label: "Secret", multiline: true },
    { key: "pressure", label: "Pressure", multiline: true },
  ],
  faction: [
    { key: "goal", label: "Goal", multiline: true },
    { key: "fear", label: "Fear", multiline: true },
    { key: "methods", label: "Methods", multiline: true },
    { key: "public_face", label: "Public face", multiline: true },
    { key: "forbidden_line", label: "Forbidden line", multiline: true },
  ],
  settlement: [
    { key: "wants", label: "Wants", multiline: true },
    { key: "fears", label: "Fears", multiline: true },
    { key: "will_not_tolerate", label: "Will not tolerate", multiline: true },
    { key: "local_tension", label: "Local tension", multiline: true },
    { key: "hidden_pressure", label: "Hidden pressure", multiline: true },
  ],
  region: [
    { key: "travel_mood", label: "Travel mood", multiline: true },
    { key: "hazards", label: "Hazards", multiline: true },
    { key: "local_rule", label: "Local rule", multiline: true },
    { key: "hidden_pressure", label: "Hidden pressure", multiline: true },
  ],
};

/** Aliases — common type strings that should map to a known profile shape. */
const TYPE_ALIASES: Record<string, string> = {
  city: "settlement",
  town: "settlement",
  village: "settlement",
  hamlet: "settlement",
  area: "region",
  zone: "region",
  district: "region",
  party: "faction",
  cult: "faction",
  guild: "faction",
  order: "faction",
  church: "faction",
  character: "npc",
  person: "npc",
};

export function dmFieldsForType(type: string | undefined): ProfileFieldDef[] {
  const t = (type ?? "").toLowerCase();
  const canonical = DM_PROFILE_FIELDS_BY_TYPE[t]
    ? t
    : TYPE_ALIASES[t] ?? "npc";
  return DM_PROFILE_FIELDS_BY_TYPE[canonical] ?? DM_PROFILE_FIELDS_BY_TYPE.npc;
}

/** Common relationship verbs. Free-form strings are also allowed. */
export const RELATIONSHIP_TYPES = [
  "allied_with",
  "trades_with",
  "rivals_with",
  "at_war_with",
  "member_of",
  "rules",
  "protects",
  "secretly_funds",
  "owes_debt_to",
  "knows_secret_of",
  "lover_of",
  "child_of",
  "parent_of",
  "located_in",
  "guards",
  "hunts",
] as const;
