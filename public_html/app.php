<?php
/**
 * Compose UI — gated behind login. Anonymous visitors are bounced to
 * login.html; the landing page (index.html) is the only public entry point
 * besides login/signup.
 */
require __DIR__ . '/api/lib/Auth.php';
require __DIR__ . '/api/lib/InputValidator.php';
$user = Auth::currentUser();
if (!$user) {
    header('Location: login.html');
    exit;
}
?>
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Prompt-to-3D · AI Scene Composer</title>
<link rel="icon" href="favicon.svg" type="image/svg+xml" />
<link rel="stylesheet" href="css/style.css" />
</head>
<body>
<div id="app">

  <header class="topbar">
    <div class="brand">
      <div class="brand-icon">◆</div>
      <div class="brand-text">
        <div class="brand-name">Prompt-to-3D <span class="badge">BETA</span></div>
        <div class="brand-sub">AI Scene Composer</div>
      </div>
    </div>
    <div class="topbar-center">
      <button class="tab active" data-mode="compose">✎ Compose</button>
      <button class="tab" data-mode="explore" title="Coming soon">Explore</button>
    </div>
    <div class="topbar-right">
      <button class="btn ghost" id="saveBtn">⬆ Save</button>
      <button class="btn ghost" id="exportBtn">⬇ Export</button>
      <button class="btn icon" title="Help" aria-label="Help">?</button>
      <div class="user-chip" title="<?php echo htmlspecialchars($user['email']); ?>">
        <span class="user-avatar"><?php echo htmlspecialchars(mb_strtoupper(mb_substr($user['name'], 0, 1))); ?></span>
        <span class="user-name"><?php echo htmlspecialchars($user['name']); ?></span>
      </div>
      <button class="btn ghost" id="logoutBtn" title="Log out" aria-label="Log out">⏻</button>
    </div>
  </header>

  <div class="workspace">

    <!-- LEFT: CHAT -->
    <aside class="panel chat-panel">
      <div class="panel-header">
        <span>CHAT</span>
        <button class="icon-btn" id="newChatBtn" title="New scene" aria-label="New scene">✦</button>
      </div>
      <div class="chat-log" id="chatLog"></div>
      <div class="try-prompts" id="tryPrompts">
        <div class="try-prompts-label">TRY THESE PROMPTS</div>
        <div class="try-prompts-row" id="tryPromptsRow"><!-- populated by app.js --></div>
      </div>
      <div class="chat-input-row">
        <input id="promptInput" type="text" placeholder="Describe your scene…" maxlength="<?php echo InputValidator::MAX_PROMPT_LENGTH; ?>" autocomplete="off" />
        <button id="sendBtn" class="send-btn" title="Send" aria-label="Send">➤</button>
      </div>
    </aside>

    <!-- CENTER: VIEWPORT -->
    <main class="panel viewport-panel">
      <div class="viewport-toolbar">
        <button class="btn small" id="playBtn">▶ Play</button>
        <select id="camSelect" class="select small">
          <option>Free Cam</option>
          <option>Top Cam</option>
          <option>Front Cam</option>
        </select>
        <div class="toolbar-sep"></div>
        <button class="icon-btn tool" data-tool="move" title="Move" aria-label="Move">✛</button>
        <button class="icon-btn tool" data-tool="rotate" title="Rotate" aria-label="Rotate">↻</button>
        <button class="icon-btn tool" data-tool="scale" title="Scale" aria-label="Scale">▦</button>
        <button class="icon-btn tool" data-tool="grid" title="Toggle grid" aria-label="Toggle grid">▤</button>
        <button class="icon-btn tool" data-tool="light" title="Lighting" aria-label="Lighting">☀</button>
        <div class="toolbar-spacer"></div>
        <div class="perf-badge"><span id="fpsVal">60</span> FPS</div>
      </div>
      <div id="canvasWrap">
        <canvas id="scene3d"></canvas>
        <div id="loadingOverlay" class="loading-overlay">
          <div class="spinner"></div>
          <div id="loadingText">Composing scene…</div>
        </div>
        <div id="emptyState" class="empty-state">
          <div class="empty-icon">◆</div>
          <div class="empty-title">Describe it. See it in 3D.</div>
          <div class="empty-sub">Type a prompt on the left, or click one of the example prompts to start.</div>
        </div>
      </div>

      <!-- ADD TO SCENE -->
      <div class="add-to-scene">
        <div class="ats-header">
          <span class="ats-title">ADD TO SCENE</span>
          <input id="cardSearch" class="ats-search" placeholder="Search objects…" />
        </div>
        <div class="ats-tabs" id="categoryTabs"></div>
        <div class="ats-grid" id="cardGrid"></div>
      </div>
    </main>

    <!-- RIGHT: OUTLINER + PROPERTIES -->
    <aside class="panel right-panel">
      <div class="panel-header">
        <span>SCENE OUTLINER</span>
      </div>
      <input id="outlinerSearch" class="ats-search wide" placeholder="Search…" />
      <div class="outliner-list" id="outlinerList"></div>

      <div class="panel-header props-header">
        <span>PROPERTIES</span>
      </div>
      <div class="properties-body" id="propertiesBody">
        <div class="props-empty">Select an object to edit its properties.</div>
      </div>
    </aside>

  </div>

  <footer class="statusbar">
    <span id="statusMsg">Ready.</span>
    <span class="statusbar-right"><span id="objCount">0</span> objects · <span id="sourceTag">—</span></span>
  </footer>

</div>

<!--
  three.js is vendored locally under js/vendor/three/ so the app has no
  runtime dependency on an external CDN (works on Hostinger with no build
  step, and won't break if a CDN is unreachable during judging).
-->
<script type="importmap">
{
  "imports": {
    "three": "./js/vendor/three/build/three.module.js",
    "three/webgpu": "./js/vendor/three/build/three.webgpu.js",
    "three/tsl": "./js/vendor/three/build/three.tsl.js",
    "three/addons/": "./js/vendor/three/examples/jsm/"
  }
}
</script>
<script>
document.getElementById('logoutBtn').addEventListener('click', async () => {
  await fetch('api/auth/logout.php', { method: 'POST' });
  window.location.href = 'login.html';
});
</script>
<script type="module" src="js/app.js"></script>
</body>
</html>
