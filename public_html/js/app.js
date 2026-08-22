import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { CARD_CATALOG, getCardDef, RENDER_PERF_CEILING } from "./cardCatalog.js";
import { buildCardObject } from "./cardRegistry.js";
import { SceneState } from "./sceneState.js";
import { applyPatch, resetGrid } from "./layoutEngine.js";
import { enableTilt } from "./tilt.js";
import { probeWebGPU, createWebGLPipeline, createWebGPUPipeline } from "./renderBackend.js";

// ---------------------------------------------------------------------------
// Render backend choice — WebGL (default) or WebGPU (experimental, opt-in
// only — see the GPU toolbar toggle further down). "Auto" resolves to
// WebGL, not WebGPU: real-world testing surfaced a hard GPU driver crash
// (DXGI_ERROR_DEVICE_REMOVED / WebGPU "Device Lost") on at least one
// device, which is a far worse failure mode than a slow frame rate — a
// software-adapter or sustained-low-FPS check can't predict a driver
// crash. So WebGPU is now something a user turns on deliberately, not
// something that silently activates itself. Decided once at load time
// rather than hot-swapped mid-session; see renderBackend.js's top comment
// for why.
// ---------------------------------------------------------------------------
const BACKEND_KEY = "p3d_render_backend"; // 'auto' | 'webgl' | 'webgpu' — 'auto' behaves the same as 'webgl'
function getBackendPref() {
  return localStorage.getItem(BACKEND_KEY) || "auto";
}
function setBackendPref(v) {
  localStorage.setItem(BACKEND_KEY, v);
}

const canvas = document.getElementById("scene3d");
const canvasWrap = document.getElementById("canvasWrap");

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0d0f16);
scene.fog = new THREE.Fog(0x0d0f16, 25, 70);

const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 200);
camera.position.set(9, 7, 9);

// Recovery path shared by both the sustained-low-FPS downgrade (below, in
// animate()) and the WebGPU device-lost handler (wired after the pipeline
// exists) — same "give up on WebGPU, go back to WebGL" action either way.
function recoverToWebGL(reason) {
  setBackendPref("webgl");
  toast(reason);
  setTimeout(() => location.reload(), 1400);
}

async function bootstrapPipeline() {
  const pref = getBackendPref();
  if (pref !== "webgpu") {
    return createWebGLPipeline({ canvas, scene, camera });
  }
  const gpuProbe = await probeWebGPU();
  if (gpuProbe.usable && !gpuProbe.isFallback) {
    try {
      return await createWebGPUPipeline({ canvas, scene, camera, isFallbackAdapter: gpuProbe.isFallback });
    } catch (e) {
      console.warn("WebGPU pipeline init failed, falling back to WebGL:", e);
    }
  }
  // User explicitly asked for WebGPU and it wasn't usable — reset the
  // preference so a reload doesn't loop into the same failed attempt.
  setBackendPref("auto");
  return createWebGLPipeline({ canvas, scene, camera });
}
const pipeline = await bootstrapPipeline();
const renderer = pipeline.renderer;
const lowPowerMode = pipeline.lowPowerMode;

// If the WebGPU backend's GPU device crashes mid-session (driver bug, OS
// GPU reset, laptop GPU switch, etc.), the renderer can't recover on its
// own — fall back to WebGL and reload rather than leaving a frozen/dead
// canvas with no explanation.
if (pipeline.kind === "webgpu" && typeof pipeline.onDeviceLost === "function") {
  pipeline.onDeviceLost((info) => {
    console.error("WebGPU device lost:", info);
    recoverToWebGL("Graphics driver issue detected — switching to WebGL and reloading…");
  });
}

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0.5, 0);
controls.enableDamping = true;
controls.maxPolarAngle = Math.PI * 0.49;

const hemi = new THREE.HemisphereLight(0x9fb8ff, 0x1a1410, 0.55);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffe3b0, 1.1);
sun.position.set(10, 14, 6);
if (!lowPowerMode) {
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -20;
  sun.shadow.camera.right = 20;
  sun.shadow.camera.top = 20;
  sun.shadow.camera.bottom = -20;
  sun.shadow.radius = 3.5; // soft, thin shadow edges instead of hard-edged blobs
  sun.shadow.bias = -0.0015;
}
scene.add(sun);

