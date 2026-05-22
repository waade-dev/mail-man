'use strict';

/**
 * src/views/DashboardView.js
 *
 * Builds the self-contained HTML string for `mm start` dashboard.
 * Pure presentation — returns a string, no I/O.
 */

/**
 * Build and return the complete dashboard HTML string.
 * @param {number} port  The port the HTTP server is listening on.
 * @returns {string}
 */
function build(port) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>✉ mail-man</title>
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}

:root{
  --bg:#1e1e1e;--surface:#252526;--surface2:#2d2d30;--border:#3c3c3c;
  --text:#d4d4d4;--dim:#858585;--dim2:#6a6a6a;
  --blue:#569cd6;--cyan:#9cdcfe;--green:#6a9955;--green2:#4ec9b0;
  --yellow:#dcdcaa;--orange:#ce9178;--purple:#c586c0;--red:#f44747;
  --method-get:#6a9955;--method-post:#dcdcaa;--method-put:#569cd6;
  --method-patch:#c586c0;--method-delete:#f44747;--method-head:#9cdcfe;
  --badge-2xx:#16825d;--badge-3xx:#0e7490;--badge-4xx:#b45309;--badge-5xx:#b91c1c;
  --sidebar-w:260px;
}

body{font-family:'SF Mono','Fira Code',Consolas,'Courier New',monospace;
  background:var(--bg);color:var(--text);height:100vh;
  display:grid;grid-template-rows:52px 1fr 110px;overflow:hidden}

/* ── Header ──────────────────────────────── */
#header{
  background:var(--surface);border-bottom:1px solid var(--border);
  display:flex;align-items:center;gap:12px;padding:0 16px;
}
#brand{color:var(--blue);font-weight:700;font-size:15px;letter-spacing:.5px;flex:none}
#env-select{
  background:var(--surface2);border:1px solid var(--border);color:var(--text);
  padding:4px 8px;border-radius:4px;font-family:inherit;font-size:12px;
}
#env-label{color:var(--dim);font-size:12px}
.header-spacer{flex:1}
#stop-btn{
  background:#3e1c1c;border:1px solid #6b2020;color:#f88;
  padding:5px 14px;border-radius:4px;font-size:12px;cursor:pointer;font-family:inherit;
}
#stop-btn:hover{background:#5a2222}
#status-dot{width:8px;height:8px;border-radius:50%;background:var(--badge-2xx);flex:none}

/* ── Body grid ──────────────────────────── */
#body{display:grid;grid-template-columns:var(--sidebar-w) 1fr;overflow:hidden}

/* ── Sidebar ────────────────────────────── */
#sidebar{
  background:var(--surface);border-right:1px solid var(--border);
  overflow-y:auto;display:flex;flex-direction:column;
}
#sidebar-header{
  padding:10px 12px 8px;font-size:11px;color:var(--dim);
  text-transform:uppercase;letter-spacing:.8px;border-bottom:1px solid var(--border);
  display:flex;align-items:center;justify-content:space-between;
}
.col-item{border-bottom:1px solid var(--border)}
.col-name{
  padding:8px 12px;cursor:pointer;display:flex;align-items:center;gap:6px;
  font-size:13px;user-select:none;
}
.col-name:hover{background:var(--surface2)}
.col-arrow{color:var(--dim);font-size:10px;transition:transform .15s;flex:none}
.col-arrow.open{transform:rotate(90deg)}
.col-count{margin-left:auto;color:var(--dim2);font-size:11px}
.req-list{display:none;padding:0 0 4px 0}
.req-list.open{display:block}
.req-item{
  padding:6px 12px 6px 28px;cursor:pointer;display:flex;align-items:center;gap:8px;
  font-size:12px;
}
.req-item:hover{background:var(--surface2)}
.req-item.active{background:#094771;color:#fff}
.method-dot{
  width:6px;height:6px;border-radius:50%;flex:none;
}
.req-name-text{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#empty-sidebar{padding:20px 12px;color:var(--dim);font-size:12px;line-height:1.6}

/* ── Main panel ─────────────────────────── */
#main{display:grid;grid-template-rows:1fr 1fr;overflow:hidden}

/* ── Request panel ──────────────────────── */
#req-panel{
  border-bottom:1px solid var(--border);overflow-y:auto;padding:16px 20px;
  display:flex;flex-direction:column;gap:10px;
}
#req-empty{color:var(--dim);font-size:13px;padding:20px 0}
#req-title{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.method-badge{
  padding:3px 10px;border-radius:4px;font-size:12px;font-weight:700;flex:none;
}
#req-url{color:var(--cyan);font-size:13px;word-break:break-all}
#req-desc{color:var(--dim);font-size:12px;font-style:italic}
.section-label{
  font-size:11px;color:var(--dim);text-transform:uppercase;letter-spacing:.6px;
  margin-top:4px;border-top:1px solid var(--border);padding-top:8px;
}
.kv-table{font-size:12px;display:grid;grid-template-columns:auto 1fr;gap:2px 12px}
.kv-key{color:var(--cyan);white-space:nowrap}
.kv-val{color:var(--orange);word-break:break-all}
#run-row{display:flex;align-items:center;gap:10px;margin-top:4px}
#run-btn{
  background:#094771;border:1px solid #005f9e;color:#fff;
  padding:7px 20px;border-radius:4px;font-size:13px;cursor:pointer;
  font-family:inherit;font-weight:600;display:flex;align-items:center;gap:6px;
}
#run-btn:hover{background:#0a5a8e}
#run-btn:disabled{opacity:.5;cursor:not-allowed}
#run-spinner{display:none;color:var(--dim);font-size:12px}
#edit-btn{
  background:var(--surface2);border:1px solid var(--border);color:var(--dim);
  padding:7px 14px;border-radius:4px;font-size:13px;cursor:pointer;font-family:inherit;
}
#edit-btn:hover{border-color:var(--blue);color:var(--blue)}

