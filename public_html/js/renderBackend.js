/**
 * Render backend abstraction — lets app.js render through either the
 * classic WebGL (EffectComposer) pipeline or the WebGPURenderer pipeline
 * without the rest of the app (animate loop, resize, the "enhanced
 * lighting" toggle) needing to know which one is active.
 *
 * Both pipelines expose the same shape:
 *   { kind, renderer, lowPowerMode, render(), setSize(w,h),
 *     setEnhanced(bool), isEnhanced(), dispose() }
 * The WebGPU pipeline additionally exposes onDeviceLost(callback) — a real
 * failure mode (GPU driver crash / OS-level device reset) that the WebGL
 * pipeline has no equivalent of; callers should check for it before use.
 *
 * Each factory also does its own image-based-lighting (PMREM) setup on the
 * scene it's given, because PMREMGenerator comes in a WebGL-flavored and a
 * WebGPU-flavored variant tied to the matching renderer class — it can't be
 * shared/hoisted out to caller-agnostic code the way scene/camera/lights
 * (plain data, not renderer-bound) can.
 *
 * Design note: the backend choice is made ONCE at page load (see
 * BACKEND_KEY in app.js), not hot-swapped mid-session. app.js's render
 * bootstrap has many closures over the renderer/composer (resize handler,
 * the "light" toolbar toggle, the FPS auto-throttle) — an in-place swap
 * would mean rebuilding all of those live, for a rarely-used capability.
 * A settings change instead flips the stored preference and reloads,
 * which is simpler and has far less surface for subtle bugs.
 */
import * as THREE from "three";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { SSAOPass } from "three/addons/postprocessing/SSAOPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

/**
 * Probe WebGPU availability without side effects (no renderer created).
 * `isFallback` is true when the browser could only hand back a software
 * (non-hardware-accelerated) adapter — treated the same as "no real GPU"
 * by callers, same spirit as the existing WebGL software-renderer sniff.
 */
export async function probeWebGPU() {
  if (!navigator.gpu) return { usable: false, isFallback: false };
  try {
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) return { usable: false, isFallback: false };
    return { usable: true, isFallback: !!adapter.isFallbackAdapter };
  } catch (e) {
    return { usable: false, isFallback: false };
  }
}

export function createWebGLPipeline({ canvas, scene, camera }) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  // Detect a software/CPU rasterizer (SwiftShader, llvmpipe, etc. — common
  // on remote/virtualized machines and some locked-down corporate laptops)
  // up front, before any shadow/post-processing config, since shadow
  // mapping is the single most expensive thing to turn off on one of these.
  let lowPowerMode = false;
  try {
    const gl = renderer.getContext();
    const info = gl.getExtension("WEBGL_debug_renderer_info");
    const name = info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    lowPowerMode = /swiftshader|llvmpipe|software|basic render/i.test(String(name));
  } catch (e) {
    lowPowerMode = false;
  }

  renderer.shadowMap.enabled = !lowPowerMode;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap; // thin, soft-edged shadows rather than hard blocky ones

  // Image-based lighting — a procedural "room" environment (no external HDR
  // file needed) gives glass/metal/water materials a believable reflection
  // instead of flat unlit color.
  const pmremGenerator = new THREE.PMREMGenerator(renderer);
  scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
  pmremGenerator.dispose();

  // Post-processing pipeline — approximates a few of the visual wins a path
  // tracer gives you "for free" (soft contact shadows, glow around bright/
  // emissive surfaces) using cheap, real-time screen-space passes instead,
  // so the viewport stays interactive while orbiting or during edits.
  //   RenderPass -> SSAOPass (contact shadow) -> UnrealBloomPass (glow) -> OutputPass
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));

  const ssaoPass = new SSAOPass(scene, camera, 1, 1, 14); // 14 samples — cheaper than the 32-sample default
  ssaoPass.kernelRadius = 5;
  ssaoPass.minDistance = 0.001;
  ssaoPass.maxDistance = 0.12;
  ssaoPass.output = SSAOPass.OUTPUT.Default;
  ssaoPass.enabled = !lowPowerMode;
  composer.addPass(ssaoPass);

  const bloomPass = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.45, 0.4, 0.75);
  bloomPass.enabled = !lowPowerMode;
  composer.addPass(bloomPass);

  composer.addPass(new OutputPass());

  return {
    kind: "webgl",
    renderer,
    lowPowerMode,
    render() {
      composer.render();
    },
    setSize(w, h) {
      renderer.setSize(w, h, false);
      composer.setSize(w, h);
      // SSAO sampled at half resolution then upscaled — much cheaper, and
      // the softness reads fine since it's a subtle contact shadow, not a
      // sharp AO map.
      ssaoPass.setSize(Math.max(1, Math.round(w * 0.5)), Math.max(1, Math.round(h * 0.5)));
    },
    setEnhanced(on) {
      ssaoPass.enabled = on;
      bloomPass.enabled = on;
    },
    isEnhanced() {
      return ssaoPass.enabled;
    },
    dispose() {
      composer.dispose();
      renderer.dispose();
    },
  };
}