let gridHelper = new THREE.GridHelper(40, 40, 0x333850, 0x1c1f2c);
scene.add(gridHelper);

const groundMat = new THREE.MeshStandardMaterial({ color: 0x1c2032, roughness: 1 });
const ground = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), groundMat);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = !lowPowerMode;
scene.add(ground);

// lowPowerMode was already detected during pipeline bootstrap; reused here
// — screen-space AO/bloom is the priciest part of either pipeline, so on a
// software renderer or fallback GPU adapter it defaults off. Users can
// still flip it back on with the "light" toolbar button.

function resizeRenderer() {
  const w = canvasWrap.clientWidth, h = canvasWrap.clientHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  pipeline.setSize(w, h);
}
// Debounced so a manual window-drag resize doesn't thrash render-target
// reallocation on every intermediate ResizeObserver callback.
let resizeTimer = null;
function scheduleResize() {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(resizeRenderer, 80);
}
new ResizeObserver(scheduleResize).observe(canvasWrap);
resizeRenderer();

// The `lowPowerMode` string-match only catches software rasterizers
// (SwiftShader/llvmpipe). A real-but-weak integrated GPU (Intel Iris Xe and
// similar) reports a normal vendor string and sails right past that check,
// so it would run the full AO+bloom pipeline unthrottled. To catch that
// tier too, watch the actual measured FPS: if it stays low for a few
// consecutive samples, drop AO+bloom automatically, same as the manual
// "light" toolbar toggle would. If it's STILL slow after that (only
// reachable on WebGPU, since that's the one dimension left to drop), fall
// back to the WebGL backend entirely and reload — this is the "kalau
// berat, matikan WebGPU" behavior, automatic rather than requiring the
// user to notice and flip the settings toggle themselves.
let lastFrame = performance.now(), frames = 0, fpsAcc = 0;
let lowFpsStreak = 0;
let autoThrottled = false;
let backendDowngradeStreak = 0;
const AUTO_THROTTLE_FPS = 24;
const AUTO_THROTTLE_STREAK = 4; // ~4 consecutive 500ms windows (~2s sustained)
const BACKEND_DOWNGRADE_STREAK = 6; // ~3s more sustained, after AO+bloom already off

function animate(now) {
  requestAnimationFrame(animate);
  controls.update();
  pipeline.render();

  frames++;
  fpsAcc += now - lastFrame;
  lastFrame = now;
  if (fpsAcc >= 500) {
    const fps = Math.round((frames * 1000) / fpsAcc);
    document.getElementById("fpsVal").textContent = fps;
    frames = 0; fpsAcc = 0;

    if (!lowPowerMode && !autoThrottled && pipeline.isEnhanced()) {
      lowFpsStreak = fps < AUTO_THROTTLE_FPS ? lowFpsStreak + 1 : 0;
      if (lowFpsStreak >= AUTO_THROTTLE_STREAK) {
        autoThrottled = true;
        pipeline.setEnhanced(false);
        lightToolBtn?.classList.remove("active");
        toast("Sustained low FPS — AO + glow turned off automatically. Re-enable anytime from the light icon.");
      }
    } else if (!lowPowerMode && autoThrottled && pipeline.kind === "webgpu") {
      backendDowngradeStreak = fps < AUTO_THROTTLE_FPS ? backendDowngradeStreak + 1 : 0;
      if (backendDowngradeStreak >= BACKEND_DOWNGRADE_STREAK) {
        backendDowngradeStreak = -Infinity; // fire once
        recoverToWebGL("WebGPU is still heavy on this device — switching to WebGL and reloading…");
      }
    }
  }
}
requestAnimationFrame(animate);

// ---------------------------------------------------------------------------
// Toasts — small ephemeral confirmations, complements the persistent status bar
// ---------------------------------------------------------------------------
const toastStack = document.createElement("div");
toastStack.className = "toast-stack";
document.body.appendChild(toastStack);
function toast(text) {
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = text;
  toastStack.appendChild(el);
  setTimeout(() => el.remove(), 2700);
}

// ---------------------------------------------------------------------------
// Scene State + object registry (THREE.Object3D per id)
// ---------------------------------------------------------------------------
const sceneState = new SceneState();
const object3Ds = new Map(); // id -> THREE.Group
let selectedId = null;

function refreshEmptyState() {
  document.getElementById("emptyState").classList.toggle("hidden", sceneState.count() > 0);
}

