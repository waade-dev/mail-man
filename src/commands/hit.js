'use strict';

/**
 * mm hit <collection/request>
 *
 * Executes the HTTP request, prints a colour-coded response,
 * saves to global history + per-request history (capped at 50).
 */

const axios    = require('axios');
const chalk    = require('chalk');
const store    = require('../utils/store');
const { resolveRequest } = require('../utils/interpolate');
const { error, info, warn, printResponse, colorMethod } = require('../utils/output');
const { parsePath } = require('../utils/pathHelper');

// ─────────────────────────────────────────────────────────────
//  Spinner
// ─────────────────────────────────────────────────────────────

function createSpinner(msg) {
  const frames = ['⠋','⠙','⠹','⠸','⠼','⠴','⠦','⠧','⠇','⠏'];
  let i = 0;
  const id = setInterval(() => {
    process.stderr.write(`\r${chalk.cyan(frames[i++ % frames.length])} ${msg}`);
  }, 80);
  return { stop: () => { clearInterval(id); process.stderr.write('\r\x1b[K'); } };
}

// ─────────────────────────────────────────────────────────────
//  Build axios config
// ─────────────────────────────────────────────────────────────

function buildAxiosConfig(req) {
  const config = {
    method:         req.method,
    url:            req.url,
    headers:        { ...(req.headers || {}) },
    validateStatus: () => true,
    responseType:   'json',
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

// ─────────────────────────────────────────────────────────────
//  Core executor
// ─────────────────────────────────────────────────────────────

async function executeRequest(collection, reqName) {
  const req = await store.getRequest(collection, reqName);
  if (!req) {
    error(`Request not found: ${chalk.bold(collection + '/' + reqName)}`);
    error(`  Add it first with: mm add ${collection}/${reqName}`);
    process.exit(1);
  }

  // Load active env vars
  const state = await store.getState();
  let envVars = {};
  if (state.activeEnv) {
    const env = await store.getEnvironment(state.activeEnv);
    if (env) {
      envVars = env.variables || {};
    } else {
      warn(`Active environment "${state.activeEnv}" not found. Running without variables.`);
    }
  }

  const resolved    = resolveRequest(req, envVars);
  const unresolved  = (resolved.url || '').match(/\{\{[^}]+\}\}/g);
  if (unresolved) warn(`Unresolved variables in URL: ${unresolved.join(', ')}`);

  const axiosConfig = buildAxiosConfig(resolved);

  // Print what we're sending
  console.log('');
  console.log(
    chalk.bold('  Sending  ') + colorMethod(resolved.method) + '  ' + chalk.white(resolved.url)
  );
  if (state.activeEnv) console.log(chalk.gray(`  env: ${state.activeEnv}`));
  console.log('');

  const spinner   = createSpinner('Waiting for response…');
  const startTime = Date.now();
  let response;
  try {
    response = await axios(axiosConfig);
  } catch (e) {
    spinner.stop();
    error(`Network error: ${e.message}`);
    process.exit(1);
  }
  spinner.stop();
  const duration = Date.now() - startTime;

  printResponse(response, duration);

  // ── Persist ──────────────────────────────────────────────────
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
    responseHeaders: response.headers,
    body:            response.data,
    duration,
  };

  // Global .state.json  (for mm beautify with no args)
  await store.saveState({ ...state, lastResponse: snapshot });

  // Per-request .last.json  (for mm beautify coll/file)
  await store.saveLastResponse(collection, reqName, snapshot);

  // Global history.jsonl (summary only)
  await store.appendHistory({
    timestamp:    snapshot.timestamp,
    collection,
    request:      reqName,
    method:       req.method,
    url:          resolved.url,
    status:       response.status,
    duration,
    responseBody: JSON.stringify(response.data).slice(0, 4096),
  });

  // Per-request history (full, capped at 50)
  await store.saveRequestHistory(collection, reqName, snapshot);
}

// ─────────────────────────────────────────────────────────────
//  mm hit <collection/request>
// ─────────────────────────────────────────────────────────────

async function hitCommand(pathStr) {
  const { collection, request } = parsePath(pathStr);

  if (!collection || !request) {
    error('Usage: mm hit <collection>/<request>');
    error('  e.g. mm hit my-api/get-users');
    process.exit(1);
  }

  const cols = await store.getCollections();
  if (!cols.includes(collection)) {
    error(`Collection "${collection}" not found.`);
    error(`  Available: ${cols.join(', ') || '(none)'}`);
    process.exit(1);
  }

  await executeRequest(collection, request);
}

module.exports = { hitCommand };
