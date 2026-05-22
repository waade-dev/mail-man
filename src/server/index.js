'use strict';

/**
 * mail-man  —  Dashboard + API server
 *
 * ONE process handles everything — dashboard UI, request execution,
 * and every CRUD operation.  CLI controllers are thin HTTP clients;
 * all file I/O stays here, like Tomcat owning its port.
 *
 * Default port: 2525 (override with MM_PORT env var)
 * PID file:     data/.mm-server.pid
 */

const http = require('http');
const path = require('path');
const url  = require('url');
const fs   = require('fs-extra');
const axios = require('axios');

const Collection              = require('../models/Collection');
const Environment             = require('../models/Environment');
const History                 = require('../models/History');
const State                   = require('../models/State');
const { ensureDirs, DATA_DIR, COLLECTIONS_DIR } = require('../models/db');
const DashboardView           = require('../views/DashboardView');
const { resolveRequest }      = require('../utils/interpolate');

// ─────────────────────────────────────────────────────────────
//  Config
// ─────────────────────────────────────────────────────────────

const PORT     = parseInt(process.env.MM_PORT || '2525', 10);
const PID_FILE = path.join(DATA_DIR, '.mm-server.pid');

// ─────────────────────────────────────────────────────────────
//  Request execution
// ─────────────────────────────────────────────────────────────

function buildAxiosConfig(req) {
  const config = {
    method:         req.method,
    url:            req.url,
    headers:        { ...(req.headers || {}) },
    validateStatus: () => true,
    responseType:   'json',
    timeout:        30000,
  };
  if (req.body !== null && req.body !== undefined) {
    const ct = (config.headers['Content-Type'] || config.headers['content-type'] || '').toLowerCase();
    config.data = req.body;
    if (!ct && typeof req.body === 'object') config.headers['Content-Type'] = 'application/json';
  }
  const auth = req.auth || {};
  if (auth.type === 'bearer' && auth.token) {
    config.headers['Authorization'] = `Bearer ${auth.token}`;
  } else if (auth.type === 'basic' && auth.username) {
    const enc = Buffer.from(`${auth.username}:${auth.password || ''}`).toString('base64');
    config.headers['Authorization'] = `Basic ${enc}`;
  } else if (auth.type === 'apikey' && auth.header && auth.key) {
    config.headers[auth.header] = auth.key;
  }
  return config;
}

async function executeRequest(collection, reqName) {
  const req = await Collection.getRequest(collection, reqName);
  if (!req) throw new Error(`Request "${reqName}" not found in "${collection}"`);

  const state  = await State.get();
  let envVars  = {};
  if (state.activeEnv) {
    const env = await Environment.get(state.activeEnv);
    if (env) envVars = env.variables || {};
  }

  const resolved    = resolveRequest(req, envVars);
  const axiosConfig = buildAxiosConfig(resolved);
  const startTime   = Date.now();
  const response    = await axios(axiosConfig);
  const duration    = Date.now() - startTime;

  const snapshot = {
    timestamp:       new Date().toISOString(),
    collection,
    request:         reqName,
    method:          req.method,
    url:             resolved.url,
    status:          response.status,
    statusText:      response.statusText,
    requestHeaders:  axiosConfig.headers,
    requestBody:     req.body || null,
    headers:         response.headers,
    body:            response.data,
    duration,
  };

  await State.save({ ...state, lastResponse: snapshot });
  await State.saveLastResponse(collection, reqName, snapshot);
  await History.append({
    timestamp:    snapshot.timestamp,
    collection,
    request:      reqName,
    method:       req.method,
    url:          resolved.url,
    status:       response.status,
    duration,
    responseBody: JSON.stringify(response.data).slice(0, 4096),
  });
  await History.appendForRequest(collection, reqName, snapshot);

  return snapshot;
}

// ─────────────────────────────────────────────────────────────
//  Postman import helpers  (server-side so CLI stays thin)
// ─────────────────────────────────────────────────────────────

function sanitiseName(name) {
  return (name || 'request')
    .toLowerCase().replace(/[^a-z0-9_-]/g, '-').replace(/-+/g, '-')
    .replace(/^-|-$/g, '').slice(0, 64) || 'request';
}

