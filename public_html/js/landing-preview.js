/**
 * Lightweight, non-interactive Three.js preview for the landing page hero.
 * Reuses the same Card Registry + Layout Engine as the composer so the
 * landing page shows the *actual* renderer, not a mockup image — and it
 * works with zero backend calls, so it renders even for anonymous visitors.
 */
import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { buildCardObject } from "./cardRegistry.js";
import { SceneState } from "./sceneState.js";
import { applyPatch } from "./layoutEngine.js";
import { applyPhotoEnvironment } from "./envLighting.js";
import { CinematicGradeShader } from "./cinematicGradeShader.js";

const canvas = document.getElementById("heroCanvas");
if (canvas) {
  const wrap = canvas.parentElement;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;

  // This canvas animates continuously in the background of a marketing
  // page — on a software/CPU rasterizer (SwiftShader, llvmpipe, some
  // locked-down corporate laptops) skip shadows entirely rather than
  // risk a janky hero section.
  let lowPowerMode = false;
  try {
    const gl = renderer.getContext();
    const info = gl.getExtension("WEBGL_debug_renderer_info");
    const name = info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    lowPowerMode = /swiftshader|llvmpipe|software|basic render/i.test(String(name));
  } catch (e) { /* ignore — default to full quality */ }

  renderer.shadowMap.enabled = !lowPowerMode;
  renderer.shadowMap.type = THREE.VSMShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0a0f0c);
  scene.fog = new THREE.Fog(0x0a0f0c, 14, 36);

  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);

  const hemi = new THREE.HemisphereLight(0x9fb8ff, 0x1a1410, 0.6);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffe3b0, 1.15);
  sun.position.set(8, 10, 5);
  if (!lowPowerMode) {
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = -14;
    sun.shadow.camera.right = 14;
    sun.shadow.camera.top = 14;
    sun.shadow.camera.bottom = -14;
    sun.shadow.radius = 3.5;
    sun.shadow.bias = -0.0015;
  }
  scene.add(sun);
  const rim = new THREE.DirectionalLight(0x6dffb0, 0.35);
  rim.position.set(-8, 4, -6);
  scene.add(rim);

  const groundMat = new THREE.MeshStandardMaterial({ color: 0x122019, roughness: 1 });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = !lowPowerMode;
  scene.add(ground);

  // Same real-HDR-photo IBL as the composer (envLighting.js), so glass/metal
  // materials (the building card) get the same reflections/lighting here as
  // in the actual app — the hero shouldn't look like a different renderer.
  await applyPhotoEnvironment(renderer, scene);

  // Showcase a mix of nature (tree/flower_bush), architecture (house +
  // building), a small environment patch (terrain), and props — a compact
  // sampler of what the Card Registry can build with real three.js meshes.
  const sceneState = new SceneState();
  const demoCalls = [
    { action: "add", card: "terrain", id: "terrain_1", params: { radius: 5.5, surface: "grass" } },
    { action: "add", card: "fountain", id: "fountain_1", params: { size: 1.5, tiers: 2 } },
    { action: "add", card: "bench", id: "bench_1", params: { material: "wood" }, relation: { to: "fountain_1", position: "beside", offset: 2.5 } },
    { action: "add", card: "tree", id: "tree_1", params: { height: 3 }, relation: { to: "fountain_1", position: "in_front_of", offset: 3.5 } },
    { action: "add", card: "tree", id: "tree_2", params: { height: 2.5 }, relation: { position: "scattered_around", offset: 4 } },
    { action: "add", card: "lamp", id: "lamp_1", params: { style: "street", glow_warm: true }, relation: { to: "fountain_1", position: "beside", offset: 4 } },
    { action: "add", card: "flower_bush", id: "flower_1", params: { flower_color: "pink" }, relation: { to: "bench_1", position: "beside", offset: 1.5 } },
    { action: "add", card: "house", id: "house_1", params: {}, relation: { to: "fountain_1", position: "behind", offset: 5 } },
    { action: "add", card: "building", id: "building_1", params: { height: 9, style: "glass_blue" }, relation: { to: "house_1", position: "beside", offset: 5 } },
  ];
  const results = applyPatch(demoCalls, sceneState);
  for (const r of results) {
    if (r.action !== "add") continue;
    const obj = buildCardObject(r.id, r.card, r.params);
    if (!obj) continue;
    obj.position.set(r.position.x, r.position.y, r.position.z);
    if (!lowPowerMode) obj.traverse((o) => { if (o.isMesh) o.castShadow = o.receiveShadow = true; });
    scene.add(obj);
  }

  // Bloom only (no SSAO/DOF here — this canvas renders continuously in the
  // background of a marketing page, so per-frame cost is kept low). The
  // cinematic grade pass is cheap (one extra full-screen shader) and is
  // what makes this preview match the compose app's look, so it stays.
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloomPass = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.5, 0.4, 0.75);
  composer.addPass(bloomPass);
  composer.addPass(new OutputPass());
  const gradePass = new ShaderPass(CinematicGradeShader);
  gradePass.enabled = !lowPowerMode;
  composer.addPass(gradePass);

  function resize() {
    const w = wrap.clientWidth, h = wrap.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    composer.setSize(w, h);
  }
  let resizeTimer = null;
  function scheduleResize() {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(resize, 80);
  }
  new ResizeObserver(scheduleResize).observe(wrap);
  resize();

  // This canvas animates forever in the background of a marketing page —
  // once the hero scrolls out of view (or the tab is backgrounded) there's
  // no reason to keep paying for bloom + IBL-lit rendering every frame, so
  // pause the rAF loop entirely rather than just rendering an unseen frame.
  let visible = true;
  new IntersectionObserver((entries) => {
    visible = entries[0]?.isIntersecting !== false;
  }, { threshold: 0 }).observe(wrap);

  let angle = 0.5;
  let t = 0;
  let firstFrame = true;
  function animate() {
    requestAnimationFrame(animate);
    if (!visible || document.hidden) return;
    angle += 0.0018;
    t += 0.01;
    const bob = Math.sin(t * 0.6) * 0.3;
    camera.position.set(Math.cos(angle) * 11.5, 6.6 + bob, Math.sin(angle) * 11.5);
    camera.lookAt(0.8, 0.6, 0);
    if (gradePass.enabled) gradePass.uniforms.time.value = performance.now() * 0.001;
    composer.render();
    if (firstFrame) {
      firstFrame = false;
      // Swap the CSS skeleton shimmer for the real canvas once there's
      // actually a rendered frame behind it, instead of a blank-then-pop.
      requestAnimationFrame(() => wrap.classList.add("preview-ready"));
    }
  }
  animate();
}
