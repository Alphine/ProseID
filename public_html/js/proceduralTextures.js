/**
 * Procedural color + normal map textures, generated on an offscreen canvas
 * at runtime — no external texture files to fetch/host. Trades flat-color
 * materials for surfaces with actual micro-detail (bark grooves, leaf
 * mottling, stone speckle, grass blades), which reads as far more "real"
 * under directional light than a uniform color ever can, independent of
 * how good the lighting/renderer is.
 *
 * Generated once per (type, base color) combination and cached — many
 * trees of the same leaf_color share one texture pair instead of each
 * paying generation + GPU-upload cost individually.
 */
import * as THREE from "three";
import { SimplexNoise } from "three/addons/math/SimplexNoise.js";

const noise = new SimplexNoise();
const cache = new Map();

function makeCanvas(size) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  return c;
}

/** Central-difference height-field -> tangent-space normal map. */
function heightToNormalCanvas(height, size, strength) {
  const canvas = makeCanvas(size);
  const ctx = canvas.getContext("2d");
  const img = ctx.createImageData(size, size);
  const at = (x, y) => height[((y + size) % size) * size + ((x + size) % size)];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (at(x - 1, y) - at(x + 1, y)) * strength;
      const dy = (at(x, y - 1) - at(x, y + 1)) * strength;
      const dz = 1;
      const len = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
      const idx = (y * size + x) * 4;
      img.data[idx] = ((dx / len) * 0.5 + 0.5) * 255;
      img.data[idx + 1] = ((dy / len) * 0.5 + 0.5) * 255;
      img.data[idx + 2] = ((dz / len) * 0.5 + 0.5) * 255;
      img.data[idx + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

function toTexture(canvas, repeatX = 4, repeatY = 4) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.needsUpdate = true;
  return tex;
}

function hexToRgb(hex) {
  return [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
}
function rgbToHex(r, g, b) {
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}
function shade([r, g, b], amount) {
  // amount in [-1,1]: negative darkens toward black, positive lightens toward white
  const mix = (c, target) => c + (target - c) * Math.abs(amount);
  return amount < 0 ? [mix(r, 0), mix(g, 0), mix(b, 0)] : [mix(r, 255), mix(g, 255), mix(b, 255)];
}

/** Vertical bark grooves — used for tree trunks, lamp/gazebo posts. */
function generateBark(colorHex, size = 128) {
  const canvas = makeCanvas(size);
  const ctx = canvas.getContext("2d");
  const base = hexToRgb(colorHex);
  const height = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // Low-frequency vertical streaks (grooves running up the trunk) plus
      // fine grain on top so it doesn't read as a repeating stripe pattern.
      const streak = noise.noise(x * 0.15, y * 0.02);
      const grain = noise.noise(x * 0.8, y * 0.8) * 0.3;
      const h = streak * 0.7 + grain;
      height[y * size + x] = h;
      const shaded = shade(base, h * 0.35);
      ctx.fillStyle = rgbToHex(...shaded);
      ctx.fillRect(x, y, 1, 1);
    }
  }
  return {
    map: toTexture(canvas, 2, 4),
    normalMap: toTexture(heightToNormalCanvas(height, size, 1.8), 2, 4),
  };
}

/** Blotchy mottling — used for tree foliage, bushes. */
function generateLeaf(colorHex, size = 128) {
  const canvas = makeCanvas(size);
  const ctx = canvas.getContext("2d");
  const base = hexToRgb(colorHex);
  const height = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const blotch = noise.noise(x * 0.08, y * 0.08);
      const speckle = noise.noise(x * 0.6, y * 0.6) * 0.4;
      const h = blotch * 0.6 + speckle;
      height[y * size + x] = h;
      const shaded = shade(base, h * 0.3 - 0.05);
      ctx.fillStyle = rgbToHex(...shaded);
      ctx.fillRect(x, y, 1, 1);
    }
  }
  return {
    map: toTexture(canvas, 3, 3),
    normalMap: toTexture(heightToNormalCanvas(height, size, 1.2), 3, 3),
  };
}

/** Granular speckle + larger patches — used for rock, stone walls/paths. */
function generateStone(colorHex, size = 128) {
  const canvas = makeCanvas(size);
  const ctx = canvas.getContext("2d");
  const base = hexToRgb(colorHex);
  const height = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const patch = noise.noise(x * 0.05, y * 0.05) * 0.5;
      const speckle = noise.noise(x * 0.9, y * 0.9) * 0.5;
      const h = patch + speckle;
      height[y * size + x] = h;
      const shaded = shade(base, h * 0.25);
      ctx.fillStyle = rgbToHex(...shaded);
      ctx.fillRect(x, y, 1, 1);
    }
  }
  return {
    map: toTexture(canvas, 3, 3),
    normalMap: toTexture(heightToNormalCanvas(height, size, 2.2), 3, 3),
  };
}

/** Fine blade-scale noise — used for grass terrain. */
function generateGrass(colorHex, size = 128) {
  const canvas = makeCanvas(size);
  const ctx = canvas.getContext("2d");
  const base = hexToRgb(colorHex);
  const height = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const clump = noise.noise(x * 0.06, y * 0.06) * 0.4;
      const blade = noise.noise(x * 1.2, y * 1.2) * 0.6;
      const h = clump + blade;
      height[y * size + x] = h;
      const shaded = shade(base, h * 0.28);
      ctx.fillStyle = rgbToHex(...shaded);
      ctx.fillRect(x, y, 1, 1);
    }
  }
  return {
    map: toTexture(canvas, 6, 6),
    normalMap: toTexture(heightToNormalCanvas(height, size, 1.4), 6, 6),
  };
}

const GENERATORS = { bark: generateBark, leaf: generateLeaf, stone: generateStone, grass: generateGrass };

/**
 * @param {"bark"|"leaf"|"stone"|"grass"} type
 * @param {number} colorHex
 * @returns {{map: THREE.CanvasTexture, normalMap: THREE.CanvasTexture}}
 */
export function getProceduralTexture(type, colorHex) {
  const key = `${type}:${colorHex}`;
  if (!cache.has(key)) {
    const gen = GENERATORS[type];
    cache.set(key, gen ? gen(colorHex) : null);
  }
  return cache.get(key);
}
