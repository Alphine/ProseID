# Prompt-to-3D — AI Scene Composer

Implementation of `Prompt-to-3D_System_Design_Document_v3.md`: a browser-based
tool that turns plain-language prompts into interactive 3D scenes, built with
PHP (vanilla, shared-hosting friendly) + HTML5/vanilla JS + Three.js — no
framework, no build step.

## What's implemented (mapped to the SDD)

- **Card Catalog** (`data/card_catalog.json`, loaded client-side by
  `js/cardCatalog.js` and server-side by `api/lib/CardCatalog.php` from the
  same file — single source of truth) — 17 cards (tree, rock, flower_bush,
  mountain, pond, terrain, bench, fountain, lamp, gazebo, house, building,
  wall, path, car, cloud, campfire), each a whitelisted tool/function
  schema. §3.1
  - `house` — cottage with a window grid, roof overhang trim, and a small
    emissive porch light.
  - `building` — parametric high-rise (glass/concrete/brick styles) with an
    `InstancedMesh` window grid so tall towers stay cheap to render, plus a
    rooftop antenna/beacon.
  - `terrain` — a displaced-vertex ground patch (grass/sand/snow/rocky) for
    breaking up the flat default ground plane.
- **Card Registry** (`js/cardRegistry.js`) — fixed, procedural Three.js
  render logic per card. No `eval()`/`new Function()` anywhere. §3.2/3.4
- **Visual polish** — soft PCF shadow mapping + ACES tone mapping in both
  the composer and the landing hero preview, thin/subtle CSS shadows
  (`--shadow-sm/md/glow` in `css/style.css`), cursor-follow 3D tilt on cards
  (`js/tilt.js`) and scroll parallax on the hero (`js/parallax.js`).
- **Rendering pipeline (real-time, C2-Renderer inspired)** — the composer
  (`js/app.js`) and the landing hero preview (`js/landing-preview.js`) both
  run a small `EffectComposer` post-processing pipeline on top of the same
  Three.js rasterizer, approximating a few of the visual wins a path tracer
  gives "for free" while staying interactive (smooth orbit + multi-turn
  editing, no offline/progressive rendering):
  - **Image-based lighting** — `PMREMGenerator` convolves the real HDR
    photo in `assets/env/` (see `js/envLighting.js`, credit in
    `assets/env/ATTRIBUTION.md`) once at startup, so glass/metal materials
    (the `building` card, car paint, fountain water) get believable
    photographic reflections instead of flat unlit color. Falls back to the
    procedural `RoomEnvironment` if the HDR fails to load, and the same
    photo is shown as the visible sky background by default.
  - **SSAO** (`SSAOPass`, composer only) — cheap screen-space ambient
    occlusion for natural-looking contact shadows in corners/creases;
    rendered at half resolution and upscaled to keep the cost down.
  - **Bloom** (`UnrealBloomPass`) — soft glow around emissive surfaces
    (house porch light, street lamps, campfire, building rooftop beacon).
  - **ACES filmic tone mapping** for a more filmic, less blown-out look.
  - **Low-power fallback** — both files detect a software/CPU rasterizer
    (SwiftShader, llvmpipe, etc., via `WEBGL_debug_renderer_info`) and, when
    detected, disable shadow mapping, SSAO, and bloom by default so the
    scene stays responsive on constrained hardware. In the composer, the
    "light" icon in the viewport toolbar lets a user re-enable AO + bloom
    manually at any time; a one-time toast explains the default when it
    kicks in.
  - **Runtime auto-throttle** — the string-match above only catches software
    rasterizers; a real-but-weak integrated GPU reports a normal vendor
    string and would otherwise run the full pipeline unthrottled. The
    composer also watches its own measured FPS and, if it stays under 24fps
    for ~2 sustained seconds, auto-disables AO + bloom the same way the
    manual toggle would (with a toast explaining what happened).
  - **GPU resource cleanup** — every card rebuild (multi-turn "modify", or a
    properties-panel slider drag, which calls this on every change) and
    removal now disposes the old mesh's geometries/materials/textures
    instead of just dropping the reference, avoiding a slow VRAM leak over
    long editing sessions.
  - The landing hero preview also pauses its render loop via
    `IntersectionObserver` once scrolled out of view (and when the tab is
    backgrounded), and both files debounce their `ResizeObserver` callbacks
    so a manual window-drag resize doesn't thrash render-target
    reallocation.

  All post-processing passes (`EffectComposer`, `RenderPass`, `SSAOPass`,
  `UnrealBloomPass`, `SMAAPass`, `BokehPass`, `ShaderPass` cinematic grade,
  `OutputPass`) are vendored locally under
  `js/vendor/three/examples/jsm/`, same as the rest of three.js — no CDN
  dependency. WebGPU (`three.webgpu.js` / `three.tsl.js`) is vendored too
  but intentionally unused — `app.js` hardcodes WebGL after a confirmed
  real-hardware driver crash on WebGPU; see `js/renderBackend.js`.
