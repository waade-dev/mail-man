'use strict';

/**
 * src/controllers/BeautifyController.js
 *
 * mm b-res [collection/request]
 *
 * Fetches the last response from the server and opens it in Chrome.
 * The ephemeral local HTTP server is spun up by the CLI (not the main server).
 */

const http  = require('http');
const net   = require('net');
const fs    = require('fs-extra');
const open  = require('open');
const chalk = require('chalk');
const api   = require('../utils/apiClient');
const { parsePath } = require('../utils/pathHelper');
const { error, info, warn } = require('../views/console');

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

function buildHtml(data) {
  const { meta, body } = data;
  const jsonStr = JSON.stringify(typeof body === 'string' ? tryParse(body) : body, null, 2)
    .replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');
  const metaJson = JSON.stringify(meta)
    .replace(/</g, '\\u003c').replace(/>/g, '\\u003e');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>mail-man response</title>
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{--bg:#1e1e1e;--surface:#252526;--border:#3c3c3c;--text:#d4d4d4;--dim:#6a6a6a;
  --green:#6a9955;--blue:#569cd6;--cyan:#9cdcfe;--yellow:#dcdcaa;--orange:#ce9178;
  --purple:#c586c0;--red:#f44747;--badge-2xx:#16825d;--badge-3xx:#0e7490;--badge-4xx:#b45309;--badge-5xx:#b91c1c}
body{font-family:'SF Mono','Fira Code',Consolas,'Courier New',monospace;background:var(--bg);color:var(--text);min-height:100vh}
#topbar{background:var(--surface);border-bottom:1px solid var(--border);padding:12px 20px;display:flex;align-items:center;gap:16px;flex-wrap:wrap}
#brand{color:var(--blue);font-weight:700;font-size:15px;letter-spacing:.5px}
.badge{display:inline-flex;align-items:center;padding:3px 10px;border-radius:4px;font-size:13px;font-weight:600}
.badge-2xx{background:var(--badge-2xx);color:#fff}.badge-3xx{background:var(--badge-3xx);color:#fff}
.badge-4xx{background:var(--badge-4xx);color:#fff}.badge-5xx{background:var(--badge-5xx);color:#fff}
.badge-def{background:var(--border);color:var(--text)}
.meta-pill{background:var(--border);color:var(--dim);padding:2px 8px;border-radius:3px;font-size:12px}
.meta-url{color:var(--cyan);font-size:12px;max-width:60vw;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#toolbar{display:flex;align-items:center;gap:8px;padding:8px 20px;background:var(--surface);border-bottom:1px solid var(--border)}
button{background:var(--border);border:1px solid #555;color:var(--text);padding:4px 12px;border-radius:4px;font-size:12px;cursor:pointer;font-family:inherit}
button:hover{background:#3e3e3e}
#copy-btn.copied{background:var(--badge-2xx);border-color:#16825d;color:#fff}
#json-container{padding:20px;overflow:auto}
pre#json-output{background:transparent;font-size:13.5px;line-height:1.6;white-space:pre;tab-size:2}
.jk{color:var(--cyan)}.js{color:var(--orange)}.jn{color:var(--yellow)}.jb{color:var(--purple)}.jp{color:var(--dim)}
.fold-toggle{display:inline-block;cursor:pointer;user-select:none;width:16px;color:var(--dim);font-size:11px}
.fold-toggle::before{content:'▾'}.fold-toggle.collapsed::before{content:'▸'}
.foldable{display:inline}.foldable.collapsed>.fold-content{display:none}.foldable.collapsed>.fold-placeholder{display:inline}
.fold-placeholder{color:var(--dim);display:none}
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
  <span style="margin-left:auto;color:var(--dim);font-size:12px;">Server closes in <span id="countdown">5:00</span></span>
</div>
<div id="json-container"><pre id="json-output"></pre></div>
<script>
'use strict';
const meta=${metaJson};
const rawJson=${jsonStr};
(function(){
  const s=meta.status||0;
  const el=document.getElementById('status-badge');
  el.textContent=s+(meta.statusText?' '+meta.statusText:'');
  if(s>=200&&s<300)el.className='badge badge-2xx';
  else if(s>=300&&s<400)el.className='badge badge-3xx';
  else if(s>=400&&s<500)el.className='badge badge-4xx';
  else if(s>=500)el.className='badge badge-5xx';
  else el.className='badge badge-def';
  document.getElementById('method-badge').textContent=meta.method||'';
  document.getElementById('url-label').textContent=meta.url||'';
  document.getElementById('duration-label').textContent=meta.duration?meta.duration+'ms':'';
  document.getElementById('ts-label').textContent=meta.timestamp?new Date(meta.timestamp).toLocaleString():'';
})();
(function(){let r=300;const el=document.getElementById('countdown');setInterval(()=>{r--;if(r<=0){el.textContent='0:00';return;}el.textContent=Math.floor(r/60)+':'+String(r%60).padStart(2,'0');},1000);})();
function escH(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function renderNode(v,i){
  const p='  '.repeat(i),pi='  '.repeat(i+1);
  if(v===null)return '<span class="jb">null</span>';
  if(typeof v==='boolean')return '<span class="jb">'+v+'</span>';
  if(typeof v==='number')return '<span class="jn">'+v+'</span>';
  if(typeof v==='string')return '<span class="js">&quot;'+escH(v)+'&quot;</span>';
  if(Array.isArray(v)){if(!v.length)return '<span class="jp">[]</span>';
    const inner=v.map((x,i2)=>pi+renderNode(x,i+1)+(i2<v.length-1?'<span class="jp">,</span>':'')).join('\\n');
    return '<span class="foldable"><span class="fold-toggle" onclick="tf(this)"></span><span class="jp">[</span><span class="fold-content">\\n'+inner+'\\n'+p+'</span><span class="fold-placeholder"> … '+v.length+' items </span><span class="jp">]</span></span>';}
  if(typeof v==='object'){const k=Object.keys(v);if(!k.length)return '<span class="jp">{}</span>';
    const inner=k.map((key,i2)=>pi+'<span class="jk">&quot;'+escH(key)+'&quot;</span><span class="jp">: </span>'+renderNode(v[key],i+1)+(i2<k.length-1?'<span class="jp">,</span>':'')).join('\\n');
    return '<span class="foldable"><span class="fold-toggle" onclick="tf(this)"></span><span class="jp">{</span><span class="fold-content">\\n'+inner+'\\n'+p+'</span><span class="fold-placeholder"> … '+k.length+' keys </span><span class="jp">}</span></span>';}
  return escH(String(v));
}
document.getElementById('json-output').innerHTML=renderNode(rawJson,0);
function tf(t){t.parentElement.classList.toggle('collapsed');t.classList.toggle('collapsed');}
function expandAll(){document.querySelectorAll('.foldable.collapsed').forEach(n=>n.classList.remove('collapsed'));document.querySelectorAll('.fold-toggle.collapsed').forEach(n=>n.classList.remove('collapsed'));}
function collapseAll(){document.querySelectorAll('.foldable:not(.collapsed)').forEach(n=>n.classList.add('collapsed'));document.querySelectorAll('.fold-toggle:not(.collapsed)').forEach(n=>n.classList.add('collapsed'));}
function copyJson(){navigator.clipboard.writeText(JSON.stringify(rawJson,null,2)).then(()=>{const b=document.getElementById('copy-btn');b.textContent='✓ Copied!';b.classList.add('copied');setTimeout(()=>{b.textContent='Copy JSON';b.classList.remove('copied');},2000);});}
</script>
</body>
</html>`;
}

function tryParse(str) {
  try { return JSON.parse(str); } catch { return str; }
}

async function beautify(pathStr) {
  let responseData;
  const { collection, request } = parsePath(pathStr || '');

  if (collection && request) {
    // Per-request last response — GET /api/collections/:col/:req returns { request, lastResponse }
    const res = await api.get(
      `/api/collections/${encodeURIComponent(collection)}/${encodeURIComponent(request)}`
    );
    if (res.status === 404 || !res.body.lastResponse) {
      error(`No saved response for "${collection}/${request}". Hit it first: mm hit ${collection}/${request}`);
      process.exit(1);
    }
    const r = res.body.lastResponse;
    responseData = {
      meta: { method: r.method, url: r.url, status: r.status, statusText: r.statusText, duration: r.duration, timestamp: r.timestamp },
      body: r.body,
    };
  } else if (pathStr) {
    // Treat as a local file path
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
    // Global last response
    const res = await api.get('/api/last-response');
    if (res.status !== 200 || !res.body) {
      error('No last response found. Hit a request first: mm hit <collection>/<request>');
      process.exit(1);
    }
    const r = res.body;
    responseData = {
      meta: { method: r.method, url: r.url, status: r.status, statusText: r.statusText, duration: r.duration, timestamp: r.timestamp },
      body: r.body,
    };
  }

  const port = await getFreePort();
  const html = buildHtml(responseData);

  const server = http.createServer((_, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
  });

  await new Promise((resolve, reject) => {
    server.listen(port, '127.0.0.1', resolve);
    server.on('error', reject);
  });

  const viewUrl = `http://127.0.0.1:${port}`;
  info(`Response viewer running at ${chalk.cyan.underline(viewUrl)}`);
  info('Server closes in 5 minutes.\n');

  try {
    await open(viewUrl, { app: { name: open.apps.chrome } });
  } catch {
    warn('Could not open Chrome. Trying default browser…');
    try { await open(viewUrl); } catch { warn(`Visit: ${viewUrl}`); }
  }

  setTimeout(() => { server.close(() => process.exit(0)); }, 5 * 60 * 1000).unref();
  await new Promise(() => {});
}

module.exports = { beautify };