/* ── Response panel ─────────────────────── */
#res-panel{overflow-y:auto;padding:12px 20px;display:flex;flex-direction:column;gap:8px}
#res-empty{color:var(--dim);font-size:12px;padding:8px 0}
#res-meta{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.badge{padding:3px 10px;border-radius:4px;font-size:12px;font-weight:600}
.badge-2xx{background:var(--badge-2xx);color:#fff}
.badge-3xx{background:var(--badge-3xx);color:#fff}
.badge-4xx{background:var(--badge-4xx);color:#fff}
.badge-5xx{background:var(--badge-5xx);color:#fff}
.badge-def{background:var(--border);color:var(--text)}
.meta-pill{background:var(--border);color:var(--dim);padding:2px 8px;border-radius:3px;font-size:11px}
#res-body-wrap{flex:1;overflow:auto}
pre#res-body{font-size:12.5px;line-height:1.6;white-space:pre;tab-size:2}
.jk{color:var(--cyan)}.js{color:var(--orange)}.jn{color:var(--yellow)}
.jb{color:var(--purple)}.jp{color:var(--dim2)}
.fold-toggle{display:inline-block;cursor:pointer;user-select:none;
  width:16px;color:var(--dim);font-size:10px}
.fold-toggle::before{content:'▾'}
.fold-toggle.collapsed::before{content:'▸'}
.foldable{display:inline}
.foldable.collapsed>.fold-content{display:none}
.foldable.collapsed>.fold-placeholder{display:inline}
.fold-placeholder{color:var(--dim);display:none}
#copy-res{
  background:var(--border);border:1px solid #555;color:var(--text);
  padding:3px 10px;border-radius:3px;font-size:11px;cursor:pointer;font-family:inherit;
}
#copy-res:hover{background:#3e3e3e}
#copy-res.copied{background:var(--badge-2xx);color:#fff}

/* ── History strip ──────────────────────── */
#history{
  background:var(--surface);border-top:1px solid var(--border);
  overflow-x:auto;overflow-y:hidden;display:flex;align-items:center;
  gap:0;padding:0;
}
#history-inner{display:flex;align-items:stretch;gap:0;min-width:100%}
#hist-label{
  padding:0 14px;color:var(--dim);font-size:11px;text-transform:uppercase;
  letter-spacing:.6px;white-space:nowrap;border-right:1px solid var(--border);
  display:flex;align-items:center;flex:none;
}
.hist-entry{
  padding:10px 14px;border-right:1px solid var(--border);cursor:pointer;
  min-width:180px;flex:none;
}
.hist-entry:hover{background:var(--surface2)}
.hist-entry.active{background:#094771}
.hist-row1{display:flex;align-items:center;gap:6px;margin-bottom:3px}
.hist-method{font-size:11px;font-weight:700}
.hist-status{font-size:11px;padding:1px 6px;border-radius:3px;color:#fff}
.s2xx{background:var(--badge-2xx)}.s3xx{background:var(--badge-3xx)}
.s4xx{background:var(--badge-4xx)}.s5xx{background:var(--badge-5xx)}
.hist-row2{font-size:11px;color:var(--dim);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:150px}
.hist-time{font-size:10px;color:var(--dim2)}
#hist-empty{padding:0 16px;color:var(--dim);font-size:12px}

/* Scrollbar */
::-webkit-scrollbar{width:6px;height:6px}
::-webkit-scrollbar-track{background:transparent}
::-webkit-scrollbar-thumb{background:var(--border);border-radius:3px}

/* ── Edit modal ─────────────────────────── */
#edit-overlay{
  display:none;position:fixed;inset:0;background:rgba(0,0,0,.65);
  z-index:100;align-items:center;justify-content:center;
}
#edit-overlay.open{display:flex}
#edit-dialog{
  background:var(--surface);border:1px solid var(--border);border-radius:6px;
  width:min(680px,92vw);max-height:85vh;display:flex;flex-direction:column;
  box-shadow:0 16px 48px rgba(0,0,0,.6);
}
#edit-dialog-header{
  padding:14px 18px;border-bottom:1px solid var(--border);
  display:flex;align-items:center;justify-content:space-between;flex:none;
}
#edit-dialog-header h2{font-size:14px;font-weight:600;color:var(--text)}
#edit-close{background:none;border:none;color:var(--dim);font-size:18px;cursor:pointer;padding:2px 6px;line-height:1}
#edit-close:hover{color:var(--text)}
#edit-form{padding:16px 18px;overflow-y:auto;flex:1;display:flex;flex-direction:column;gap:14px}
.edit-label{font-size:11px;color:var(--dim);text-transform:uppercase;letter-spacing:.5px;margin-bottom:5px}
.edit-row{display:flex;gap:8px;align-items:center}
.edit-input{
  width:100%;background:var(--surface2);border:1px solid var(--border);
  color:var(--text);padding:6px 10px;border-radius:4px;
  font-family:inherit;font-size:12px;
}
.edit-input:focus{outline:none;border-color:var(--blue)}
.edit-select{
  background:var(--surface2);border:1px solid var(--border);color:var(--text);
  padding:6px 8px;border-radius:4px;font-family:inherit;font-size:12px;flex:none;
}
.edit-select:focus{outline:none;border-color:var(--blue)}
.edit-textarea{
  width:100%;background:var(--surface2);border:1px solid var(--border);
  color:var(--orange);padding:8px 10px;border-radius:4px;
  font-family:inherit;font-size:12px;resize:vertical;min-height:90px;
}
.edit-textarea:focus{outline:none;border-color:var(--blue)}
#edit-hdrs-list{display:flex;flex-direction:column;gap:5px}
.hdr-row{display:flex;gap:6px;align-items:center}
.hdr-row .edit-input{flex:1}
.hdr-del{background:none;border:none;color:var(--dim);font-size:14px;cursor:pointer;padding:0 4px;flex:none;line-height:1}
.hdr-del:hover{color:var(--red)}
#edit-add-hdr{
  background:none;border:1px dashed var(--border);color:var(--dim);
  padding:4px 10px;border-radius:3px;font-size:11px;cursor:pointer;
  font-family:inherit;align-self:flex-start;margin-top:4px;
}
#edit-add-hdr:hover{border-color:var(--blue);color:var(--blue)}
#edit-auth-fields{display:flex;flex-direction:column;gap:6px;margin-top:6px}
#edit-footer{
  padding:12px 18px;border-top:1px solid var(--border);
  display:flex;justify-content:flex-end;gap:8px;flex:none;
}
#edit-save-btn{
  background:#094771;border:1px solid #005f9e;color:#fff;
  padding:7px 20px;border-radius:4px;font-size:13px;cursor:pointer;font-family:inherit;font-weight:600;
}
#edit-save-btn:hover{background:#0a5a8e}
#edit-cancel-btn{
  background:var(--border);border:1px solid #555;color:var(--text);
  padding:7px 16px;border-radius:4px;font-size:13px;cursor:pointer;font-family:inherit;
}
#edit-cancel-btn:hover{background:#3e3e3e}
</style>
</head>
<body>