// Every card is rebuilt from scratch on "modify" (multi-turn edits routinely
// hit this — dragging a properties slider calls rebuildObject on every
// change) and removed on delete/new-scene. Without an explicit dispose pass,
// the old geometries/materials/textures stay resident in GPU memory even
// though nothing references them anymore — a slow leak that's worse on
// integrated GPUs with limited VRAM. THREE.Object3D has no built-in
// recursive dispose, so we walk the old subtree ourselves.
function disposeObject3D(obj) {
  obj.traverse((o) => {
    if (o.isMesh) {
      o.geometry?.dispose();
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) {
        if (!m) continue;
        for (const key of ["map", "normalMap", "roughnessMap", "metalnessMap", "emissiveMap", "aoMap"]) {
          m[key]?.dispose?.();
        }
        m.dispose();
      }
    }
  });
}

function addObject(id, card, params, position) {
  const obj = buildCardObject(id, card, params);
  if (!obj) return;
  obj.position.set(position.x, position.y, position.z);
  scene.add(obj);
  object3Ds.set(id, obj);
}

function rebuildObject(id) {
  const entry = sceneState.get(id);
  if (!entry) return;
  const old = object3Ds.get(id);
  if (old) { scene.remove(old); disposeObject3D(old); }
  const obj = buildCardObject(id, entry.card, entry.params);
  if (!obj) return;
  obj.position.set(entry.position.x, entry.position.y, entry.position.z);
  scene.add(obj);
  object3Ds.set(id, obj);
}

function removeObject(id) {
  const old = object3Ds.get(id);
  if (old) { scene.remove(old); disposeObject3D(old); object3Ds.delete(id); }
  if (selectedId === id) { selectedId = null; renderProperties(); }
}

/** Apply a batch of {action, id, card?, params?, position?} results to the 3D scene. */
function applyResultsToScene(results) {
  for (const r of results) {
    if (r.action === "add") addObject(r.id, r.card, r.params, r.position);
    else if (r.action === "modify") rebuildObject(r.id);
    else if (r.action === "remove") removeObject(r.id);
  }
  renderOutliner();
  refreshEmptyState();
  document.getElementById("objCount").textContent = sceneState.count();
}

function clearScene() {
  for (const id of Array.from(object3Ds.keys())) removeObject(id);
  sceneState.entries.clear();
  resetGrid();
  renderOutliner();
  refreshEmptyState();
  document.getElementById("objCount").textContent = 0;
}

// ---------------------------------------------------------------------------
// Chat log
// ---------------------------------------------------------------------------
const chatLog = document.getElementById("chatLog");
function nowLabel() {
  return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
function pushMessage(role, text, meta) {
  const wrap = document.createElement("div");
  wrap.className = `msg ${role}`;
  const row = document.createElement("div");
  row.className = "msg-row";
  if (role === "assistant") {
    const av = document.createElement("div");
    av.className = "avatar";
    av.textContent = "◆";
    row.appendChild(av);
  }
  const bubble = document.createElement("div");
  bubble.className = "bubble";
  bubble.textContent = text;
  row.appendChild(bubble);
  wrap.appendChild(row);
  const time = document.createElement("div");
  time.className = "msg-time";
  time.textContent = meta ? `${meta} · ${nowLabel()}` : nowLabel();
  wrap.appendChild(time);
  chatLog.appendChild(wrap);
  chatLog.scrollTop = chatLog.scrollHeight;
}
function pushError(text) {
  const wrap = document.createElement("div");
  wrap.className = "msg assistant msg-error";
  const row = document.createElement("div");
  row.className = "msg-row";
  const avatar = document.createElement("div");
  avatar.className = "avatar";
  avatar.textContent = "!";
  const bubble = document.createElement("div");
  bubble.className = "bubble";
  bubble.textContent = text; // server-supplied error text; kept out of innerHTML in case a future path echoes user input here
  row.append(avatar, bubble);
  wrap.appendChild(row);
  chatLog.appendChild(wrap);
  chatLog.scrollTop = chatLog.scrollHeight;
}

// ---------------------------------------------------------------------------
// API calls
// ---------------------------------------------------------------------------
const loadingOverlay = document.getElementById("loadingOverlay");
function setLoading(on, text) {
  loadingOverlay.classList.toggle("visible", on);
  if (text) document.getElementById("loadingText").textContent = text;
  document.querySelectorAll(".chip").forEach((c) => (c.disabled = on));
  promptInput.disabled = on;
}

async function requestSceneEdit(prompt) {
  setLoading(true, "Composing scene…");
  document.getElementById("sendBtn").disabled = true;
  try {
    const resp = await fetch("api/generate.php", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, sceneSummary: sceneState.summary() }),
    });
    if (resp.status === 401) { window.location.href = "login.html"; return; }
    const data = await resp.json();
    if (!resp.ok) {
      pushError(data.error || "Terjadi kesalahan pada server.");
      document.getElementById("statusMsg").textContent = data.error || "Error";
      return;
    }
    const results = applyPatch(data.calls, sceneState);
    applyResultsToScene(results);
    if (results.capped) toast(`Scene is at the ${RENDER_PERF_CEILING}-object limit — some additions were skipped.`);
    document.getElementById("sourceTag").textContent = data.source || "live";
    const added = results.filter((r) => r.action === "add").length;
    const modified = results.filter((r) => r.action === "modify").length;
    const removed = results.filter((r) => r.action === "remove").length;
    pushMessage(
      "assistant",
      `Done! ${added ? `+${added} added` : ""}${modified ? ` · ${modified} modified` : ""}${removed ? ` · ${removed} removed` : ""}${!added && !modified && !removed ? "No changes applied." : ""}`,
      `${sceneState.count()} objects`
    );
    document.getElementById("statusMsg").textContent = "Ready.";
  } catch (e) {
    pushError("Gagal menghubungi server. Periksa koneksi atau coba lagi.");
    document.getElementById("statusMsg").textContent = "Network error";
  } finally {
    setLoading(false);
    document.getElementById("sendBtn").disabled = false;
  }
}