- **Layout Engine** (`js/layoutEngine.js`) — resolves semantic relations
  (`beside`, `behind`, `in_front_of`, `on_top_of`, `scattered_around`) into
  coordinates, with the v3 fallback for invalid/circular references
  (falls back to the next open grid slot instead of crashing). §3.2
- **Scene State** (`js/sceneState.js`) — client source of truth keyed by id,
  the foundation for multi-turn patch-based editing. §3.4/§4
- **Multi-turn editing** — every turn sends the current Scene State summary
  + prompt to the server; the model (or mock) replies with
  `add`/`modify`/`remove` actions. §4
- **PHP API proxy** (`api/generate.php` + `api/lib/*`) — four active
  layers:
  - Rate limiting per IP (SQLite, 10 req/60s) + daily budget cap. §3.3b/c
  - Input validation: 500-char cap + prompt-injection keyword heuristic.
    §3.3d
  - Sanity check on LLM output: card whitelist, max-50-objects cap, drops
    malformed actions. §3.3e
  - Cache layer sharing one `prompt_cache` table with `source` column
    (`organic` cost-saving cache vs `curated_demo` reliability cache). §3.3f
- **Demo-reliability cache** (`api/lib/DemoPrompts.php`) — 6 curated demo
  scenes wired to the "Try These Prompts" chips, served with zero live API
  dependency. §3.3f
- **API key protection** — `config/secrets.php` is git-ignored and blocked
  from direct HTTP access via `.htaccess`; move it outside `public_html/` if
  your host allows it. §3.3a
- **Landing page + login-gated app** — `index.html` is a public marketing
  landing page (with a live, non-interactive Three.js preview in the hero,
  not a static image); `login.html` handles sign up/log in; `app.php` is the
  actual composer and redirects anonymous visitors to `login.html` via a
  server-side session check. The API proxy (`api/generate.php`) also
  requires a logged-in session, using the user id (not raw IP) as the
  rate-limit identifier.
- **Render performance ceiling** — hard cap of 50 objects/scene, enforced
  server-side in the sanity checker. §3.2/§6

### Mock NLU fallback (works with zero API key)

`api/lib/MockNLU.php` is a small rule-based stand-in for the LLM. With no
API key configured, the whole pipeline (rate limit → cache → sanity check →
Layout Engine → render) still works end-to-end using keyword matching, so
you can develop/demo the UI immediately. Swap in a real key any time — see
**Configuring a real LLM** below — and the exact same pipeline calls Claude
or OpenAI instead.

## Running locally

Requires PHP 8+ with `pdo_sqlite` (bundled in most PHP installs).

```bash
cd public_html
php -S localhost:8000
```

Open http://localhost:8000/ — you'll land on the marketing page. Click
**Try Composer** (or **Log in**), sign up with any name/email/password
(min. 6 characters — stored locally in `api/data/users.db`, nothing is
emailed anywhere), and you're dropped into the composer. It works
immediately in mock mode, no API key needed.

## Configuring a real LLM (optional)

1. Copy `public_html/api/config/secrets.example.php` to
   `public_html/api/config/secrets.php` if you haven't already (the repo
   does not ship `secrets.php` — it is git-ignored; without it the app
   simply runs in mock mode).
