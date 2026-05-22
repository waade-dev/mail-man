'use strict';

/**
 * src/controllers/BeautifyReqController.js
 *
 * mm b-req <collection/request>
 *
 * Opens the saved request definition in Chrome — method, URL (with variables
 * resolved), headers, body, and auth — same dark VS Code theme as b-res.
 * Also shows the raw {{VAR}} form side-by-side when an env is active.
 */

const http  = require('http');
const net   = require('net');
const open  = require('open');
const chalk = require('chalk');
const Collection          = require('../models/Collection');
const State               = require('../models/State');
const Environment         = require('../models/Environment');
const { resolveRequest }  = require('../utils/interpolate');
const { parsePath }       = require('../utils/pathHelper');
const { error, info, warn } = require('../views/console');

// ─────────────────────────────────────────────────────────────
//  Free port
// ─────────────────────────────────────────────────────────────

function getFreePort() {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    });
    s.on('error', reject);
  });
}

// ─────────────────────────────────────────────────────────────
//  HTML builder
// ─────────────────────────────────────────────────────────────

function esc(s) {
  return String(s === null || s === undefined ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function embedJson(obj) {
  return JSON.stringify(obj, null, 2)
    .replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');
}

function methodColor(m) {
  const map = {
    GET: '#6a9955', POST: '#dcdcaa', PUT: '#569cd6',
    PATCH: '#c586c0', DELETE: '#f44747', HEAD: '#9cdcfe', OPTIONS: '#858585',
  };
  return map[(m || '').toUpperCase()] || '#d4d4d4';
}

function buildHtml({ req, resolved, envName, collection, request }) {
  const method       = (req.method || 'GET').toUpperCase();
  const mColor       = methodColor(method);
  const hasHeaders   = req.headers && Object.keys(req.headers).length > 0;
  const hasBody      = req.body !== null && req.body !== undefined;
  const hasAuth      = req.auth && req.auth.type && req.auth.type !== 'none';
  const hasEnv       = !!envName;
  const urlChanged   = hasEnv && resolved.url !== req.url;

  // Build cURL string from resolved request
  const curlHeaders  = Object.entries(resolved.headers || {})
    .map(([k, v]) => `-H '${k}: ${v}'`).join(' \\\n     ');
  const curlBody     = resolved.body
    ? `-d '${JSON.stringify(resolved.body)}' \\\n     ` : '';
  const curlStr      = `curl -X ${method} \\\n     '${resolved.url}' \\\n     ${curlHeaders ? curlHeaders + ' \\\n     ' : ''}${curlBody}`.trimEnd();

  const authRows = (() => {
    if (!hasAuth) return '';
    const a = req.auth;
    if (a.type === 'bearer') return `<tr><td>Type</td><td>Bearer Token</td></tr><tr><td>Token</td><td class="val-orange">${esc(a.token)}</td></tr>`;
    if (a.type === 'basic')  return `<tr><td>Type</td><td>Basic Auth</td></tr><tr><td>Username</td><td class="val-orange">${esc(a.username)}</td></tr><tr><td>Password</td><td class="val-orange">••••••</td></tr>`;
    if (a.type === 'apikey') return `<tr><td>Type</td><td>API Key</td></tr><tr><td>Header</td><td class="val-cyan">${esc(a.header)}</td></tr><tr><td>Key</td><td class="val-orange">${esc(a.key)}</td></tr>`;
    return `<tr><td>Type</td><td>${esc(a.type)}</td></tr>`;
  })();

  const bodyJson  = embedJson(req.body);
  const descHtml  = req.description ? `<div class="desc">${esc(req.description)}</div>` : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>✉ ${esc(collection)}/${esc(request)}</title>
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{
  --bg:#1e1e1e;--surface:#252526;--surface2:#2d2d30;--border:#3c3c3c;
  --text:#d4d4d4;--dim:#858585;--dim2:#6a6a6a;
  --blue:#569cd6;--cyan:#9cdcfe;--green:#6a9955;
  --yellow:#dcdcaa;--orange:#ce9178;--purple:#c586c0;--red:#f44747;
}
body{font-family:'SF Mono','Fira Code',Consolas,'Courier New',monospace;
  background:var(--bg);color:var(--text);min-height:100vh}

/* ── Topbar ── */
#topbar{background:var(--surface);border-bottom:1px solid var(--border);
  padding:12px 20px;display:flex;align-items:center;gap:12px;flex-wrap:wrap}
#brand{color:var(--blue);font-weight:700;font-size:15px;letter-spacing:.5px}
.method-badge{padding:4px 12px;border-radius:4px;font-size:13px;font-weight:700;
  color:#111;background:${mColor}}
.meta-path{color:var(--cyan);font-size:13px}
.meta-pill{background:var(--border);color:var(--dim);
  padding:2px 8px;border-radius:3px;font-size:12px}
.meta-url{color:var(--text);font-size:12px;word-break:break-all;max-width:60vw}
.env-badge{background:#094771;color:#9cdcfe;padding:2px 8px;border-radius:3px;font-size:12px}

/* ── Toolbar ── */
#toolbar{display:flex;align-items:center;gap:8px;padding:8px 20px;
  background:var(--surface);border-bottom:1px solid var(--border)}
button{background:var(--border);border:1px solid #555;color:var(--text);
  padding:4px 12px;border-radius:4px;font-size:12px;cursor:pointer;font-family:inherit}
button:hover{background:#3e3e3e}
#copy-curl.copied{background:#16825d;border-color:#16825d;color:#fff}
.spacer{flex:1}
.timer{color:var(--dim);font-size:12px}

/* ── Content ── */
#content{padding:20px;display:flex;flex-direction:column;gap:20px}

.desc{color:var(--dim);font-size:12px;font-style:italic;
  padding:8px 12px;background:var(--surface);border-radius:4px;
  border-left:3px solid var(--border)}

/* ── Sections ── */
.section{background:var(--surface);border:1px solid var(--border);border-radius:6px;overflow:hidden}
.section-head{padding:8px 14px;display:flex;align-items:center;gap:8px;
  border-bottom:1px solid var(--border);cursor:pointer;user-select:none}
.section-head:hover{background:var(--surface2)}
.section-label{font-size:11px;text-transform:uppercase;letter-spacing:.7px;color:var(--dim);font-weight:700}
.section-arrow{color:var(--dim);font-size:10px;transition:transform .15s}
.section-arrow.open{transform:rotate(90deg)}
.section-body{padding:14px;display:none}
.section-body.open{display:block}

/* ── URL block ── */
.url-block{display:flex;flex-direction:column;gap:6px}
.url-raw{color:var(--dim2);font-size:12px}
.url-resolved{color:var(--cyan);font-size:13px;word-break:break-all}
.url-label{font-size:11px;color:var(--dim);text-transform:uppercase;letter-spacing:.5px}

/* ── KV table ── */
table{width:100%;border-collapse:collapse;font-size:12.5px}
td{padding:4px 8px;vertical-align:top}
tr:not(:last-child) td{border-bottom:1px solid var(--border)}
td:first-child{color:var(--cyan);white-space:nowrap;padding-right:16px;width:1%}
.val-orange{color:var(--orange)}.val-cyan{color:var(--cyan)}.val-dim{color:var(--dim)}

/* ── JSON body ── */
pre.json-pre{font-size:13px;line-height:1.6;white-space:pre;tab-size:2}
.jk{color:var(--cyan)}.js{color:var(--orange)}.jn{color:var(--yellow)}
.jb{color:var(--purple)}.jp{color:var(--dim2)}
.fold-toggle{display:inline-block;cursor:pointer;user-select:none;width:16px;color:var(--dim);font-size:10px}
.fold-toggle::before{content:'▾'}.fold-toggle.collapsed::before{content:'▸'}
.foldable{display:inline}
.foldable.collapsed>.fold-content{display:none}
.foldable.collapsed>.fold-placeholder{display:inline}
.fold-placeholder{color:var(--dim);display:none}

/* ── cURL block ── */
pre.curl-pre{font-size:12px;line-height:1.7;white-space:pre-wrap;word-break:break-all;color:var(--green)}
</style>
</head>
<body>

<div id="topbar">
  <span id="brand">✉ mail-man</span>
  <span class="method-badge">${esc(method)}</span>
  <span class="meta-path">${esc(collection)}/${esc(request)}</span>
  ${hasEnv ? `<span class="env-badge">${esc(envName)}</span>` : ''}
  <span class="meta-url">${esc(resolved.url)}</span>
</div>

<div id="toolbar">
  <button id="copy-curl" onclick="copyCurl()">Copy as cURL</button>
  <button onclick="expandAll()">Expand all</button>
  <button onclick="collapseAll()">Collapse all</button>
  <span class="spacer"></span>
  <span class="timer">Server closes in <span id="countdown">5:00</span></span>
</div>

<div id="content">
  ${descHtml}

  <!-- URL -->
  <div class="section">
    <div class="section-head" onclick="toggleSection(this)">
      <span class="section-arrow open">▸</span>
      <span class="section-label">URL</span>
    </div>
    <div class="section-body open">
      <div class="url-block">
        ${urlChanged ? `
        <div>
          <div class="url-label">Raw (with variables)</div>
          <div class="url-raw">${esc(req.url)}</div>
        </div>
        <div>
          <div class="url-label">Resolved (${esc(envName)})</div>
          <div class="url-resolved">${esc(resolved.url)}</div>
        </div>` : `<div class="url-resolved">${esc(req.url)}</div>`}
      </div>
    </div>
  </div>

  ${hasHeaders ? `
  <!-- Headers -->
  <div class="section">
    <div class="section-head" onclick="toggleSection(this)">
      <span class="section-arrow open">▸</span>
      <span class="section-label">Headers</span>
      <span class="meta-pill">${Object.keys(req.headers).length}</span>
    </div>
    <div class="section-body open">
      <table>
        ${Object.entries(req.headers).map(([k, v]) =>
          `<tr><td>${esc(k)}</td><td class="val-orange">${esc(v)}</td></tr>`
        ).join('')}
      </table>
    </div>
  </div>` : ''}

  ${hasAuth ? `
  <!-- Auth -->
  <div class="section">
    <div class="section-head" onclick="toggleSection(this)">
      <span class="section-arrow open">▸</span>
      <span class="section-label">Auth</span>
      <span class="meta-pill">${esc(req.auth.type)}</span>
    </div>
    <div class="section-body open">
      <table>${authRows}</table>
    </div>
  </div>` : ''}

  ${hasBody ? `
  <!-- Body -->
  <div class="section">
    <div class="section-head" onclick="toggleSection(this)">
      <span class="section-arrow open">▸</span>
      <span class="section-label">Body</span>
    </div>
    <div class="section-body open">
      <pre class="json-pre" id="body-output"></pre>
    </div>
  </div>` : ''}

  <!-- cURL -->
  <div class="section">
    <div class="section-head" onclick="toggleSection(this)">
      <span class="section-arrow">▸</span>
      <span class="section-label">cURL</span>
    </div>
    <div class="section-body">
      <pre class="curl-pre">${esc(curlStr)}</pre>
    </div>
  </div>

</div><!-- /content -->

<script>
'use strict';

const RAW_BODY = ${hasBody ? bodyJson : 'null'};
const CURL_STR = ${JSON.stringify(curlStr)};

// ── Render body JSON ──
if (RAW_BODY !== null) {
  document.getElementById('body-output').innerHTML = renderNode(RAW_BODY, 0);
}

// ── Section toggle ──
function toggleSection(head) {
  const arrow = head.querySelector('.section-arrow');
  const body  = head.nextElementSibling;
  arrow.classList.toggle('open');
  body.classList.toggle('open');
}

// ── Expand / collapse JSON folds ──
function expandAll() {
  document.querySelectorAll('.foldable.collapsed').forEach(n => n.classList.remove('collapsed'));
  document.querySelectorAll('.fold-toggle.collapsed').forEach(n => n.classList.remove('collapsed'));
}
function collapseAll() {
  document.querySelectorAll('.foldable:not(.collapsed)').forEach(n => n.classList.add('collapsed'));
  document.querySelectorAll('.fold-toggle:not(.collapsed)').forEach(n => n.classList.add('collapsed'));
}

// ── Copy cURL ──
function copyCurl() {
  navigator.clipboard.writeText(CURL_STR).then(() => {
    const btn = document.getElementById('copy-curl');
    btn.textContent = '✓ Copied!';
    btn.classList.add('copied');
    setTimeout(() => { btn.textContent = 'Copy as cURL'; btn.classList.remove('copied'); }, 2000);
  });
}

// ── JSON renderer ──
function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function renderNode(value, indent) {
  const pad      = '  '.repeat(indent);
  const padInner = '  '.repeat(indent + 1);
  if (value === null)             return '<span class="jb">null</span>';
  if (typeof value === 'boolean') return '<span class="jb">' + value + '</span>';
  if (typeof value === 'number')  return '<span class="jn">' + value + '</span>';
  if (typeof value === 'string')  return '<span class="js">&quot;' + escHtml(value) + '&quot;</span>';
  if (Array.isArray(value)) {
    if (!value.length) return '<span class="jp">[]</span>';
    const inner = value.map((v, i) =>
      padInner + renderNode(v, indent+1) + (i < value.length-1 ? '<span class="jp">,</span>' : '')
    ).join('\\n');
    return '<span class="foldable"><span class="fold-toggle" onclick="tf(this)"></span><span class="jp">[</span><span class="fold-content">\\n'+inner+'\\n'+pad+'</span><span class="fold-placeholder"> … '+value.length+' items </span><span class="jp">]</span></span>';
  }
  if (typeof value === 'object') {
    const keys = Object.keys(value);
    if (!keys.length) return '<span class="jp">{}</span>';
    const inner = keys.map((k,i) =>
      padInner+'<span class="jk">&quot;'+escHtml(k)+'&quot;</span><span class="jp">: </span>'+
      renderNode(value[k], indent+1)+(i < keys.length-1 ? '<span class="jp">,</span>' : '')
    ).join('\\n');
    return '<span class="foldable"><span class="fold-toggle" onclick="tf(this)"></span><span class="jp">{</span><span class="fold-content">\\n'+inner+'\\n'+pad+'</span><span class="fold-placeholder"> … '+keys.length+' keys </span><span class="jp">}</span></span>';
  }
  return escHtml(String(value));
}
function tf(toggle) {
  toggle.parentElement.classList.toggle('collapsed');
  toggle.classList.toggle('collapsed');
}

// ── Countdown ──
(function() {
  let r = 5 * 60;
  const el = document.getElementById('countdown');
  setInterval(() => {
    r--;
    if (r <= 0) { el.textContent = '0:00'; return; }
    el.textContent = Math.floor(r/60) + ':' + String(r%60).padStart(2,'0');
  }, 1000);
})();
</script>
</body>
</html>`;
}

// ─────────────────────────────────────────────────────────────
//  mm b-req <collection/request>
// ─────────────────────────────────────────────────────────────

async function beautifyReq(pathStr) {
  const { collection, request } = parsePath(pathStr || '');

  if (!collection || !request) {
    error('Usage: mm b-req <collection>/<request>');
    error('  e.g. mm b-req my-api/get-users');
    process.exit(1);
  }

  const req = await Collection.getRequest(collection, request);
  if (!req) {
    error(`Request not found: ${collection}/${request}`);
    error(`  Add it with: mm add ${collection}/${request}`);
    process.exit(1);
  }

  // Resolve variables from active environment
  const state   = await State.get();
  let envVars   = {};
  let envName   = null;
  if (state.activeEnv) {
    const env = await Environment.get(state.activeEnv);
    if (env) { envVars = env.variables || {}; envName = state.activeEnv; }
  }
  const resolved = resolveRequest(req, envVars);

  const port = await getFreePort();
  const html = buildHtml({ req, resolved, envName, collection, request });

  const server = require('http').createServer((_, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
  });

  await new Promise((resolve, reject) => {
    server.listen(port, '127.0.0.1', resolve);
    server.on('error', reject);
  });

  const url = `http://127.0.0.1:${port}`;
  info(`Request viewer → ${chalk.cyan.underline(url)}`);
  info('Server closes in 5 minutes.\n');

  try {
    await open(url, { app: { name: open.apps.chrome } });
  } catch {
    warn('Could not open Chrome. Trying default browser…');
    try { await open(url); } catch { warn(`Visit: ${url}`); }
  }

  setTimeout(() => {
    server.close(() => process.exit(0));
  }, 5 * 60 * 1000).unref();

  await new Promise(() => {});
}

module.exports = { beautifyReq };