async function requestDemo(demoKey, label) {
  setLoading(true, "Loading demo scene…");
  try {
    const resp = await fetch("api/generate.php", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ demoKey }),
    });
    if (resp.status === 401) { window.location.href = "login.html"; return; }
    const data = await resp.json();
    if (!resp.ok) { pushError(data.error || "Demo gagal dimuat."); return; }
    clearScene();
    const results = applyPatch(data.calls, sceneState);
    applyResultsToScene(results);
    document.getElementById("sourceTag").textContent = "curated_demo";
    pushMessage("assistant", `Here is your scene!`, `${sceneState.count()} objects · demo`);
  } catch (e) {
    pushError("Gagal memuat demo.");
  } finally {
    setLoading(false);
  }
}

// ---------------------------------------------------------------------------
// Chat input wiring
// ---------------------------------------------------------------------------
const promptInput = document.getElementById("promptInput");
const sendBtn = document.getElementById("sendBtn");

function submitPrompt() {
  const text = promptInput.value.trim();
  if (!text) return;
  pushMessage("user", text);
  promptInput.value = "";
  requestSceneEdit(text);
}
sendBtn.addEventListener("click", submitPrompt);
promptInput.addEventListener("keydown", (e) => { if (e.key === "Enter") submitPrompt(); });

document.getElementById("newChatBtn").addEventListener("click", () => {
  chatLog.innerHTML = "";
  clearScene();
  document.getElementById("sourceTag").textContent = "—";
  document.getElementById("statusMsg").textContent = "New scene.";
  pushMessage("assistant", "New scene started. Describe something to begin.");
  toast("Started a new scene");
});

// Compose/Explore tabs — Explore is a placeholder for a future read-only
// gallery view; give clear feedback instead of a dead click.
document.querySelectorAll(".topbar-center .tab").forEach((btn) => {
  btn.addEventListener("click", () => {
    if (btn.dataset.mode === "explore") {
      toast("Explore mode is coming soon");
      return;
    }
    document.querySelectorAll(".topbar-center .tab").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
  });
});

// ---------------------------------------------------------------------------
// Demo prompt chips
// ---------------------------------------------------------------------------
async function loadDemoPrompts() {
  try {
    const resp = await fetch("api/demo_list.php");
    const demos = await resp.json();
    const row = document.getElementById("tryPromptsRow");
    row.innerHTML = "";
    for (const d of demos) {
      const chip = document.createElement("button");
      chip.className = "chip";
      chip.textContent = d.label;
      chip.addEventListener("click", () => {
        pushMessage("user", d.prompt);
        requestDemo(d.key, d.label);
      });
      row.appendChild(chip);
    }
    const surprise = document.createElement("button");
    surprise.className = "chip surprise";
    surprise.textContent = "✨ Surprise me";
    surprise.addEventListener("click", () => {
      const d = demos[Math.floor(Math.random() * demos.length)];
      pushMessage("user", d.prompt);
      requestDemo(d.key, d.label);
    });
    row.appendChild(surprise);
  } catch (e) {
    // demo list is optional sugar; ignore failures
  }
}
loadDemoPrompts();