<!-- ── Header ── -->
<div id="header">
  <span id="status-dot"></span>
  <span id="brand">✉ mail-man</span>
  <span id="env-label">env:</span>
  <select id="env-select" onchange="switchEnv(this.value)">
    <option value="">— none —</option>
  </select>
  <div class="header-spacer"></div>
  <button id="stop-btn" onclick="stopServer()">■ Stop</button>
</div>

<!-- ── Body ── -->
<div id="body">

  <!-- Sidebar -->
  <div id="sidebar">
    <div id="sidebar-header">
      Collections
      <span id="col-count" style="color:var(--dim2)"></span>
    </div>
    <div id="sidebar-content"></div>
  </div>

  <!-- Main -->
  <div id="main">

    <!-- Request panel -->
    <div id="req-panel">
      <div id="req-empty">← Select a request from the sidebar</div>
      <div id="req-content" style="display:none;flex-direction:column;gap:10px">
        <div id="req-title">
          <span id="req-method" class="method-badge"></span>
          <span id="req-url"></span>
        </div>
        <div id="req-desc"></div>
        <div id="req-headers-section" style="display:none">
          <div class="section-label">Headers</div>
          <div id="req-headers" class="kv-table"></div>
        </div>
        <div id="req-body-section" style="display:none">
          <div class="section-label">Body</div>
          <pre id="req-body" style="font-size:12px;color:var(--orange);white-space:pre-wrap"></pre>
        </div>
        <div id="req-auth-section" style="display:none">
          <div class="section-label">Auth</div>
          <div id="req-auth" class="kv-table"></div>
        </div>
        <div id="run-row">
          <button id="run-btn" onclick="runRequest()">▶ Run</button>
          <button id="edit-btn" onclick="openEdit()">✎ Edit</button>
          <span id="run-spinner">Sending…</span>
        </div>
      </div>
    </div>

    <!-- Response panel -->
    <div id="res-panel">
      <div id="res-empty">Run a request to see the response here.</div>
      <div id="res-content" style="display:none;flex-direction:column;gap:8px">
        <div id="res-meta">
          <span id="res-status" class="badge"></span>
          <span id="res-duration" class="meta-pill"></span>
          <span id="res-ts" class="meta-pill"></span>
          <button id="copy-res" onclick="copyResponse()">Copy JSON</button>
        </div>
        <div id="res-body-wrap">
          <pre id="res-body"></pre>
        </div>
      </div>
    </div>

  </div><!-- /main -->
