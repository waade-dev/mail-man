'use strict';

/**
 * mm beautify [file]
 *
 * Opens the last response (or a given JSON file) in a self-contained
 * browser page with syntax highlighting, collapse/expand, and a copy button.
 * Targets Chrome via the `open` package.
 */

const http  = require('http');
const net   = require('net');
const fs    = require('fs-extra');
const open  = require('open');
const chalk = require('chalk');
const store = require('../utils/store');
const { parsePath } = require('../utils/pathHelper');
const { error, info, warn } = require('../utils/output');

// ---------------------------------------------------------------------------
// Find a free TCP port
// ---------------------------------------------------------------------------

function getFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
    srv.on('error', reject);
  });
}

// ---------------------------------------------------------------------------
// Self-contained HTML page
// ---------------------------------------------------------------------------

function buildHtml(data) {
  const { meta, body } = data;
  const jsonStr = JSON.stringify(typeof body === 'string' ? tryParse(body) : body, null, 2)
    // Escape for safe embedding inside a <script> tag
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026');

  const metaJson = JSON.stringify(meta)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>mail-man response</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    --bg:       #1e1e1e;
    --surface:  #252526;
    --border:   #3c3c3c;
    --text:     #d4d4d4;
    --dim:      #6a6a6a;
    --green:    #6a9955;
    --blue:     #569cd6;
    --cyan:     #9cdcfe;
    --yellow:   #dcdcaa;
    --orange:   #ce9178;
    --purple:   #c586c0;
    --red:      #f44747;
    --badge-2xx:#16825d;
    --badge-3xx:#0e7490;
    --badge-4xx:#b45309;
    --badge-5xx:#b91c1c;
  }

  body {
    font-family: 'SF Mono', 'Fira Code', 'Consolas', 'Courier New', monospace;
    background: var(--bg);
    color: var(--text);
    min-height: 100vh;
    padding: 0;
  }

  /* ---- Top bar ---- */
  #topbar {
    background: var(--surface);
    border-bottom: 1px solid var(--border);
    padding: 12px 20px;
    display: flex;
    align-items: center;
    gap: 16px;
    flex-wrap: wrap;
  }

  #brand { color: var(--blue); font-weight: 700; font-size: 15px; letter-spacing: .5px; }

  .badge {
    display: inline-flex; align-items: center;
    padding: 3px 10px; border-radius: 4px;
    font-size: 13px; font-weight: 600;
  }
  .badge-2xx { background: var(--badge-2xx); color: #fff; }
  .badge-3xx { background: var(--badge-3xx); color: #fff; }
  .badge-4xx { background: var(--badge-4xx); color: #fff; }
  .badge-5xx { background: var(--badge-5xx); color: #fff; }
  .badge-def { background: var(--border);    color: var(--text); }

  .meta-pill {
    background: var(--border);
    color: var(--dim);
    padding: 2px 8px; border-radius: 3px;
    font-size: 12px;
  }
  .meta-url { color: var(--cyan); font-size: 12px; max-width: 60vw; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

  /* ---- Toolbar ---- */
  #toolbar {
    display: flex; align-items: center; gap: 8px;
    padding: 8px 20px;
    background: var(--surface);
    border-bottom: 1px solid var(--border);
  }

  button {
    background: var(--border); border: 1px solid #555;
    color: var(--text); padding: 4px 12px; border-radius: 4px;
    font-size: 12px; cursor: pointer; font-family: inherit;
  }
  button:hover { background: #3e3e3e; }

  #copy-btn.copied { background: var(--badge-2xx); border-color: #16825d; color: #fff; }

  /* ---- JSON viewer ---- */
  #json-container {
    padding: 20px;
    overflow: auto;
  }

  pre#json-output {
    background: transparent;
    font-size: 13.5px;
    line-height: 1.6;
    white-space: pre;
    tab-size: 2;
  }

  /* Syntax tokens */
  .jk  { color: var(--cyan); }      /* object keys  */
  .js  { color: var(--orange); }    /* string values */
  .jn  { color: var(--yellow); }    /* numbers       */
  .jb  { color: var(--purple); }    /* booleans+null */
  .jp  { color: var(--dim); }       /* punctuation   */

  /* Collapsible nodes */
  .fold-toggle {
    display: inline-block;
    cursor: pointer;
    user-select: none;
    width: 16px;
    color: var(--dim);
    font-size: 11px;
  }
  .fold-toggle::before { content: '▾'; }
  .fold-toggle.collapsed::before { content: '▸'; }

  .foldable { display: inline; }
  .foldable.collapsed > .fold-content { display: none; }
  .foldable.collapsed > .fold-placeholder { display: inline; }
  .fold-placeholder { color: var(--dim); display: none; }
</style>
</head>
<body>

<div id="topbar">
  <span id="brand">✉ mail-man</span>
  <span id="status-badge" class="badge"></span>
  <span id="method-badge" class="meta-pill"></span>
  <span id="url-label" class="meta-url"></span>
  <span id="duration-label" class="meta-pill"></span>
  <span id="ts-label" class="meta-pill"></span>
</div>

<div id="toolbar">
  <button id="copy-btn" onclick="copyJson()">Copy JSON</button>
  <button onclick="expandAll()">Expand all</button>
  <button onclick="collapseAll()">Collapse all</button>
  <span style="margin-left:auto; color:var(--dim); font-size:12px;">
    Server closes in <span id="countdown">5:00</span>
  </span>
</div>

<div id="json-container">
  <pre id="json-output"></pre>
</div>

<script>
'use strict';

// ---- Metadata ----
const meta = ${metaJson};
const rawJson = ${jsonStr};

(function initMeta() {
  const status = meta.status || 0;
  const el = document.getElementById('status-badge');
  el.textContent = status + (meta.statusText ? ' ' + meta.statusText : '');
  if      (status >= 200 && status < 300) el.className = 'badge badge-2xx';
  else if (status >= 300 && status < 400) el.className = 'badge badge-3xx';
  else if (status >= 400 && status < 500) el.className = 'badge badge-4xx';
  else if (status >= 500)                 el.className = 'badge badge-5xx';
  else                                    el.className = 'badge badge-def';

  document.getElementById('method-badge').textContent = meta.method || '';
  document.getElementById('url-label').textContent    = meta.url    || '';
  document.getElementById('duration-label').textContent = meta.duration ? meta.duration + 'ms' : '';
  document.getElementById('ts-label').textContent =
    meta.timestamp ? new Date(meta.timestamp).toLocaleString() : '';
})();

// ---- Countdown ----
(function initCountdown() {
  const SECONDS = 5 * 60;
  let remaining = SECONDS;
  const el = document.getElementById('countdown');
  setInterval(() => {
    remaining--;
    if (remaining <= 0) { el.textContent = '0:00'; return; }
    const m = Math.floor(remaining / 60);
    const s = remaining % 60;
    el.textContent = m + ':' + String(s).padStart(2, '0');
  }, 1000);
})();

// ---- JSON renderer with fold/collapse ----

function escHtml(s) {
  return String(s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;');
}

function renderNode(value, indent) {
  const pad = '  '.repeat(indent);
  const padInner = '  '.repeat(indent + 1);

  if (value === null)            return '<span class="jb">null</span>';
  if (typeof value === 'boolean') return '<span class="jb">' + value + '</span>';
  if (typeof value === 'number')  return '<span class="jn">' + value + '</span>';
  if (typeof value === 'string')  return '<span class="js">&quot;' + escHtml(value) + '&quot;</span>';

  if (Array.isArray(value)) {
    if (value.length === 0) return '<span class="jp">[]</span>';
    let inner = value.map((v, i) =>
      padInner + renderNode(v, indent + 1) + (i < value.length - 1 ? '<span class="jp">,</span>' : '')
    ).join('\\n');
    return (
      '<span class="foldable">' +
        '<span class="fold-toggle" onclick="toggleFold(this)"></span>' +
        '<span class="jp">[</span>' +
        '<span class="fold-content">\\n' + inner + '\\n' + pad + '</span>' +
        '<span class="fold-placeholder"> … ' + value.length + ' items </span>' +
        '<span class="jp">]</span>' +
      '</span>'
    );
  }

  if (typeof value === 'object') {
    const keys = Object.keys(value);
    if (keys.length === 0) return '<span class="jp">{}</span>';
    let inner = keys.map((k, i) =>
      padInner +
      '<span class="jk">&quot;' + escHtml(k) + '&quot;</span>' +
      '<span class="jp">: </span>' +
      renderNode(value[k], indent + 1) +
      (i < keys.length - 1 ? '<span class="jp">,</span>' : '')
    ).join('\\n');
    return (
      '<span class="foldable">' +
        '<span class="fold-toggle" onclick="toggleFold(this)"></span>' +
        '<span class="jp">{</span>' +
        '<span class="fold-content">\\n' + inner + '\\n' + pad + '</span>' +
        '<span class="fold-placeholder"> … ' + keys.length + ' keys </span>' +
        '<span class="jp">}</span>' +
      '</span>'
    );
  }

  return escHtml(String(value));
}

document.getElementById('json-output').innerHTML = renderNode(rawJson, 0);

// ---- Fold / expand ----
function toggleFold(toggle) {
  const node = toggle.parentElement;
  node.classList.toggle('collapsed');
  toggle.classList.toggle('collapsed');
}

function expandAll() {
  document.querySelectorAll('.foldable.collapsed').forEach(n => n.classList.remove('collapsed'));
  document.querySelectorAll('.fold-toggle.collapsed').forEach(n => n.classList.remove('collapsed'));
}

function collapseAll() {
  document.querySelectorAll('.foldable:not(.collapsed)').forEach(n => n.classList.add('collapsed'));
  document.querySelectorAll('.fold-toggle:not(.collapsed)').forEach(n => n.classList.add('collapsed'));
}

// ---- Copy ----
function copyJson() {
  navigator.clipboard.writeText(JSON.stringify(rawJson, null, 2)).then(() => {
    const btn = document.getElementById('copy-btn');
    btn.textContent = '✓ Copied!';
    btn.classList.add('copied');
    setTimeout(() => {
      btn.textContent = 'Copy JSON';
      btn.classList.remove('copied');
    }, 2000);
  });
}
</script>
</body>
</html>`;
}

function tryParse(str) {
  try { return JSON.parse(str); } catch { return str; }
}

// ---------------------------------------------------------------------------
// mm beautify [collection/request]
// ---------------------------------------------------------------------------

async function beautify(pathStr) {
  let responseData;
  const { collection, request } = parsePath(pathStr || '');

  if (collection && request) {
    // mm beautify my-api/get-users  →  per-request last response
    const r = await store.getLastResponse(collection, request);
    if (!r) {
      error(`No saved response for "${collection}/${request}". Hit it first: mm hit ${collection}/${request}`);
      process.exit(1);
    }
    responseData = {
      meta: {
        method:     r.method,
        url:        r.url,
        status:     r.status,
        statusText: r.statusText,
        duration:   r.duration,
        timestamp:  r.timestamp,
        collection: r.collection,
        request:    r.request,
      },
      body: r.body,
    };
  } else if (pathStr) {
    // Single token with no slash — treat as a file path
    try {
      const raw = await fs.readFile(pathStr, 'utf8');
      responseData = {
        meta: { url: pathStr, method: '', status: 0, timestamp: new Date().toISOString(), duration: 0 },
        body: tryParse(raw),
      };
    } catch (e) {
      error(`Could not read file: ${pathStr} — ${e.message}`);
      process.exit(1);
    }
  } else {
    // No args — load global lastResponse from state
    const state = await store.getState();
    if (!state.lastResponse) {
      error('No last response found. Hit a request first: mm hit <collection>/<request>');
      process.exit(1);
    }
    const r = state.lastResponse;
    responseData = {
      meta: {
        method:     r.method,
        url:        r.url,
        status:     r.status,
        statusText: r.statusText,
        duration:   r.duration,
        timestamp:  r.timestamp,
        collection: r.collection,
        request:    r.request,
      },
      body: r.body,
    };
  }

  const port = await getFreePort();
  const html = buildHtml(responseData);

  // Start a tiny HTTP server
  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
  });

  await new Promise((resolve, reject) => {
    server.listen(port, '127.0.0.1', resolve);
    server.on('error', reject);
  });

  const url = `http://127.0.0.1:${port}`;
  info(`Response viewer running at ${chalk.cyan.underline(url)}`);
  info('Server will close in 5 minutes.\n');

  // Open in Chrome
  try {
    await open(url, { app: { name: open.apps.chrome } });
  } catch {
    // Fall back to default browser if Chrome not found
    warn('Could not open Chrome. Trying default browser...');
    try {
      await open(url);
    } catch (e2) {
      warn(`Could not open browser automatically. Visit: ${url}`);
    }
  }

  // Auto-close after 5 minutes
  setTimeout(() => {
    info('5 minutes elapsed. Closing server.');
    server.close(() => process.exit(0));
  }, 5 * 60 * 1000).unref();

  // Keep the process alive
  await new Promise(() => {}); // resolved by the setTimeout above
}

module.exports = { beautify };