function parsePostmanAuth(auth) {
  if (!auth || !auth.type || auth.type === 'noauth') return { type: 'none' };
  const type = auth.type.toLowerCase();
  if (type === 'bearer') {
    const params = Array.isArray(auth.bearer) ? auth.bearer : [];
    const t = params.find(p => p.key === 'token');
    return { type: 'bearer', token: t ? t.value : '{{TOKEN}}' };
  }
  if (type === 'basic') {
    const params = Array.isArray(auth.basic) ? auth.basic : [];
    return {
      type:     'basic',
      username: (params.find(p => p.key === 'username') || {}).value || '',
      password: (params.find(p => p.key === 'password') || {}).value || '',
    };
  }
  if (type === 'apikey') {
    const params = Array.isArray(auth.apikey) ? auth.apikey : [];
    return {
      type:   'apikey',
      header: (params.find(p => p.key === 'key')   || {}).value || 'X-API-Key',
      key:    (params.find(p => p.key === 'value') || {}).value || '{{API_KEY}}',
    };
  }
  return { type: 'none' };
}

function parsePostmanHeaders(headers) {
  if (!headers) return {};
  if (typeof headers === 'string') {
    const obj = {};
    for (const line of headers.split('\n')) {
      const idx = line.indexOf(':');
      if (idx > 0) obj[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
    }
    return obj;
  }
  if (Array.isArray(headers)) {
    const obj = {};
    for (const h of headers) {
      if (!h.disabled && h.key) obj[h.key] = h.value || '';
    }
    return obj;
  }
  return {};
}

function parsePostmanBody(body) {
  if (!body || !body.mode) return null;
  if (body.mode === 'raw') {
    const raw = (body.raw || '').trim();
    if (!raw) return null;
    try { return JSON.parse(raw); } catch { return raw; }
  }
  if (body.mode === 'urlencoded') {
    const obj = {};
    for (const p of (body.urlencoded || [])) {
      if (!p.disabled && p.key) obj[p.key] = p.value || '';
    }
    return Object.keys(obj).length ? obj : null;
  }
  if (body.mode === 'formdata') {
    const obj = {};
    for (const p of (body.formdata || [])) {
      if (!p.disabled && p.key && p.type !== 'file') obj[p.key] = p.value || '';
    }
    return Object.keys(obj).length ? obj : null;
  }
  return null;
}

function flattenPostmanItems(items, prefix) {
  const result = [];
  for (const item of (items || [])) {
    if (item.item) {
      const folderName = sanitiseName(item.name || 'folder');
      const newPrefix  = prefix ? `${prefix}-${folderName}` : folderName;
      result.push(...flattenPostmanItems(item.item, newPrefix));
    } else if (item.request) {
      result.push({ item, prefix });
    }
  }
  return result;
}

async function runImport(postmanJson) {
  const schemaUrl = postmanJson.info && postmanJson.info.schema ? postmanJson.info.schema : '';
  const isPostman = schemaUrl.includes('schema.getpostman.com') ||
    (postmanJson.info && postmanJson.info.name && Array.isArray(postmanJson.item));

  if (!isPostman) {
    throw new Error('Not a Postman v2/v2.1 collection');
  }

  const collectionName = sanitiseName(postmanJson.info.name || 'imported');
  const flatItems      = flattenPostmanItems(postmanJson.item || [], '');
  const usedNames      = new Set();
  const results        = [];

  for (const { item, prefix } of flatItems) {
    const req = item.request;

    const method = typeof req === 'string' ? 'GET' : (req.method || 'GET').toUpperCase();
    let rawUrl = '';
    if (typeof req === 'string') {
      rawUrl = req;
    } else if (req.url) {
      rawUrl = typeof req.url === 'string' ? req.url : (req.url.raw || '');
    }

    const baseName  = sanitiseName(item.name || rawUrl || 'request');
    const prefixed  = prefix ? `${prefix}-${baseName}` : baseName;
    let uniqueName  = prefixed;
    let counter     = 2;
    while (usedNames.has(uniqueName)) uniqueName = `${prefixed}-${counter++}`;
    usedNames.add(uniqueName);

    if (!rawUrl) {
      results.push({ name: uniqueName, skipped: true, reason: 'no URL' });
      continue;
    }

    const headers     = parsePostmanHeaders(typeof req !== 'string' ? req.header : []);
    const body        = typeof req !== 'string' && req.body ? parsePostmanBody(req.body) : null;
    const auth        = typeof req !== 'string' && req.auth ? parsePostmanAuth(req.auth) : { type: 'none' };
    const description = typeof req !== 'string' && req.description
      ? (typeof req.description === 'string' ? req.description : (req.description.content || '')).slice(0, 200)
      : '';

    const reqObj = {
      name: uniqueName, method, url: rawUrl, headers, body, auth,
      description, createdAt: new Date().toISOString(),
    };

    await Collection.save(collectionName, reqObj);
    results.push({ name: uniqueName, method, url: rawUrl, skipped: false });
  }

  return { collectionName, results };
}

// ─────────────────────────────────────────────────────────────
//  HTTP helpers
// ─────────────────────────────────────────────────────────────

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type':                'application/json',
    'Cache-Control':               'no-cache',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(payload);
}

