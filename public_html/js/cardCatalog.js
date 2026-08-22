/**
 * Card Catalog — the "tool/function schema" catalog described in SDD section 3.1.
 * Each entry is registered to the LLM API as a tool definition. The model never
 * writes code or coordinates; it only ever selects a card + fills parameters
 * constrained by type/enum/min/max. This file is shared conceptually between
 * client (for validation + UI "Add to Scene" panel) and the PHP proxy's mock
 * NLU fallback (api/lib/CardCatalog.php mirrors this list).
 */

export const CARD_CATALOG = [
  {
    name: "tree",
    category: "Nature",
    description: "Sebuah pohon dengan batang dan daun",
    icon: "🌲",
    parameters: {
      height: { type: "number", default: 2, min: 0.5, max: 5 },
      leaf_color: { type: "string", enum: ["green", "autumn_orange", "dead_brown"], default: "green" },
      trunk_style: { type: "string", enum: ["straight", "twisted"], default: "straight" },
    },
  },
  {
    name: "rock",
    category: "Nature",
    description: "Batu besar untuk lansekap",
    icon: "🪨",
    parameters: {
      size: { type: "number", default: 1, min: 0.3, max: 3 },
      shape: { type: "string", enum: ["round", "angular", "flat"], default: "round" },
    },
  },
  {
    name: "flower_bush",
    category: "Nature",
    description: "Semak berbunga",
    icon: "🌸",
    parameters: {
      size: { type: "number", default: 0.8, min: 0.3, max: 2 },
      flower_color: { type: "string", enum: ["pink", "red", "yellow", "purple", "white"], default: "pink" },
    },
  },
  {
    name: "mountain",
    category: "Nature",
    description: "Latar gunung di kejauhan",
    icon: "⛰️",
    parameters: {
      height: { type: "number", default: 6, min: 2, max: 15 },
      snow_capped: { type: "boolean", default: true },
    },
  },
  {
    name: "pond",
    category: "Nature",
    description: "Kolam air kecil",
    icon: "💧",
    parameters: {
      radius: { type: "number", default: 2, min: 0.5, max: 6 },
      water_color: { type: "string", enum: ["blue", "teal", "murky_green"], default: "blue" },
    },
  },
  {
    name: "bench",
    category: "Props",
    description: "Bangku taman",
    icon: "🪑",
    parameters: {
      material: { type: "string", enum: ["wood", "stone", "metal"], default: "wood" },
    },
  },
  {
    name: "fountain",
    category: "Props",
    description: "Air mancur batu",
    icon: "⛲",
    parameters: {
      size: { type: "number", default: 1.5, min: 0.8, max: 3 },
      tiers: { type: "number", default: 2, min: 1, max: 3 },
    },
  },
  {
    name: "lamp",
    category: "Props",
    description: "Lampu jalan / taman",
    icon: "💡",
    parameters: {
      style: { type: "string", enum: ["street", "lantern", "modern"], default: "street" },
      glow_warm: { type: "boolean", default: true },
    },
  },
  {
    name: "gazebo",
    category: "Architecture",
    description: "Gazebo kayu beratap",
    icon: "🏛️",
    parameters: {
      size: { type: "number", default: 3, min: 2, max: 6 },
    },
  },
  {
    name: "house",
    category: "Architecture",
    description: "Rumah kecil bergaya cottage",
    icon: "🏠",
    parameters: {
      width: { type: "number", default: 4, min: 2, max: 10 },
      wall_color: { type: "string", enum: ["stone", "wood_brown", "white_plaster"], default: "stone" },
      roof_color: { type: "string", enum: ["red", "dark_wood", "slate_gray"], default: "dark_wood" },
      chimney: { type: "boolean", default: true },
    },
  },
  {
    name: "building",
    category: "Architecture",
    description: "Gedung bertingkat dengan jendela menyala",
    icon: "🏢",
    parameters: {
      height: { type: "number", default: 8, min: 3, max: 20 },
      style: { type: "string", enum: ["glass_blue", "concrete", "brick_red"], default: "glass_blue" },
    },
  },
  {
    name: "terrain",
    category: "Nature",
    description: "Petak tanah/bukit kecil sebagai alas lansekap",
    icon: "🏞️",
    parameters: {
      radius: { type: "number", default: 3, min: 1, max: 7 },
      surface: { type: "string", enum: ["grass", "sand", "snow", "rocky"], default: "grass" },
    },
  },
  {
    name: "wall",
    category: "Architecture",
    description: "Tembok / pagar batu rendah",
    icon: "🧱",
    parameters: {
      length: { type: "number", default: 4, min: 1, max: 12 },
      material: { type: "string", enum: ["stone", "brick", "wood_fence"], default: "stone" },
    },
  },
  {
    name: "path",
    category: "Architecture",
    description: "Jalan setapak batu",
    icon: "🛤️",
    parameters: {
      length: { type: "number", default: 5, min: 1, max: 15 },
      width: { type: "number", default: 1, min: 0.5, max: 3 },
    },
  },
  {
    name: "car",
    category: "Vehicles",
    description: "Mobil sederhana",
    icon: "🚗",
    parameters: {
      color: { type: "string", enum: ["red", "blue", "black", "white", "yellow"], default: "red" },
      style: { type: "string", enum: ["sedan", "truck", "sports"], default: "sedan" },
    },
  },
  {
    name: "cloud",
    category: "Effects",
    description: "Awan dekoratif melayang",
    icon: "☁️",
    parameters: {
      size: { type: "number", default: 2, min: 0.5, max: 5 },
    },
  },
  {
    name: "campfire",
    category: "Effects",
    description: "Api unggun kecil",
    icon: "🔥",
    parameters: {
      size: { type: "number", default: 1, min: 0.5, max: 2 },
    },
  },
];

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
