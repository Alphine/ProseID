/**
 * Shared image-based-lighting source — a real HDR photo (see
 * assets/env/ATTRIBUTION.md for license/credit) instead of the procedural
 * RoomEnvironment box-with-area-lights used before. Real captured
 * lighting/reflection data reads as noticeably more "photographic" on the
 * PBR materials (car clearcoat, glass windows, water transmission) than a
 * synthetic room ever can, for the same render cost — this only changes
 * what texture PMREMGenerator convolves, not the render pipeline itself.
 *
 * Used for LIGHTING/reflections only — scene.background stays whatever the
 * caller already set (the app's dark terminal-themed backdrop), so this
 * doesn't fight the rest of the UI's visual language.
 */
import * as THREE from "three";
import { HDRLoader } from "three/addons/loaders/HDRLoader.js";

const ENV_URL = new URL("../assets/env/belfast_sunset_puresky_1k.hdr", import.meta.url);

let hdrTexturePromise = null;
function loadHDRTexture() {
  if (!hdrTexturePromise) {
    hdrTexturePromise = new HDRLoader().loadAsync(ENV_URL).then((tex) => {
      tex.mapping = THREE.EquirectangularReflectionMapping;
      return tex;
    });
  }
  return hdrTexturePromise;
}

/**
 * Sets scene.environment from the HDR photo, convolved through the given
 * renderer's PMREMGenerator. Falls back to the procedural RoomEnvironment
 * (same one used before) if the HDR fails to load for any reason — a
 * missing/blocked asset shouldn't leave the scene with no IBL at all.
 */
export async function applyPhotoEnvironment(renderer, scene) {
  const pmremGenerator = new THREE.PMREMGenerator(renderer);
  try {
    const hdrTexture = await loadHDRTexture();
    scene.environment = pmremGenerator.fromEquirectangular(hdrTexture).texture;
  } catch (e) {
    console.warn("HDRI environment failed to load, falling back to procedural room:", e);
    const { RoomEnvironment } = await import("three/addons/environments/RoomEnvironment.js");
    scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
  } finally {
    pmremGenerator.dispose();
  }
}
