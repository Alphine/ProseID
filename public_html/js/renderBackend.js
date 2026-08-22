/**
 * Render backend abstraction — lets app.js render through either the
 * classic WebGL (EffectComposer) pipeline or the WebGPURenderer pipeline
 * without the rest of the app (animate loop, resize, the "enhanced
 * lighting" toggle) needing to know which one is active.
 *
 * createWebGPUPipeline/probeWebGPU are currently UNUSED — app.js only
 * calls createWebGLPipeline. Real-hardware testing produced a hard GPU
 * driver crash (Windows DXGI_ERROR_DEVICE_HUNG / "WebGPU Device Lost") on
 * a real user's machine when the (now-removed) WebGPU toggle was clicked,
 * so app.js hardcodes WebGL only rather than exposing any path to it.
 * This code is left in place rather than deleted in case WebGPU is worth
 * revisiting later, but treat it as unvetted/untrusted until someone
 * deliberately re-wires and re-tests it.
 *
 * Both pipelines expose the same shape:
 *   { kind, renderer, lowPowerMode, render(), setSize(w,h),
 *     setEnhanced(bool), isEnhanced(), dispose() }
 * The WebGL pipeline additionally exposes setFocusDistance(dist) and
 * setBokehEnabled(bool)/isBokehEnabled() (depth-of-field controls — the
 * WebGPU pipeline has no Bokeh pass at all, see its own comment below).
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
 * Design note (for if WebGPU comes back): the backend choice should be
 * made ONCE at page load, not hot-swapped mid-session. app.js's render
 * bootstrap has many closures over the renderer/composer (resize handler,
 * the "light" toolbar toggle, the FPS auto-throttle) — an in-place swap
 * would mean rebuilding all of those live, for a rarely-used capability.
 * A settings change instead flipping a stored preference and reloading is
 * simpler and has far less surface for subtle bugs.
 */
import * as THREE from "three";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { SSAOPass } from "three/addons/postprocessing/SSAOPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { BokehPass } from "three/addons/postprocessing/BokehPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { SMAAPass } from "three/addons/postprocessing/SMAAPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { applyPhotoEnvironment } from "./envLighting.js";
import { CinematicGradeShader } from "./cinematicGradeShader.js";

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

export async function createWebGLPipeline({ canvas, scene, camera }) {
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
  renderer.shadowMap.type = THREE.VSMShadowMap; // thin, soft-edged shadows rather than hard blocky ones

  // Image-based lighting from a real HDR photo (falls back to the old
  // procedural room internally if the asset fails to load) — see
  // envLighting.js. Awaited before the first frame so materials never
  // render a beat with the wrong reflections.
  await applyPhotoEnvironment(renderer, scene);

  // Post-processing pipeline — approximates a few of the visual wins a path
  // tracer gives you "for free" (soft contact shadows, glow around bright/
  // emissive surfaces, shallow depth of field) using cheap, real-time
  // screen-space passes instead, so the viewport stays interactive while
  // orbiting or during edits.
  //   RenderPass -> SSAOPass (contact shadow) -> UnrealBloomPass (glow) ->
  //   BokehPass (depth of field) -> OutputPass -> SMAAPass (edge AA) ->
  //   CinematicGradeShader (vignette/grain/split-tone, runs last since
  //   grain is meant to look like film grain, not something SMAA should
  //   try to smooth away as a false edge)
  //
  // Note on antialias: the `antialias: true` renderer option above does
  // NOT do anything once EffectComposer is in the picture — RenderPass
  // draws into the composer's own non-multisampled render target, so the
  // renderer's own MSAA never applies. SMAAPass is what actually
  // antialiases this pipeline's output.
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

  // Kept subtle on purpose: this is a scene EDITOR, not a cinematic
  // still — a strong blur would fight the "see and select your objects"
  // task. aperture/maxblur are small fractions of the shader's own
  // defaults (0.025 / 1.0); focus distance is kept in sync with the
  // orbit target every frame via setFocusDistance() so whatever the user
  // is actually looking at stays sharp regardless of camera distance.
  // Has its own on/off toggle (setBokehEnabled), separate from the
  // AO+bloom "enhanced" group — DOF is a much more polarizing effect
  // than AO/bloom (some people just don't want blur while editing), so
  // it doesn't get to hide behind one combined switch.
  const bokehPass = new BokehPass(scene, camera, { focus: 12, aperture: 0.006, maxblur: 0.008 });
  bokehPass.enabled = !lowPowerMode;
  composer.addPass(bokehPass);

  composer.addPass(new OutputPass());

  const smaaPass = new SMAAPass();
  smaaPass.enabled = !lowPowerMode;
  composer.addPass(smaaPass);

  const gradePass = new ShaderPass(CinematicGradeShader);
  gradePass.enabled = !lowPowerMode; // cheap, but still a full extra pass — skip on a software rasterizer
  composer.addPass(gradePass);

  return {
    kind: "webgl",
    renderer,
    lowPowerMode,
    render() {
      if (gradePass.enabled) gradePass.uniforms.time.value = performance.now() * 0.001;
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
    setFocusDistance(dist) {
      bokehPass.uniforms.focus.value = dist;
    },
    setEnhanced(on) {
      ssaoPass.enabled = on;
      bloomPass.enabled = on;
    },
    isEnhanced() {
      return ssaoPass.enabled;
    },
    setBokehEnabled(on) {
      bokehPass.enabled = on;
    },
    isBokehEnabled() {
      return bokehPass.enabled;
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
  renderer.shadowMap.type = THREE.VSMShadowMap;

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
