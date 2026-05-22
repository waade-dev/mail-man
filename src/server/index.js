'use strict';

/**
 * mail-man  —  Dashboard server
 *
 * Spawned as a detached child by `mm start`.
 * Serves the visual dashboard at http://127.0.0.1:<port>
 * and a REST API the dashboard talks to.
 *
 * Writes its PID + port to data/.mm-server.pid once listening.
 * Exits cleanly on SIGTERM (sent by `mm stop`).
 */

const http  = require('http');
const net   = require('net');
const path  = require('path');
const url   = require('url');
const fs    = require('fs-extra');
const axios = require('axios');

const Collection              = require('../models/Collection');
const Environment             = require('../models/Environment');
const History                 = require('../models/History');
const State                   = require('../models/State');
const { ensureDirs, DATA_DIR } = require('../models/db');
const DashboardView           = require('../views/DashboardView');
const { resolveRequest }      = require('../utils/interpolate');

// ─────────────────────────────────────────────────────────────
//  Paths
// ─────────────────────────────────────────────────────────────

const PID_FILE = path.join(DATA_DIR, '.mm-server.pid');

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
//  Request execution (mirrors run.js logic)
// ─────────────────────────────────────────────────────────────

function buildAxiosConfig(req) {
  const config = {
    method: req.method,
    url: req.url,
    headers: { ...(req.headers || {}) },
    validateStatus: () => true,
    responseType: 'json',
    timeout: 30000,
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
    timestamp:  new Date().toISOString(),
    collection,
    request:    reqName,
    method:     req.method,
    url:        resolved.url,
    status:     response.status,
    statusText: response.statusText,
    headers:    response.headers,
    body:       response.data,
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

  return snapshot;
}

// ─────────────────────────────────────────────────────────────
//  HTTP helpers
// ─────────────────────────────────────────────────────────────

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type':  'application/json',
    'Cache-Control': 'no-cache',
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
    req.on('end',  () => {
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
    res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': '*', 'Access-Control-Allow-Headers': '*' });
    return res.end();
  }

  // ── Dashboard ──
  if (method === 'GET' && pathname === '/') {
    const port = res.socket.localPort;
    return sendHtml(res, DashboardView.build(port));
  }

  // ── State ──
  if (method === 'GET' && pathname === '/api/state') {
    const state = await State.get();
    const envs  = await Environment.getAll();
    return sendJson(res, 200, { activeEnv: state.activeEnv, envs });
  }

  // ── Collections list ──
  if (method === 'GET' && pathname === '/api/collections') {
    return sendJson(res, 200, await Collection.getAll());
  }

  // ── Requests in collection ──
  const colMatch = pathname.match(/^\/api\/collections\/([^/]+)$/);
  if (method === 'GET' && colMatch) {
    const col  = decodeURIComponent(colMatch[1]);
    const reqs = await Collection.getRequests(col);
    const list = await Promise.all(reqs.map(async n => {
      const r = await Collection.getRequest(col, n);
      return { name: n, method: r.method, url: r.url, description: r.description };
    }));
    return sendJson(res, 200, list);
  }

  // ── Single request + last response ──
  const reqMatch = pathname.match(/^\/api\/collections\/([^/]+)\/([^/]+)$/);
  if (method === 'GET' && reqMatch) {
    const col     = decodeURIComponent(reqMatch[1]);
    const reqName = decodeURIComponent(reqMatch[2]);
    const request = await Collection.getRequest(col, reqName);
    if (!request) return sendJson(res, 404, { error: 'Not found' });
    const lastResponse = await State.getLastResponse(col, reqName);
    return sendJson(res, 200, { request, lastResponse });
  }

  // ── Run request ──
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

  // ── History ──
  if (method === 'GET' && pathname === '/api/history') {
    const limit   = parseInt(parsed.query.limit, 10) || 30;
    const history = await History.getGlobal(limit);
    return sendJson(res, 200, history);
  }

  // ── Environments list ──
  if (method === 'GET' && pathname === '/api/environments') {
    return sendJson(res, 200, await Environment.getAll());
  }

  // ── Switch active env ──
  if (method === 'POST' && pathname === '/api/env/use') {
    const body  = await parseBody(req);
    const state = await State.get();
    await State.save({ ...state, activeEnv: body.name || null });
    return sendJson(res, 200, { ok: true });
  }

  // ── Stop server (called from dashboard button) ──
  if (method === 'POST' && pathname === '/api/stop') {
    sendJson(res, 200, { ok: true });
    setImmediate(() => process.exit(0));
    return;
  }

  sendJson(res, 404, { error: 'Not found' });
}

// ─────────────────────────────────────────────────────────────
//  Boot
// ─────────────────────────────────────────────────────────────

(async () => {
  await ensureDirs();

  const port   = await getFreePort();
  const server = http.createServer(async (req, res) => {
    try {
      await router(req, res);
    } catch (err) {
      console.error('[mail-man server error]', err.message);
      try { sendJson(res, 500, { error: err.message }); } catch {}
    }
  });

  server.listen(port, '127.0.0.1', async () => {
    // Write PID file so mm start / mm stop can manage us
    await fs.writeJson(PID_FILE, { pid: process.pid, port }, { spaces: 2 });
  });

  server.on('error', err => {
    console.error('[mail-man] Server error:', err.message);
    process.exit(1);
  });

  // Clean up on SIGTERM (sent by mm stop)
  process.on('SIGTERM', async () => {
    await fs.remove(PID_FILE).catch(() => {});
    server.close(() => process.exit(0));
  });

  process.on('SIGINT', async () => {
    await fs.remove(PID_FILE).catch(() => {});
    process.exit(0);
  });
})();
