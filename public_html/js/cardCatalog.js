/**
 * Card Catalog — the "tool/function schema" catalog described in SDD section 3.1.
 * Each entry is registered to the LLM API as a tool definition. The model never
 * writes code or coordinates; it only ever selects a card + fills parameters
 * constrained by type/enum/min/max.
 *
 * Single source of truth: data/card_catalog.json. Both this module (fetched at
 * load time, via top-level await) and api/lib/CardCatalog.php (reads the same
 * file server-side) load from it — no more hand-maintained duplicate lists
 * that can silently drift apart.
 */

const res = await fetch(new URL("../data/card_catalog.json", import.meta.url));
if (!res.ok) {
  throw new Error(`Failed to load card catalog (HTTP ${res.status}) — check data/card_catalog.json is deployed and reachable.`);
}
const { cards } = await res.json();

export const CARD_CATALOG = cards;

export const VALID_CARD_NAMES = CARD_CATALOG.map((c) => c.name);

export function getCardDef(name) {
  return CARD_CATALOG.find((c) => c.name === name) || null;
}

// Keep in sync with SanityChecker::MAX_OBJECTS_PER_SCENE (api/lib/SanityChecker.php)
export const RENDER_PERF_CEILING = 50; // hard cap objects/scene, SDD 3.2

/**
 * Clamp/validate a params object against a card's schema (min/max/enum/type) —
 * the client-side "second layer" of parameter validation the SDD calls for
 * (section 3.4 / 6), on top of the server sanity check. Unknown params are
 * dropped; out-of-range numbers are clamped; enum values not in the list
 * fall back to the schema default rather than being rendered as-is.
 */
export function clampParams(cardName, params) {
  const def = getCardDef(cardName);
  if (!def || !params) return {};
  const out = {};
  for (const [key, value] of Object.entries(params)) {
    const spec = def.parameters[key];
    if (!spec) continue; // drop unknown params rather than passing them through
    if (spec.type === "number") {
      const n = Number(value);
      if (!Number.isFinite(n)) { out[key] = spec.default; continue; }
      out[key] = Math.min(spec.max ?? n, Math.max(spec.min ?? n, n));
    } else if (spec.type === "string" && Array.isArray(spec.enum)) {
      out[key] = spec.enum.includes(value) ? value : spec.default;
    } else if (spec.type === "boolean") {
      out[key] = typeof value === "boolean" ? value : Boolean(spec.default);
    } else {
      out[key] = value;
    }
  }
  return out;
}
