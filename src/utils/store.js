'use strict';

const path = require('path');
const fs = require('fs-extra');

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

const BASE_DIR      = path.join(require('os').homedir(), 'Developer', 'mail-man');
const DATA_DIR      = path.join(BASE_DIR, 'data');
const COLLECTIONS_DIR = path.join(DATA_DIR, 'collections');
const ENVIRONMENTS_DIR = path.join(DATA_DIR, 'environments');
const HISTORY_FILE  = path.join(DATA_DIR, 'history.jsonl');
const STATE_FILE    = path.join(DATA_DIR, '.state.json');

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------

/**
 * Ensure all required directories and files exist.
 * Called once on CLI startup.
 */
async function ensureDirs() {
  await fs.ensureDir(COLLECTIONS_DIR);
  await fs.ensureDir(ENVIRONMENTS_DIR);
  // Create state file if missing
  if (!(await fs.pathExists(STATE_FILE))) {
    await fs.writeJson(STATE_FILE, { activeEnv: null, lastResponse: null }, { spaces: 2 });
  }
  // Create empty history file if missing
  if (!(await fs.pathExists(HISTORY_FILE))) {
    await fs.writeFile(HISTORY_FILE, '');
  }
}

// ---------------------------------------------------------------------------
// State helpers
// ---------------------------------------------------------------------------

async function getState() {
  try {
    return await fs.readJson(STATE_FILE);
  } catch {
    return { activeEnv: null, lastResponse: null };
  }
}

async function saveState(state) {
  await fs.writeJson(STATE_FILE, state, { spaces: 2 });
}

// ---------------------------------------------------------------------------
// History
// ---------------------------------------------------------------------------

/**
 * Append a single history entry (one JSON object per line).
 * @param {object} entry
 */
async function appendHistory(entry) {
  const line = JSON.stringify(entry) + '\n';
  await fs.appendFile(HISTORY_FILE, line);
}

/**
 * Read all history entries (newest first, limit to last N).
 * @param {number} limit
 * @returns {object[]}
 */
async function getHistory(limit = 20) {
  try {
    const raw = await fs.readFile(HISTORY_FILE, 'utf8');
    const lines = raw.trim().split('\n').filter(Boolean);
    const entries = lines.map(l => {
      try { return JSON.parse(l); } catch { return null; }
    }).filter(Boolean);
    return entries.slice(-limit).reverse();
  } catch {
    return [];
  }
}

/**
 * Clear all history.
 */
async function clearHistory() {
  await fs.writeFile(HISTORY_FILE, '');
}

// ---------------------------------------------------------------------------
// Collections
// ---------------------------------------------------------------------------

/**
 * Return an array of collection names (directory names under COLLECTIONS_DIR).
 */
async function getCollections() {
  await fs.ensureDir(COLLECTIONS_DIR);
  const entries = await fs.readdir(COLLECTIONS_DIR, { withFileTypes: true });
  return entries
    .filter(e => e.isDirectory())
    .map(e => e.name)
    .sort();
}

// ---------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------

/**
 * Return all request names in a collection.
 * @param {string} collection
 */
async function getRequests(collection) {
  const dir = path.join(COLLECTIONS_DIR, collection);
  if (!(await fs.pathExists(dir))) return [];
  const files = await fs.readdir(dir);
  return files
    .filter(f => f.endsWith('.json') && !f.endsWith('.last.json'))
    .map(f => f.replace('.json', ''))
    .sort();
}

/**
 * Load a single request object.
 * @param {string} collection
 * @param {string} reqName
 * @returns {object|null}
 */
async function getRequest(collection, reqName) {
  const file = path.join(COLLECTIONS_DIR, collection, `${reqName}.json`);
  if (!(await fs.pathExists(file))) return null;
  return fs.readJson(file);
}

/**
 * Persist a request object.
 * @param {string} collection
 * @param {object} reqObj  Must have a `name` property.
 */
async function saveRequest(collection, reqObj) {
  const dir = path.join(COLLECTIONS_DIR, collection);
  await fs.ensureDir(dir);
  const file = path.join(dir, `${reqObj.name}.json`);
  await fs.writeJson(file, reqObj, { spaces: 2 });
}

/**
 * Delete a single request file.
 */
async function deleteRequest(collection, reqName) {
  const file = path.join(COLLECTIONS_DIR, collection, `${reqName}.json`);
  if (!(await fs.pathExists(file))) return false;
  await fs.remove(file);
  return true;
}

/**
 * Delete an entire collection directory.
 */
async function deleteCollection(collection) {
  const dir = path.join(COLLECTIONS_DIR, collection);
  if (!(await fs.pathExists(dir))) return false;
  await fs.remove(dir);
  return true;
}