/**
 * WebGPU pipeline — same visual intent (base render + glow on emissive
 * surfaces) via TSL nodes instead of EffectComposer passes. Screen-space AO
 * is intentionally NOT ported here yet: GTAONode needs correctly-wired MRT
 * (normal + depth) output from the scene pass, a meaningfully bigger lift
 * to get right than bloom's single-texture-in/out node. Bloom alone is
 * still a real quality step up, and WebGPURenderer's own lighting/material
 * evaluation (what actually benefits most from the transmission/clearcoat
 * materials in cardRegistry.js) is more accurate than WebGL's regardless.
 *
 * @param {boolean} isFallbackAdapter from probeWebGPU() — treated the same
 *   as the WebGL path's software-rasterizer detection.
 */
export async function createWebGPUPipeline({ canvas, scene, camera, isFallbackAdapter = false }) {
  const { WebGPURenderer, RenderPipeline, PMREMGenerator } = await import("three/webgpu");
  const { pass } = await import("three/tsl");
  const { bloom } = await import("three/addons/tsl/display/BloomNode.js");

  const renderer = new WebGPURenderer({ canvas, antialias: true });
  await renderer.init();
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const lowPowerMode = isFallbackAdapter;
  renderer.shadowMap.enabled = !lowPowerMode;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  // Sync fromScene() is the current (non-deprecated) API — valid here since
  // renderer.init() has already been awaited above.
  const pmremGenerator = new PMREMGenerator(renderer);
  scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
  pmremGenerator.dispose();

  const scenePass = pass(scene, camera);
  const scenePassColor = scenePass.getTextureNode();
  const bloomNode = bloom(scenePassColor, 0.45, 0.4, 0.75);

  const pipeline = new RenderPipeline(renderer);
  let enhanced = !lowPowerMode;
  function rebuildGraph() {
    pipeline.outputNode = enhanced ? scenePassColor.add(bloomNode) : scenePassColor;
    pipeline.needsUpdate = true;
  }
  rebuildGraph();

  return {
    kind: "webgpu",
    renderer,
    lowPowerMode,
    render() {
      // Synchronous render() is the current API (renderAsync() was
      // deprecated in r181) — safe to call directly since renderer.init()
      // was already awaited above.
      pipeline.render();
    },
    setSize(w, h) {
      renderer.setSize(w, h, false);
    },
    setEnhanced(on) {
      enhanced = on;
      rebuildGraph();
    },
    isEnhanced() {
      return enhanced;
    },
    /**
     * Registers a callback for a lost GPU device (driver crash, OS-level
     * GPU reset, laptop GPU switch, etc.) — WebGPURenderer can't recover
     * from this on its own. Real hardware testing surfaced this as a real
     * failure mode (not just a theoretical one), so callers should treat
     * it as "fall back to WebGL", not just log it.
     */
    onDeviceLost(callback) {
      renderer.onDeviceLost = callback;
    },
    dispose() {
      renderer.dispose();
    },
  };
}
