/**
 * Layout Engine — resolves semantic spatial relations ("beside", "on_top_of",
 * "behind", "scattered_around", ...) into actual coordinates. The LLM never
 * computes coordinates itself (SDD 3.2). Includes the fallback behavior added
 * in v3 for invalid/circular references: instead of crashing, unresolved
 * references fall back to the next open grid slot from the origin.
 */
import { clampParams, RENDER_PERF_CEILING } from "./cardCatalog.js";

const GRID_SPACING = 2.2;
const SPIRAL_DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]];

// Incremental spiral cursor state — stepped forward by one cell per call
// instead of re-walking the spiral from the origin every time (the cap on
// objects/scene keeps that O(n) re-derivation cheap in practice, but there's
// no reason to redo work we already know).
let cx = 0, cz = 0, dirIndex = 0, legLength = 1, legPassed = 0;

export function resetGrid() {
  cx = 0; cz = 0; dirIndex = 0; legLength = 1; legPassed = 0;
}

/** Spiral-ish grid slot generator so fallback objects don't stack on origin. */
export function getNextGridSlot() {
  const slot = { x: cx * GRID_SPACING, y: 0, z: cz * GRID_SPACING };
  cx += SPIRAL_DIRS[dirIndex][0];
  cz += SPIRAL_DIRS[dirIndex][1];
  legPassed++;
  if (legPassed === legLength) {
    legPassed = 0;
    dirIndex = (dirIndex + 1) % 4;
    if (dirIndex % 2 === 0) legLength++;
  }
  return slot;
}

const RELATION_OFFSETS = {
  beside: (offset) => ({ x: offset, y: 0, z: 0 }),
  behind: (offset) => ({ x: 0, y: 0, z: -offset }),
  in_front_of: (offset) => ({ x: 0, y: 0, z: offset }),
  on_top_of: (offset) => ({ x: 0, y: offset, z: 0 }),
  scattered_around: (offset) => {
    const angle = Math.random() * Math.PI * 2;
    const r = offset * (0.6 + Math.random() * 0.8);
    return { x: Math.cos(angle) * r, y: 0, z: Math.sin(angle) * r };
  },
};

/**
 * Resolve a single card's position given its relation and the current
 * Scene State. A target's position is always read already-resolved (it was
 * fixed when that target was added/moved), so this never recurses — a
 * missing/unknown `relation.to` is the only failure mode, and it falls back
 * to the next grid slot instead of throwing (SDD 3.2). Because there's no
 * recursion, an A-beside-B / B-beside-A cycle can't loop either: whichever
 * of the two is resolved second just reads the first one's already-fixed
 * position, same as any other relation.
 */
export function resolvePosition(card, sceneState) {
  const relation = card.relation;
  if (!relation || !relation.to || !sceneState.has(relation.to)) {
    return getNextGridSlot(); // fallback, bukan throw — SDD 3.2
  }

  const target = sceneState.get(relation.to);
  const basePos = target.position || { x: 0, y: 0, z: 0 };
  const offsetFn = RELATION_OFFSETS[relation.position] || RELATION_OFFSETS.beside;
  const offset = offsetFn(relation.offset ?? 1.5);

  return {
    x: basePos.x + offset.x,
    y: basePos.y + offset.y,
    z: basePos.z + offset.z,
  };
}

/**
 * Apply a batch of patch actions (add/modify/remove) to the Scene State and
 * return the list of {id, action, position?} for the renderer to act on.
 * Objects untouched by this turn are NOT re-resolved (SDD section 4 step 4).
 *
 * This is the single choke point both LLM-driven calls and the manual
 * "Add to Scene" panel go through, so it's also where the client-side
 * "second layer" of validation lives (SDD 3.4 / 6): params are clamped
 * against the card schema (min/max/enum), and the render-performance
 * ceiling is enforced here too, not just server-side in SanityChecker.
 * The returned array carries a `.capped` flag if any `add` was dropped
 * for being over the object cap.
 */
export function applyPatch(calls, sceneState) {
  const results = [];
  let capped = false;
  for (const call of calls) {
    const action = call.action || "add";
    if (action === "add") {
      if (sceneState.count() >= RENDER_PERF_CEILING) {
        capped = true;
        continue;
      }
      const pos = resolvePosition(call, sceneState);
      const params = clampParams(call.card, call.params || {});
      sceneState.add(call.id, call.card, params, pos, call.relation);
      results.push({ id: call.id, action: "add", card: call.card, params, position: pos });
    } else if (action === "modify") {
      const existing = sceneState.get(call.id);
      const params = existing ? clampParams(existing.card, call.params || {}) : (call.params || {});
      const ok = sceneState.modify(call.id, params);
      if (ok) {
        results.push({ id: call.id, action: "modify", params });
      }
      // modify on unknown id: skip/fallback silently (SDD section 4, stale ref note)
    } else if (action === "remove") {
      const ok = sceneState.remove(call.id);
      if (ok) {
        results.push({ id: call.id, action: "remove" });
      }
    }
  }
  results.capped = capped;
  return results;
}