</div><!-- /body -->

<!-- ── History strip ── -->
<div id="history">
  <div id="history-inner">
    <div id="hist-label">History</div>
    <div id="hist-empty">No requests yet.</div>
  </div>
</div>

<!-- ── Edit modal ── -->
<div id="edit-overlay" onclick="if(event.target===this)closeEdit()">
  <div id="edit-dialog">
    <div id="edit-dialog-header">
      <h2>Edit request</h2>
      <button id="edit-close" onclick="closeEdit()">✕</button>
    </div>
    <div id="edit-form">
      <div>
        <div class="edit-label">Method &amp; URL</div>
        <div class="edit-row">
          <select id="edit-method" class="edit-select">
            <option>GET</option><option>POST</option><option>PUT</option>
            <option>PATCH</option><option>DELETE</option><option>HEAD</option><option>OPTIONS</option>
          </select>
          <input id="edit-url" class="edit-input" type="text" placeholder="https://…" />
        </div>
      </div>
      <div>
        <div class="edit-label">Description</div>
        <input id="edit-desc" class="edit-input" type="text" placeholder="Optional description" />
      </div>
      <div>
        <div class="edit-label">Headers</div>
        <div id="edit-hdrs-list"></div>
        <button id="edit-add-hdr" onclick="addHdrRow('','')">+ Add header</button>
      </div>
      <div>
        <div class="edit-label">Body (JSON)</div>
        <textarea id="edit-body" class="edit-textarea" placeholder='{"key":"value"}'></textarea>
      </div>
      <div>
        <div class="edit-label">Auth</div>
        <select id="edit-auth-type" class="edit-select" onchange="renderAuthFields()">
          <option value="none">None</option>
          <option value="bearer">Bearer token</option>
          <option value="basic">Basic auth</option>
          <option value="apikey">API key</option>
        </select>
        <div id="edit-auth-fields"></div>
      </div>
    </div>
    <div id="edit-footer">
      <button id="edit-cancel-btn" onclick="closeEdit()">Cancel</button>
      <button id="edit-save-btn" onclick="saveEdit()">Save</button>
    </div>
  </div>
</div>

<script>
'use strict';