function sendHtml(res, html) {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(html);
}

async function parseBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => { data += chunk; });
    req.on('end', () => {
      try { resolve(data ? JSON.parse(data) : {}); }
      catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

// ─────────────────────────────────────────────────────────────
//  Router
// ─────────────────────────────────────────────────────────────

async function router(req, res) {
  const parsed   = url.parse(req.url, true);
  const pathname = parsed.pathname.replace(/\/+$/, '') || '/';
  const method   = req.method.toUpperCase();

  // CORS preflight
  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin':  '*',
      'Access-Control-Allow-Methods': '*',
      'Access-Control-Allow-Headers': '*',
    });
    return res.end();
  }

  // ── Dashboard ──────────────────────────────────────────────
  if (method === 'GET' && pathname === '/') {
    return sendHtml(res, DashboardView.build(PORT));
  }

  // ── Health check ───────────────────────────────────────────
  if (method === 'GET' && pathname === '/api/health') {
    return sendJson(res, 200, { ok: true, port: PORT, pid: process.pid });
  }

  // ── Global state ───────────────────────────────────────────
  if (method === 'GET' && pathname === '/api/state') {
    const state = await State.get();
    const envs  = await Environment.getAll();
    return sendJson(res, 200, { activeEnv: state.activeEnv, envs });
  }

  // ── Global last response ───────────────────────────────────
  if (method === 'GET' && pathname === '/api/last-response') {
    const state = await State.get();
    return sendJson(res, 200, state.lastResponse || null);
  }

  // ── Collections list ───────────────────────────────────────
  if (method === 'GET' && pathname === '/api/collections') {
    return sendJson(res, 200, await Collection.getAll());
  }

  // ── History — clear (DELETE /api/history) ─────────────────
  if (method === 'DELETE' && pathname === '/api/history') {
    await History.clear();
    return sendJson(res, 200, { ok: true });
  }

  // ── History — global list ──────────────────────────────────
  if (method === 'GET' && pathname === '/api/history') {
    const limit   = parseInt(parsed.query.limit, 10) || 30;
    const history = await History.getGlobal(limit);
    return sendJson(res, 200, history);
  }

  // ── Environments — list (full objects) ────────────────────
  if (method === 'GET' && pathname === '/api/environments') {
    const names = await Environment.getAll();
    const envs  = await Promise.all(names.map(n => Environment.get(n)));
    return sendJson(res, 200, envs.filter(Boolean));
  }

  // ── Environments — create ─────────────────────────────────
  if (method === 'POST' && pathname === '/api/environments') {
    const body = await parseBody(req);
    const name = (body.name || '').trim();
    if (!name) return sendJson(res, 400, { error: 'name is required' });
    if (!/^[a-zA-Z0-9_-]+$/.test(name))
      return sendJson(res, 400, { error: 'name must match [a-zA-Z0-9_-]' });
    const existing = await Environment.get(name);
    if (existing) return sendJson(res, 409, { error: `Environment "${name}" already exists` });
    await Environment.save({ name, variables: {}, createdAt: new Date().toISOString() });
    return sendJson(res, 201, { ok: true, name });
  }

  // ── Switch active env ─────────────────────────────────────
  if (method === 'POST' && pathname === '/api/env/use') {
    const body  = await parseBody(req);
    const state = await State.get();
    await State.save({ ...state, activeEnv: body.name || null });
    return sendJson(res, 200, { ok: true });
  }

  // ── Import Postman collection ──────────────────────────────
  if (method === 'POST' && pathname === '/api/import') {
    const postmanJson = await parseBody(req);
    try {
      const result = await runImport(postmanJson);
      return sendJson(res, 200, result);
    } catch (e) {
      return sendJson(res, 400, { error: e.message });
    }
  }

  // ── Stop server ───────────────────────────────────────────
  if (method === 'POST' && pathname === '/api/stop') {
    sendJson(res, 200, { ok: true });
    setImmediate(() => process.exit(0));
    return;
  }

  // ── Run request ───────────────────────────────────────────
  const runMatch = pathname.match(/^\/api\/run\/([^/]+)\/([^/]+)$/);
  if (method === 'POST' && runMatch) {
    const col     = decodeURIComponent(runMatch[1]);
    const reqName = decodeURIComponent(runMatch[2]);
    try {
      const result = await executeRequest(col, reqName);
      return sendJson(res, 200, result);
    } catch (e) {
      return sendJson(res, 500, { error: e.message });
    }
  }

  // ── Per-request history ───────────────────────────────────
  const histMatch = pathname.match(/^\/api\/history\/([^/]+)\/([^/]+)$/);
  if (method === 'GET' && histMatch) {
    const col     = decodeURIComponent(histMatch[1]);
    const reqName = decodeURIComponent(histMatch[2]);
    const entries = await History.getForRequest(col, reqName);
    return sendJson(res, 200, entries);
  }

  // ── Per-env: delete var, update vars, get, delete env ─────
  const envVarKeyMatch = pathname.match(/^\/api\/environments\/([^/]+)\/vars\/([^/]+)$/);
  if (method === 'DELETE' && envVarKeyMatch) {
    const envName = decodeURIComponent(envVarKeyMatch[1]);
    const varKey  = decodeURIComponent(envVarKeyMatch[2]);
    const env = await Environment.get(envName);
    if (!env) return sendJson(res, 404, { error: 'Environment not found' });
    if (!Object.prototype.hasOwnProperty.call(env.variables || {}, varKey))
      return sendJson(res, 404, { error: `Key "${varKey}" not found` });
    await Environment.remove(envName, varKey);
    return sendJson(res, 200, { ok: true });
  }

  const envVarsMatch = pathname.match(/^\/api\/environments\/([^/]+)\/vars$/);
  if (method === 'PUT' && envVarsMatch) {
    const envName = decodeURIComponent(envVarsMatch[1]);
    const body    = await parseBody(req);
    const env = await Environment.get(envName);
    if (!env) return sendJson(res, 404, { error: 'Environment not found' });
    env.variables = env.variables || {};
    // Accept { key, value } for single key or { vars: {...} } for bulk
    if (body.vars && typeof body.vars === 'object') {
      Object.assign(env.variables, body.vars);
    } else if (body.key != null) {
      env.variables[body.key] = body.value;
    }
    await Environment.save(env);
    return sendJson(res, 200, { ok: true });
  }

  const envNameMatch = pathname.match(/^\/api\/environments\/([^/]+)$/);
  if (method === 'GET' && envNameMatch) {
    const envName = decodeURIComponent(envNameMatch[1]);
    const env = await Environment.get(envName);
    if (!env) return sendJson(res, 404, { error: 'Environment not found' });
    return sendJson(res, 200, env);
  }

  if (method === 'DELETE' && envNameMatch) {
    const envName = decodeURIComponent(envNameMatch[1]);
    const env = await Environment.get(envName);
    if (!env) return sendJson(res, 404, { error: 'Environment not found' });
    const state    = await State.get();
    const wasActive = state.activeEnv === envName;
    if (wasActive) await State.save({ ...state, activeEnv: null });
    await Environment.remove(envName);
    return sendJson(res, 200, { ok: true, wasActive });
  }

  // ── Per-request last response ──────────────────────────────
  const lastResMatch = pathname.match(/^\/api\/last-response\/([^/]+)\/([^/]+)$/);
  if (method === 'GET' && lastResMatch) {
    const col     = decodeURIComponent(lastResMatch[1]);
    const reqName = decodeURIComponent(lastResMatch[2]);
    const snap = await State.getLastResponse(col, reqName);
    return sendJson(res, snap ? 200 : 404, snap || { error: 'No response saved' });
  }

  // ── Delete collection ──────────────────────────────────────
  const colOnlyMatch = pathname.match(/^\/api\/collections\/([^/]+)$/);
  if (method === 'DELETE' && colOnlyMatch) {
    const col = decodeURIComponent(colOnlyMatch[1]);
    const cols = await Collection.getAll();
    if (!cols.includes(col)) return sendJson(res, 404, { error: 'Collection not found' });
    await Collection.deleteCollection(col);
    return sendJson(res, 200, { ok: true });
  }

  // ── Requests in collection ─────────────────────────────────
  if (method === 'GET' && colOnlyMatch) {
    const col  = decodeURIComponent(colOnlyMatch[1]);
    const reqs = await Collection.getRequests(col);
    const list = await Promise.all(reqs.map(async n => {
      const r = await Collection.getRequest(col, n);
      return { name: n, method: r.method, url: r.url, description: r.description };
    }));
    return sendJson(res, 200, list);
  }

  // ── Single request CRUD ────────────────────────────────────
  const reqMatch = pathname.match(/^\/api\/collections\/([^/]+)\/([^/]+)$/);

  if (method === 'GET' && reqMatch) {
    const col     = decodeURIComponent(reqMatch[1]);
    const reqName = decodeURIComponent(reqMatch[2]);
    const request = await Collection.getRequest(col, reqName);
    if (!request) return sendJson(res, 404, { error: 'Not found' });
    const lastResponse = await State.getLastResponse(col, reqName);
    return sendJson(res, 200, { request, lastResponse });
  }

  if (method === 'POST' && reqMatch) {
    const col     = decodeURIComponent(reqMatch[1]);
    const reqName = decodeURIComponent(reqMatch[2]);
    const body    = await parseBody(req);
    await Collection.save(col, { ...body, name: reqName });
    return sendJson(res, 200, { ok: true });
  }

  if (method === 'DELETE' && reqMatch) {
    const col     = decodeURIComponent(reqMatch[1]);
    const reqName = decodeURIComponent(reqMatch[2]);
    const existing = await Collection.getRequest(col, reqName);
    if (!existing) return sendJson(res, 404, { error: 'Not found' });
    await Collection.deleteRequest(col, reqName);
    // Remove aux files
    const base = path.join(COLLECTIONS_DIR, col);
    await fs.remove(path.join(base, `${reqName}.last.json`)).catch(() => {});
    await fs.remove(path.join(base, `${reqName}.history.jsonl`)).catch(() => {});
    return sendJson(res, 200, { ok: true });
  }

  sendJson(res, 404, { error: 'Not found' });
}

