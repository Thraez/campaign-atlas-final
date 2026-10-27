# Plan: split the continuous-dev queue + gate NICE-TO-HAVES

**Goal:** the hourly routine should read a *small* queue each run, and only load the big
NICE-TO-HAVES section when every WANT is done.
**Who executes:** ChatGPT/Codex (moving ~1,800 lines is token-heavy, so it's offloaded).
**Repo:** `campaign-atlas-final`. Paths below are relative to repo root.

---

## Why

`docs/automation/continuous-dev-queue.md` is **159 KB / ~1,800 lines** and the routine reads it **whole
every hour** (`continuous-dev-routine.md` step 0). Measured breakdown:
- `## 🟡 NICE-TO-HAVES` section = **93 KB (58%)** — design-gated, only relevant at the REFUEL POINT.
- Many completed `✅ DONE` units still sit inline in the WANTS/refuel sections.

So most of what's read hourly is either done work or work the routine usually won't touch.

---

## Target: three files instead of one

```
docs/automation/
  continuous-dev-queue.md            <- WANTS only: the poppable, ordered, NOT-yet-done units. Small.
  continuous-dev-nice-to-haves.md    <- the entire "🟡 NICE-TO-HAVES" section (93 KB). Loaded only at REFUEL.
  continuous-dev-done.md             <- archive of completed ✅ DONE units (append-only history).
```

### 1. `continuous-dev-nice-to-haves.md` (new)
Move the whole `## 🟡 NICE-TO-HAVES — design-check required before each` section here **verbatim**.
Keep its heading and all sub-items. Add a one-line header: *"Loaded only when the WANTS queue is empty
(the REFUEL POINT). The design-check in `continuous-dev-roadmap.md` still binds."*

### 2. `continuous-dev-done.md` (new)
Move every unit currently marked `✅ DONE` (with its date + commit hash) out of the queue and append it
here, grouped under its original section letter/date so history is preserved. This is archival only —
nothing is deleted.

### 3. `continuous-dev-queue.md` (slim it)
What remains: the header + `## How the routine uses this queue` + the **WANTS section containing only
not-done units**, in order. Update the "How the routine uses this queue" text so it matches the new flow:
- Step 1 stays "take the top unit not marked ✅ DONE."
- Add: "when a unit is finished, **move** it to `continuous-dev-done.md` (don't leave it inline)."
- Add: "when this file has no un-done WANT left → REFUEL POINT → the routine (not this file) decides
  whether to open `continuous-dev-nice-to-haves.md`."

---

## Routine prompt changes — `docs/automation/continuous-dev-routine.md`

**Step 0 "Read state"** (currently reads the queue + roadmap + ACTIVE.md):
- Change the queue line to: *"Read `docs/automation/continuous-dev-queue.md` (WANTS only)."*
- **Add:** *"Do **not** read `continuous-dev-nice-to-haves.md` yet — only if step 2 reaches the REFUEL
  POINT."*

**Step 2 "Pick the work"** — rewrite the ordered list to:
1. The **top WANT unit not marked `✅ DONE`** in `continuous-dev-queue.md` → take it. Read its cited
   spec/plan in full first.
2. **If (and only if) every WANT unit is done** (REFUEL POINT) → **now read
   `continuous-dev-nice-to-haves.md`** and take the first NICE-TO-HAVE that clearly passes the design
   check (step 2a). Do not invent new wants.
3. HAND-BACK / NEVER candidate → stop-and-report (step 7).
4. Nothing safe → stop-and-report (step 7).

**Step 6 "Merge"** — change the "Mark the completed unit ✅ DONE in continuous-dev-queue.md" bullet to:
*"**Move** the completed unit to `continuous-dev-done.md` with its date + commit hash (remove it from the
WANTS queue), and include that edit in the merge."* This keeps the hot file small over time.

The hourly prompt at the bottom of the file needs **no change** — it already says "follow
continuous-dev-routine.md exactly."

---

## Validation
1. `wc -c docs/automation/continuous-dev-queue.md` → should drop from ~159 KB to well under ~30 KB.
2. `continuous-dev-nice-to-haves.md` ≈ 93 KB; `continuous-dev-done.md` holds all former ✅ DONE units.
3. No `✅ DONE` unit remains inline in `continuous-dev-queue.md`.
4. Grep `continuous-dev-routine.md` for `nice-to-haves` → appears only in step 0 (the "don't read yet"
   note) and step 2.2 (the REFUEL read).
5. A dry mental run: with WANTS remaining, the routine reads only the slim queue (+roadmap+ACTIVE);
   nice-to-haves is untouched.

## Guardrails
- Move content **verbatim** — don't reword units or drop commit hashes.
- The design-check + HAND-BACK/NEVER policy in `continuous-dev-roadmap.md` is unchanged.
- Do it on a branch; keep `main` untouched (per the routine's own rules).