// ---------------------------------------------------------------------------
// Environments
// ---------------------------------------------------------------------------

async function getEnvironments() {
  await fs.ensureDir(ENVIRONMENTS_DIR);
  const files = await fs.readdir(ENVIRONMENTS_DIR);
  return files
    .filter(f => f.endsWith('.json'))
    .map(f => f.replace('.json', ''))
    .sort();
}

/**
 * Load a single environment object.
 * @param {string} name
 * @returns {object|null}
 */
async function getEnvironment(name) {
  const file = path.join(ENVIRONMENTS_DIR, `${name}.json`);
  if (!(await fs.pathExists(file))) return null;
  return fs.readJson(file);
}

/**
 * Persist an environment object.
 */
async function saveEnvironment(envObj) {
  const file = path.join(ENVIRONMENTS_DIR, `${envObj.name}.json`);
  await fs.writeJson(file, envObj, { spaces: 2 });
}

/**
 * Delete environment file or a single key within it.
 * @param {string} name
 * @param {string|null} key  If null, deletes entire env.
 */
async function deleteEnvironment(name, key = null) {
  const file = path.join(ENVIRONMENTS_DIR, `${name}.json`);
  if (!(await fs.pathExists(file))) return false;
  if (key === null) {
    await fs.remove(file);
  } else {
    const env = await fs.readJson(file);
    delete env.variables[key];
    await fs.writeJson(file, env, { spaces: 2 });
  }
  return true;
}

// ---------------------------------------------------------------------------
// Per-request history  (stored as <req>.history.jsonl, capped at 50)
// ---------------------------------------------------------------------------

const HISTORY_PER_REQUEST_LIMIT = 50;

/**
 * Prepend a new entry to <req>.history.jsonl, trimming to 50.
 * Each entry holds the full request + response snapshot.
 */
async function saveRequestHistory(collection, reqName, entry) {
  const file = path.join(COLLECTIONS_DIR, collection, `${reqName}.history.jsonl`);
  let entries = [];
  if (await fs.pathExists(file)) {
    const raw = await fs.readFile(file, 'utf8');
    entries = raw.trim().split('\n').filter(Boolean).map(l => {
      try { return JSON.parse(l); } catch { return null; }
    }).filter(Boolean);
  }
  entries.unshift(entry);                          // newest first
  if (entries.length > HISTORY_PER_REQUEST_LIMIT) {
    entries = entries.slice(0, HISTORY_PER_REQUEST_LIMIT);
  }
  await fs.writeFile(file, entries.map(e => JSON.stringify(e)).join('\n') + '\n');
}

/**
 * Read per-request history (newest first, up to 50).
 */
async function getRequestHistory(collection, reqName) {
  const file = path.join(COLLECTIONS_DIR, collection, `${reqName}.history.jsonl`);
  if (!(await fs.pathExists(file))) return [];
  try {
    const raw = await fs.readFile(file, 'utf8');
    return raw.trim().split('\n').filter(Boolean).map(l => {
      try { return JSON.parse(l); } catch { return null; }
    }).filter(Boolean);
  } catch { return []; }
}

// ---------------------------------------------------------------------------
// Per-request last response  (stored next to the request as <req>.last.json)
// ---------------------------------------------------------------------------

/**
 * Persist the last response for a specific collection/request pair.
 * File lives at:  data/collections/<collection>/<request>.last.json
 * @param {string} collection
 * @param {string} reqName
 * @param {object} data  - same shape as state.lastResponse
 */
async function saveLastResponse(collection, reqName, data) {
  const file = path.join(COLLECTIONS_DIR, collection, `${reqName}.last.json`);
  await fs.writeJson(file, data, { spaces: 2 });
}

/**
 * Load the last response for a specific collection/request pair.
 * Returns null if not found.
 * @param {string} collection
 * @param {string} reqName
 * @returns {object|null}
 */
async function getLastResponse(collection, reqName) {
  const file = path.join(COLLECTIONS_DIR, collection, `${reqName}.last.json`);
  if (!(await fs.pathExists(file))) return null;
  try {
    return await fs.readJson(file);
  } catch {
    return null;
  }
}

module.exports = {
  DATA_DIR,
  COLLECTIONS_DIR,
  ENVIRONMENTS_DIR,
  HISTORY_FILE,
  STATE_FILE,
  ensureDirs,
  getState,
  saveState,
  appendHistory,
  getHistory,
  clearHistory,
  getCollections,
  getRequests,
  getRequest,
  saveRequest,
  deleteRequest,
  deleteCollection,
  getEnvironments,
  getEnvironment,
  saveEnvironment,
  deleteEnvironment,
  saveLastResponse,
  getLastResponse,
  saveRequestHistory,
  getRequestHistory,
};