// ---------------------------------------------------------------------------
// Add-to-scene panel (client-side direct add, no API round-trip needed)
// ---------------------------------------------------------------------------
const categories = ["All", ...new Set(CARD_CATALOG.map((c) => c.category))];
const categoryTabs = document.getElementById("categoryTabs");
const cardGrid = document.getElementById("cardGrid");
let activeCategory = "All";
let searchTerm = "";

function renderCategoryTabs() {
  categoryTabs.innerHTML = "";
  for (const cat of categories) {
    const btn = document.createElement("button");
    btn.className = "ats-tab" + (cat === activeCategory ? " active" : "");
    btn.textContent = cat;
    btn.addEventListener("click", () => { activeCategory = cat; renderCategoryTabs(); renderCardGrid(); });
    categoryTabs.appendChild(btn);
  }
}

let addCounter = {};
function nextIdFor(card) {
  addCounter[card] = (addCounter[card] || 0) + 1;
  let id = `${card}_${addCounter[card]}`;
  while (sceneState.has(id)) { addCounter[card]++; id = `${card}_${addCounter[card]}`; }
  return id;
}

function renderCardGrid() {
  cardGrid.innerHTML = "";
  const items = CARD_CATALOG.filter((c) => {
    const inCat = activeCategory === "All" || c.category === activeCategory;
    const inSearch = !searchTerm || c.name.includes(searchTerm) || c.description.toLowerCase().includes(searchTerm);
    return inCat && inSearch;
  });
  for (const c of items) {
    const el = document.createElement("div");
    el.className = "ats-card";
    el.innerHTML = `<span class="icon">${c.icon}</span><span class="name">${c.name.replace(/_/g, " ")}</span><span class="desc">${c.description}</span>`;
    el.addEventListener("click", () => {
      if (sceneState.count() >= RENDER_PERF_CEILING) {
        toast(`Scene is at the ${RENDER_PERF_CEILING}-object limit.`);
        return;
      }
      const id = nextIdFor(c.name);
      const defaults = {};
      for (const [k, v] of Object.entries(c.parameters)) defaults[k] = v.default;
      const results = applyPatch([{ action: "add", card: c.name, id, params: defaults }], sceneState);
      applyResultsToScene(results);
      document.getElementById("statusMsg").textContent = `Added ${c.name}.`;
      el.classList.remove("just-added");
      void el.offsetWidth; // restart animation
      el.classList.add("just-added");
      selectedId = id;
      renderOutliner();
      renderProperties();
    });
    enableTilt(el, 4);
    cardGrid.appendChild(el);
  }
}
document.getElementById("cardSearch").addEventListener("input", (e) => {
  searchTerm = e.target.value.trim().toLowerCase();
  renderCardGrid();
});
renderCategoryTabs();
renderCardGrid();

// ---------------------------------------------------------------------------
// Scene outliner + properties panel
// ---------------------------------------------------------------------------
const outlinerList = document.getElementById("outlinerList");
const propertiesBody = document.getElementById("propertiesBody");
let outlinerFilter = "";