// ─────────────────────────────────────────────────────────────
//  Boot
// ─────────────────────────────────────────────────────────────

(async () => {
  await ensureDirs();

  const server = http.createServer(async (req, res) => {
    try {
      await router(req, res);
    } catch (err) {
      console.error('[mail-man server error]', err.message);
      try { sendJson(res, 500, { error: err.message }); } catch {}
    }
  });

  // Track sockets so shutdown() can close keep-alive connections instantly
  const openSockets = new Set();
  server.on('connection', socket => {
    openSockets.add(socket);
    socket.once('close', () => openSockets.delete(socket));
  });

  function shutdown() {
    for (const socket of openSockets) socket.destroy();
    openSockets.clear();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 2000).unref();
  }

  server.listen(PORT, '127.0.0.1', async () => {
    await fs.writeJson(PID_FILE, { pid: process.pid, port: PORT }, { spaces: 2 });
  });

  server.on('error', err => {
    if (err.code === 'EADDRINUSE') {
      console.error(`[mail-man] Port ${PORT} is already in use. Is mail-man already running?`);
      console.error(`           Use MM_PORT=<port> to override.`);
    } else {
      console.error('[mail-man] Server error:', err.message);
    }
    process.exit(1);
  });

  process.on('SIGTERM', async () => {
    await fs.remove(PID_FILE).catch(() => {});
    shutdown();
  });

  process.on('SIGINT', async () => {
    await fs.remove(PID_FILE).catch(() => {});
    shutdown();
  });
})();