const PORT = ${port};
let selectedCol = null;
let selectedReq = null;
let lastResponseBody = null;

// ── API helpers ────────────────────────────────────────────

async function api(method, endpoint, body) {
  const ctrl = new AbortController();
  const tid  = setTimeout(() => ctrl.abort(), 8000);
  try {
    const opts = { method, headers: { 'Content-Type': 'application/json' }, signal: ctrl.signal };
    if (body != null) opts.body = JSON.stringify(body);
    const r = await fetch('http://127.0.0.1:' + PORT + endpoint, opts);
    return r.json();
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('Request timed out');
    throw e;
  } finally {
    clearTimeout(tid);
  }
}

// ── Init ──────────────────────────────────────────────────

async function init() {
  await loadState();
  await loadCollections();
  await loadHistory();
}

// ── Environments ──────────────────────────────────────────

async function loadState() {
  const data = await api('GET', '/api/state').catch(() => ({}));
  const envs = data.envs || [];
  const sel  = document.getElementById('env-select');
  sel.innerHTML = '<option value="">— none —</option>';
  envs.forEach(e => {
    const o = document.createElement('option');
    o.value = e; o.textContent = e;
    if (e === data.activeEnv) o.selected = true;
    sel.appendChild(o);
  });
}

async function switchEnv(name) {
  await api('POST', '/api/env/use', { name });
}

// ── Collections / sidebar ─────────────────────────────────