function renderOutliner() {
  outlinerList.innerHTML = "";
  if (sceneState.count() === 0) {
    outlinerList.innerHTML = `<div class="outliner-empty">Nothing in the scene yet.<br />Describe something or add a card below.</div>`;
    return;
  }
  for (const [id, entry] of sceneState.entries.entries()) {
    if (outlinerFilter && !id.toLowerCase().includes(outlinerFilter)) continue;
    const def = getCardDef(entry.card);
    const row = document.createElement("div");
    row.className = "outliner-item" + (id === selectedId ? " selected" : "");
    // id can originate from an LLM tool-call response, so it's set via
    // textContent (not interpolated into innerHTML) to avoid stored/DOM XSS
    // if a prompt-injected response ever smuggles markup in an id string.
    const iconSpan = document.createElement("span");
    iconSpan.className = "oi-icon";
    iconSpan.textContent = def ? def.icon : "◆";
    const nameSpan = document.createElement("span");
    nameSpan.className = "oi-name";
    nameSpan.textContent = id;
    const removeBtn = document.createElement("button");
    removeBtn.className = "oi-remove";
    removeBtn.title = "Remove";
    removeBtn.setAttribute("aria-label", "Remove");
    removeBtn.textContent = "✕";
    row.append(iconSpan, nameSpan, removeBtn);
    row.addEventListener("click", (e) => {
      if (e.target.closest(".oi-remove")) return;
      selectedId = id;
      renderOutliner();
      renderProperties();
    });
    row.querySelector(".oi-remove").addEventListener("click", () => {
      const results = applyPatch([{ action: "remove", id }], sceneState);
      applyResultsToScene(results);
    });
    outlinerList.appendChild(row);
  }
  if (outlinerList.children.length === 0) {
    outlinerList.innerHTML = "";
    const empty = document.createElement("div");
    empty.className = "outliner-empty";
    empty.textContent = `No objects match "${outlinerFilter}".`;
    outlinerList.appendChild(empty);
  }
}
document.getElementById("outlinerSearch").addEventListener("input", (e) => {
  outlinerFilter = e.target.value.trim().toLowerCase();
  renderOutliner();
});

function renderProperties() {
  propertiesBody.innerHTML = "";
  if (!selectedId || !sceneState.has(selectedId)) {
    propertiesBody.innerHTML = `<div class="props-empty">Select an object to edit its properties.</div>`;
    return;
  }
  const entry = sceneState.get(selectedId);
  const def = getCardDef(entry.card);

  const title = document.createElement("div");
  title.className = "prop-group-title";
  title.textContent = `${def ? def.icon : "◆"} ${selectedId}`;
  propertiesBody.appendChild(title);

  const transformTitle = document.createElement("div");
  transformTitle.className = "prop-group-title";
  transformTitle.textContent = "Position";
  propertiesBody.appendChild(transformTitle);

  const xyzRow = document.createElement("div");
  xyzRow.className = "prop-row prop-xyz";
  ["x", "y", "z"].forEach((axis) => {
    const input = document.createElement("input");
    input.type = "number";
    input.step = "0.1";
    input.value = entry.position[axis].toFixed(2);
    input.addEventListener("change", () => {
      entry.position[axis] = parseFloat(input.value) || 0;
      rebuildObject(selectedId);
    });
    xyzRow.appendChild(input);
  });
  propertiesBody.appendChild(xyzRow);

  if (def) {
    const appearanceTitle = document.createElement("div");
    appearanceTitle.className = "prop-group-title";
    appearanceTitle.textContent = "Appearance";
    propertiesBody.appendChild(appearanceTitle);

    for (const [key, spec] of Object.entries(def.parameters)) {
      const row = document.createElement("div");
      row.className = "prop-row";
      const label = document.createElement("label");
      label.textContent = key.replace(/_/g, " ");
      row.appendChild(label);

      let input;
      const currentVal = entry.params[key] ?? spec.default;
      if (spec.type === "number") {
        input = document.createElement("input");
        input.type = "range";
        input.min = spec.min; input.max = spec.max; input.step = 0.1;
        input.value = currentVal;
      } else if (spec.type === "boolean") {
        input = document.createElement("input");
        input.type = "checkbox";
        input.checked = !!currentVal;
      } else if (spec.enum) {
        input = document.createElement("select");
        for (const opt of spec.enum) {
          const o = document.createElement("option");
          o.value = opt; o.textContent = opt.replace(/_/g, " ");
          if (opt === currentVal) o.selected = true;
          input.appendChild(o);
        }
      }
      input.addEventListener("change", () => {
        const val = spec.type === "boolean" ? input.checked : (spec.type === "number" ? parseFloat(input.value) : input.value);
        const results = applyPatch([{ action: "modify", id: selectedId, params: { [key]: val } }], sceneState);
        applyResultsToScene(results);
      });
      row.appendChild(input);
      propertiesBody.appendChild(row);
    }
  }
}

