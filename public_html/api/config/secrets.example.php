<?php
/**
 * Copy this file to secrets.php (same folder) and fill in your key.
 * secrets.php is git-ignored on purpose (see .gitignore) — never commit it.
 *
 * If your Hostinger plan lets you place files outside public_html/, move
 * secrets.php there instead (e.g. /home/USER/config/secrets.php) and update
 * the require path in api/generate.php accordingly — that is the safer
 * option described in SDD 3.3a. If you can't move it, the bundled
 * .htaccess in api/config/ already blocks direct HTTP access as a fallback.
 */
return [
    // Get a key from https://console.anthropic.com/ (Claude) — leave blank
    // to run the app fully in "mock NLU" mode with zero external API calls.
    'CLAUDE_API_KEY' => '',
    'CLAUDE_MODEL' => 'claude-sonnet-4-5-20250929',

    // Optional alternative provider.
    'OPENAI_API_KEY' => '',
    'OPENAI_MODEL' => 'gpt-4o-mini',

    // Which provider to prefer when both configured: 'claude' | 'openai' | 'mock'
    'PROVIDER' => 'mock',
];