async function loadCollections() {
  const cols = await api('GET', '/api/collections').catch(() => []);
  const container = document.getElementById('sidebar-content');
  const count     = document.getElementById('col-count');
  container.innerHTML = '';
  count.textContent = cols.length ? cols.length + ' collection' + (cols.length !== 1 ? 's' : '') : '';

  if (!cols.length) {
    container.innerHTML = '<div style="padding:20px 12px;color:var(--dim);font-size:12px;line-height:1.6">No collections yet.<br>Run <code>mm add &lt;name&gt;/&lt;request&gt;</code> to create one.</div>';
    return;
  }

  for (const col of cols) {
    const reqs = await api('GET', '/api/collections/' + col).catch(() => []);
    const item = document.createElement('div');
    item.className = 'col-item';
    item.innerHTML = \`
      <div class="col-name" onclick="toggleCol(this, '\${escHtml(col)}')">
        <span class="col-arrow">▸</span>
        <span>\${escHtml(col)}</span>
        <span class="col-count">\${reqs.length}</span>
      </div>
      <div class="req-list" id="reqs-\${escHtml(col)}">
        \${reqs.map(r => \`
          <div class="req-item" id="req-item-\${escHtml(col)}-\${escHtml(r.name)}"
               onclick="selectRequest('\${escHtml(col)}','\${escHtml(r.name)}')">
            <span class="method-dot" style="background:\${methodColor(r.method)}"></span>
            <span class="req-name-text" title="\${escHtml(r.name)}">\${escHtml(r.name)}</span>
          </div>
        \`).join('')}
      </div>
    \`;
    container.appendChild(item);

    if (col === selectedCol) {
      const arrow = item.querySelector('.col-arrow');
      const list  = item.querySelector('.req-list');
      arrow.classList.add('open');
      list.classList.add('open');
    }
  }

  if (selectedCol && selectedReq) {
    const el = document.getElementById('req-item-' + selectedCol + '-' + selectedReq);
    if (el) el.classList.add('active');
  }
}

function toggleCol(header, colName) {
  const arrow = header.querySelector('.col-arrow');
  const list  = document.getElementById('reqs-' + colName);
  arrow.classList.toggle('open');
  list.classList.toggle('open');
}

// ── Request details ───────────────────────────────────────

async function selectRequest(col, reqName) {
  selectedCol = col; selectedReq = reqName;

  document.querySelectorAll('.req-item').forEach(el => el.classList.remove('active'));
  const el = document.getElementById('req-item-' + col + '-' + reqName);
  if (el) el.classList.add('active');

  const data = await api('GET', '/api/collections/' + col + '/' + reqName).catch(() => null);
  if (!data) return;

  const req = data.request;

  document.getElementById('req-empty').style.display   = 'none';
  const content = document.getElementById('req-content');
  content.style.display = 'flex';

  const methodEl = document.getElementById('req-method');
  methodEl.textContent  = req.method;
  methodEl.style.background = methodColor(req.method);
  methodEl.style.color      = '#fff';
  document.getElementById('req-url').textContent  = req.url;
  document.getElementById('req-desc').textContent = req.description || '';

  const hSection = document.getElementById('req-headers-section');
  const hDiv     = document.getElementById('req-headers');
  const hdrs     = req.headers || {};
  const hKeys    = Object.keys(hdrs);
  if (hKeys.length) {
    hDiv.innerHTML = hKeys.map(k =>
      \`<span class="kv-key">\${escHtml(k)}</span><span class="kv-val">\${escHtml(hdrs[k])}</span>\`
    ).join('');
    hSection.style.display = 'block';
  } else {
    hSection.style.display = 'none';
  }

  const bSection = document.getElementById('req-body-section');
  if (req.body) {
    document.getElementById('req-body').textContent =
      typeof req.body === 'object' ? JSON.stringify(req.body, null, 2) : req.body;
    bSection.style.display = 'block';
  } else {
    bSection.style.display = 'none';
  }

  const aSection = document.getElementById('req-auth-section');
  const aDiv     = document.getElementById('req-auth');
  const auth     = req.auth;
  if (auth && auth.type && auth.type !== 'none') {
    let pairs = [['type', auth.type]];
    if (auth.type === 'bearer') pairs.push(['token', auth.token || '']);
    if (auth.type === 'basic')  pairs.push(['user', auth.username || ''], ['pass', '••••••']);
    if (auth.type === 'apikey') pairs.push([auth.header || 'header', auth.key || '']);
    aDiv.innerHTML = pairs.map(([k,v]) =>
      \`<span class="kv-key">\${escHtml(k)}</span><span class="kv-val">\${escHtml(v)}</span>\`
    ).join('');
    aSection.style.display = 'block';
  } else {
    aSection.style.display = 'none';
  }

  if (data.lastResponse) {
    renderResponse(data.lastResponse);
  } else {
    document.getElementById('res-empty').style.display   = 'block';
    document.getElementById('res-content').style.display = 'none';
  }
}

// ── Run ──────────────────────────────────────────────────

async function runRequest() {
  if (!selectedCol || !selectedReq) return;
  const btn     = document.getElementById('run-btn');
  const spinner = document.getElementById('run-spinner');
  btn.disabled  = true;
  spinner.style.display = 'inline';

  try {
    const result = await api('POST', '/api/run/' + selectedCol + '/' + selectedReq);
    if (result.error) {
      alert('Error: ' + result.error);
    } else {
      renderResponse(result);
      await loadHistory();
    }
  } catch (e) {
    alert('Network error: ' + e.message);
  } finally {
    btn.disabled = false;
    spinner.style.display = 'none';
  }
}

// ── Response renderer ─────────────────────────────────────

function renderResponse(r) {
  lastResponseBody = r.body;
  document.getElementById('res-empty').style.display   = 'none';
  const content = document.getElementById('res-content');
  content.style.display = 'flex';

  const badgeEl = document.getElementById('res-status');
  badgeEl.textContent = r.status + (r.statusText ? ' ' + r.statusText : '');
  badgeEl.className = 'badge ' + statusBadgeClass(r.status);

  document.getElementById('res-duration').textContent = r.duration ? r.duration + 'ms' : '';
  document.getElementById('res-ts').textContent       =
    r.timestamp ? new Date(r.timestamp).toLocaleTimeString() : '';

  const pre = document.getElementById('res-body');
  pre.innerHTML = renderNode(r.body, 0);
}

// ── History strip ─────────────────────────────────────────

async function loadHistory() {
  const entries = await api('GET', '/api/history').catch(() => []);
  const inner   = document.getElementById('history-inner');
  inner.innerHTML = '<div id="hist-label">History</div>';

  if (!entries.length) {
    inner.insertAdjacentHTML('beforeend', '<div id="hist-empty" style="padding:0 16px;color:var(--dim);font-size:12px;display:flex;align-items:center">No requests yet.</div>');
    return;
  }

  entries.forEach((e, i) => {
    const div = document.createElement('div');
    div.className = 'hist-entry' + (e.collection === selectedCol && e.request === selectedReq && i === 0 ? ' active' : '');
    div.onclick = () => selectRequest(e.collection, e.request);
    const sc = statusBadgeClass(e.status).replace('badge-','');
    div.innerHTML = \`
      <div class="hist-row1">
        <span class="hist-method" style="color:\${methodColor(e.method)}">\${escHtml(e.method)}</span>
        <span class="hist-status \${sc}">\${e.status}</span>
        <span class="hist-time">\${new Date(e.timestamp).toLocaleTimeString()}</span>
      </div>
      <div class="hist-row2" title="\${escHtml(e.collection+'/'+e.request)}">\${escHtml(e.collection)}/\${escHtml(e.request)}</div>
    \`;
    inner.appendChild(div);
  });
}

// ── Stop server ──────────────────────────────────────────

async function stopServer() {
  if (!confirm('Stop the mail-man server?')) return;
  await api('POST', '/api/stop').catch(() => {});
  document.body.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100vh;color:#858585;font-family:monospace;font-size:14px">✉ mail-man stopped. Run <code style="color:#9cdcfe;margin:0 6px">mm start</code> to restart.</div>';
}

// ── Copy response ────────────────────────────────────────

function copyResponse() {
  if (lastResponseBody === null) return;
  navigator.clipboard.writeText(JSON.stringify(lastResponseBody, null, 2)).then(() => {
    const btn = document.getElementById('copy-res');
    btn.textContent = '✓ Copied';
    btn.classList.add('copied');
    setTimeout(() => { btn.textContent = 'Copy JSON'; btn.classList.remove('copied'); }, 2000);
  });
}

// ── JSON renderer ────────────────────────────────────────

function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
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
      padInner + renderNode(v, indent + 1) + (i < value.length - 1 ? '<span class="jp">,</span>' : '')
    ).join('\\n');
    return '<span class="foldable"><span class="fold-toggle" onclick="tf(this)"></span><span class="jp">[</span><span class="fold-content">\\n' + inner + '\\n' + pad + '</span><span class="fold-placeholder"> … ' + value.length + ' items </span><span class="jp">]</span></span>';
  }
  if (typeof value === 'object') {
    const keys = Object.keys(value);
    if (!keys.length) return '<span class="jp">{}</span>';
    const inner = keys.map((k, i) =>
      padInner + '<span class="jk">&quot;' + escHtml(k) + '&quot;</span><span class="jp">: </span>' +
      renderNode(value[k], indent + 1) + (i < keys.length - 1 ? '<span class="jp">,</span>' : '')
    ).join('\\n');
    return '<span class="foldable"><span class="fold-toggle" onclick="tf(this)"></span><span class="jp">{</span><span class="fold-content">\\n' + inner + '\\n' + pad + '</span><span class="fold-placeholder"> … ' + keys.length + ' keys </span><span class="jp">}</span></span>';
  }
  return escHtml(String(value));
}

function tf(toggle) {
  toggle.parentElement.classList.toggle('collapsed');
  toggle.classList.toggle('collapsed');
}

// ── Colour helpers ────────────────────────────────────────

function methodColor(m) {
  const map = {
    GET:'#6a9955',POST:'#dcdcaa',PUT:'#569cd6',
    PATCH:'#c586c0',DELETE:'#f44747',HEAD:'#9cdcfe',OPTIONS:'#858585'
  };
  return map[(m||'').toUpperCase()] || '#858585';
}

function statusBadgeClass(s) {
  if (s >= 200 && s < 300) return 'badge-2xx';
  if (s >= 300 && s < 400) return 'badge-3xx';
  if (s >= 400 && s < 500) return 'badge-4xx';
  if (s >= 500)             return 'badge-5xx';
  return 'badge-def';
}

// ── Edit modal ────────────────────────────────────────────

async function openEdit() {
  if (!selectedCol || !selectedReq) return;
  // Capture at call-time; selectedCol/Req may shift during await
  const col  = selectedCol;
  const name = selectedReq;
  const data = await api('GET', '/api/collections/' + col + '/' + name).catch(() => null);
  if (!data || !data.request) return;
  const req = data.request;

  document.getElementById('edit-method').value = req.method || 'GET';
  document.getElementById('edit-url').value    = req.url    || '';
  document.getElementById('edit-desc').value   = req.description || '';

  const hdrList = document.getElementById('edit-hdrs-list');
  hdrList.innerHTML = '';
  Object.entries(req.headers || {}).forEach(([k, v]) => addHdrRow(k, v));

  const body = req.body;
  document.getElementById('edit-body').value =
    body ? (typeof body === 'object' ? JSON.stringify(body, null, 2) : body) : '';

  const auth     = req.auth || {};
  const authType = auth.type || 'none';
  document.getElementById('edit-auth-type').value = authType;
  renderAuthFields();
  if (authType === 'bearer') {
    const f = document.getElementById('edit-auth-token');
    if (f) f.value = auth.token || '';
  } else if (authType === 'basic') {
    const u = document.getElementById('edit-auth-user');
    const p = document.getElementById('edit-auth-pass');
    if (u) u.value = auth.username || '';
    if (p) p.value = auth.password || '';
  } else if (authType === 'apikey') {
    const h = document.getElementById('edit-auth-header');
    const k = document.getElementById('edit-auth-key');
    if (h) h.value = auth.header || '';
    if (k) k.value = auth.key    || '';
  }

  document.getElementById('edit-overlay').classList.add('open');
}

function closeEdit() {
  document.getElementById('edit-overlay').classList.remove('open');
}

function addHdrRow(k, v) {
  const list = document.getElementById('edit-hdrs-list');
  const row  = document.createElement('div');
  row.className = 'hdr-row';
  row.innerHTML =
    '<input class="edit-input" placeholder="Header name" value="' + escHtml(k) + '" />' +
    '<input class="edit-input" placeholder="Value"       value="' + escHtml(v) + '" />' +
    '<button class="hdr-del" onclick="this.parentElement.remove()" title="Remove">✕</button>';
  list.appendChild(row);
}

function renderAuthFields() {
  const type = document.getElementById('edit-auth-type').value;
  const box  = document.getElementById('edit-auth-fields');
  if (type === 'bearer') {
    box.innerHTML = '<input id="edit-auth-token" class="edit-input" placeholder="Bearer token" />';
  } else if (type === 'basic') {
    box.innerHTML =
      '<input id="edit-auth-user" class="edit-input" placeholder="Username" />' +
      '<input id="edit-auth-pass" class="edit-input" type="password" placeholder="Password" style="margin-top:6px" />';
  } else if (type === 'apikey') {
    box.innerHTML =
      '<input id="edit-auth-header" class="edit-input" placeholder="Header name (e.g. X-API-Key)" />' +
      '<input id="edit-auth-key"    class="edit-input" placeholder="Key value" style="margin-top:6px" />';
  } else {
    box.innerHTML = '';
  }
}

async function saveEdit() {
  if (!selectedCol || !selectedReq) return;

  const method = document.getElementById('edit-method').value;
  const url    = document.getElementById('edit-url').value.trim();
  const desc   = document.getElementById('edit-desc').value.trim();

  if (!url) { alert('URL is required.'); document.getElementById('edit-url').focus(); return; }

  const headers = {};
  document.querySelectorAll('#edit-hdrs-list .hdr-row').forEach(row => {
    const ins = row.querySelectorAll('input');
    const k = ins[0].value.trim();
    const v = ins[1].value.trim();
    if (k) headers[k] = v;
  });

  let body = null;
  const rawBody = document.getElementById('edit-body').value.trim();
  if (rawBody) {
    try { body = JSON.parse(rawBody); } catch { body = rawBody; }
  }

  const authType = document.getElementById('edit-auth-type').value;
  const auth = { type: authType };
  if (authType === 'bearer') {
    auth.token = (document.getElementById('edit-auth-token') || {}).value || '';
  } else if (authType === 'basic') {
    auth.username = (document.getElementById('edit-auth-user') || {}).value || '';
    auth.password = (document.getElementById('edit-auth-pass') || {}).value || '';
  } else if (authType === 'apikey') {
    auth.header = (document.getElementById('edit-auth-header') || {}).value || '';
    auth.key    = (document.getElementById('edit-auth-key')    || {}).value || '';
  }

  const btn = document.getElementById('edit-save-btn');
  btn.disabled = true;
  btn.textContent = 'Saving…';

  // Capture current selection — user cannot change it while modal is open,
  // but be explicit about which request we're saving.
  const col  = selectedCol;
  const name = selectedReq;

  try {
    const res = await api('POST',
      '/api/collections/' + col + '/' + name,
      { method, url, description: desc, headers, body, auth }
    );
    if (!res || res.error) { alert('Save failed: ' + (res && res.error ? res.error : 'unknown error')); return; }
  } catch (e) {
    alert('Save error: ' + e.message); return;
  } finally {
    btn.disabled = false;
    btn.textContent = 'Save';
  }

  closeEdit();
  await selectRequest(col, name);
}

// ── Boot ─────────────────────────────────────────────────

init();

setInterval(async () => {
  await loadCollections();
  await loadHistory();
}, 5000);
</script>
</body>
</html>`;
}

module.exports = { build };