2. Fill in `CLAUDE_API_KEY` (from https://console.anthropic.com/) and/or
   `OPENAI_API_KEY`, then set `PROVIDER` to `'claude'` or `'openai'`.
3. Reload the app — prompts now go to the live API. If the API call ever
   fails, `LLMClient.php` automatically falls back to `MockNLU` so the app
   never hard-fails mid-demo.

**Never commit `secrets.php`** — it's already in `.gitignore`.

## Deploying to Hostinger (shared hosting)

1. Upload the contents of `public_html/` to your hosting account's
   `public_html/` folder (or a subfolder, if hosting elsewhere on the
   domain).
2. Make sure `api/data/` is writable (PHP needs to create the SQLite files
   there on first request) — `755` is usually enough.
3. If your plan allows files outside the webroot, move
   `api/config/secrets.php` there and update the `require` path at the top
   of `api/generate.php` (see the comment in `secrets.example.php`).
   Otherwise the bundled `.htaccess` in `api/config/` blocks direct access
   as a fallback.
4. No build step, no npm install needed in production — `three.js` is
   vendored locally under `public_html/js/vendor/three/`.

## Project structure

```
public_html/
  index.html            Public landing page (marketing, live 3D preview)
  login.html             Public login / sign-up page
  app.php                 The composer UI — PHP-gated, redirects to login.html
                          if there's no active session
  css/
    style.css              Dark theme shared by app.php and the landing/login pages
    landing.css             Landing + auth page specific styles
  js/
    app.js                Main controller: chat, API calls, Three.js scene
    landing-preview.js     Lightweight auto-rotating preview for the hero
    cardCatalog.js         Tool/function schema catalog (client)
    cardRegistry.js        Procedural Three.js builders per card
    layoutEngine.js         Relation resolution + fallback grid slot
    sceneState.js           Client Scene State
    vendor/three/           Vendored three.js + OrbitControls (no CDN dep)
  api/
    generate.php            Main proxy endpoint (auth + rate limit/cache/sanity)
    demo_list.php            Lists curated demo prompts for the UI
    auth/
      register.php             Create account + start session
      login.php                 Verify credentials + start session
      logout.php                 Destroy session
      me.php                      Current session's user, if any
    lib/
      Auth.php                  SQLite user store + session helpers
      CardCatalog.php          Server whitelist mirror
      RateLimiter.php           SQLite rate limiter + daily budget
      Cache.php                  SQLite prompt cache (organic + curated)
      SanityChecker.php          Output validation before forwarding
      InputValidator.php         Prompt length cap + injection heuristic
      MockNLU.php                 Zero-config rule-based fallback "LLM"
      DemoPrompts.php              6 curated demo scenes
      LLMClient.php                 Claude / OpenAI tool-use API calls
    config/
      secrets.example.php        Template — copy to secrets.php
      secrets.php                 Working copy (mock mode by default)
    data/                        SQLite databases (created on first run,
                                  includes users.db, ratelimit.db, cache.db)
```

## Auth notes

- Sessions are plain PHP sessions (cookie-based), passwords hashed with
  `password_hash()` (bcrypt). This is intentionally minimal — good enough to
  gate the demo per-user, not a full account system (no password reset,
  email verification, etc.).
- `api/generate.php` requires a session; hitting it directly without logging
  in returns `401`. The client (`js/app.js`) redirects to `login.html` if it
  ever gets a 401 mid-session (e.g. cookie expired).
- Rate limiting is keyed by user id once logged in, so one user's usage
  doesn't affect another's, and hitting the endpoint anonymously is blocked
  before it ever reaches the rate limiter.

## Notes / open items carried over from the SDD (§8)

- Final LLM provider choice (Claude vs OpenAI) — both are wired up in
  `LLMClient.php`; pick one in `config/secrets.php`.
- The 50-object cap and the "80 cards → two-stage categorization" threshold
  are both estimates per the SDD, meant to be revisited after real
  profiling/scaling (§7 Fase 2–3).