// ---------------------------------------------------------------------------
// Viewport toolbar (grid toggle, camera presets, play placeholder)
// ---------------------------------------------------------------------------
document.querySelectorAll(".icon-btn.tool").forEach((btn) => {
  btn.addEventListener("click", () => {
    const tool = btn.dataset.tool;
    if (tool === "grid") {
      gridHelper.visible = !gridHelper.visible;
      btn.classList.toggle("active", gridHelper.visible);
    } else if (tool === "light") {
      // Toggle the AO/bloom post-processing pair — a quick escape hatch for
      // lower-end devices, since screen-space effects are the priciest part
      // of either render pipeline.
      const on = !btn.classList.contains("active");
      pipeline.setEnhanced(on);
      btn.classList.toggle("active", on);
      toast(on ? "Enhanced lighting on (AO + glow)" : "Enhanced lighting off");
    } else {
      document.querySelectorAll(".icon-btn.tool").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
    }
  });
});
document.querySelector('.icon-btn.tool[data-tool="grid"]').classList.add("active");
const lightToolBtn = document.querySelector('.icon-btn.tool[data-tool="light"]');
lightToolBtn.classList.toggle("active", pipeline.isEnhanced());
lightToolBtn.title = "Toggle ambient occlusion + glow";
if (lowPowerMode) {
  toast(
    pipeline.kind === "webgpu"
      ? "Software WebGPU adapter detected — AO + glow start off for smoother FPS"
      : "Software renderer detected — AO + glow start off for smoother FPS"
  );
}

// ---------------------------------------------------------------------------
// Render backend toggle — WebGL (default) <-> WebGPU (experimental). Only
// two effective states even though the stored value can also be "auto"
// (legacy/default, treated identically to "webgl" — see bootstrapPipeline).
// A picked backend can't hot-swap (see renderBackend.js), so changing it
// here reloads the page.
// ---------------------------------------------------------------------------
const gpuBackendBtn = document.getElementById("gpuBackendBtn");
function renderBackendLabel() {
  return pipeline.kind === "webgpu" ? "GPU · WebGPU (experimental)" : "GPU · WebGL";
}
gpuBackendBtn.textContent = renderBackendLabel();
gpuBackendBtn.title = `Render backend — click to switch. Currently: ${renderBackendLabel()}. WebGPU is experimental and may be unstable on some drivers.`;
gpuBackendBtn.classList.toggle("gpu-active", pipeline.kind === "webgpu");
gpuBackendBtn.addEventListener("click", () => {
  const next = pipeline.kind === "webgpu" ? "webgl" : "webgpu";
  setBackendPref(next);
  toast(`Switching render backend to ${next.toUpperCase()}…`);
  setTimeout(() => location.reload(), 500);
});

document.getElementById("camSelect").addEventListener("change", (e) => {
  const val = e.target.value;
  if (val === "Top Cam") camera.position.set(0.01, 20, 0.01);
  else if (val === "Front Cam") camera.position.set(0, 3, 16);
  else camera.position.set(9, 7, 9);
  controls.target.set(0, 0.5, 0);
});

document.getElementById("playBtn").addEventListener("click", () => {
  controls.autoRotate = !controls.autoRotate;
  controls.autoRotateSpeed = 1.2;
  document.getElementById("playBtn").textContent = controls.autoRotate ? "⏸ Pause" : "▶ Play";
});

// ---------------------------------------------------------------------------
// Save / Export
// ---------------------------------------------------------------------------
document.getElementById("saveBtn").addEventListener("click", () => {
  if (sceneState.count() === 0) { toast("Nothing to save yet"); return; }
  const blob = new Blob([JSON.stringify(sceneState.toJSON(), null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = "prompt-to-3d-scene.json";
  a.click();
  URL.revokeObjectURL(url);
  document.getElementById("statusMsg").textContent = "Scene saved as JSON.";
  toast("Scene saved as JSON");
});

document.getElementById("exportBtn").addEventListener("click", () => {
  if (sceneState.count() === 0) { toast("Nothing to export yet"); return; }
  const dataUrl = renderer.domElement.toDataURL("image/png");
  const a = document.createElement("a");
  a.href = dataUrl; a.download = "prompt-to-3d-scene.png";
  a.click();
  document.getElementById("statusMsg").textContent = "Scene exported as PNG.";
  toast("Scene exported as PNG");
});

// ---------------------------------------------------------------------------
// Initial state
// ---------------------------------------------------------------------------
refreshEmptyState();
pushMessage("assistant", "Hi! Describe a scene to get started, or try one of the example prompts below.");
