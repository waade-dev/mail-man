'use strict';

/**
 * src/models/History.js
 *
 * Global history (history.jsonl) and per-request history (<req>.history.jsonl).
 * All file I/O lives here — no console output.
 */

const path = require('path');
const fs   = require('fs-extra');
const { HISTORY_FILE, COLLECTIONS_DIR } = require('./db');

const HISTORY_PER_REQUEST_LIMIT = 50;

// ---------------------------------------------------------------------------
// Global history
// ---------------------------------------------------------------------------

/**
 * Append a single entry to the global history.jsonl.
 * @param {object} entry
 */
async function append(entry) {
  const line = JSON.stringify(entry) + '\n';
  await fs.appendFile(HISTORY_FILE, line);
}

/**
 * Read global history entries (newest first, limited to last N).
 * @param {number} limit
 * @returns {Promise<object[]>}
 */
async function getGlobal(limit = 50) {
  try {
    const raw   = await fs.readFile(HISTORY_FILE, 'utf8');
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
 * Wipe all global history.
 */
async function clear() {
  await fs.writeFile(HISTORY_FILE, '');
}

// ---------------------------------------------------------------------------
// Per-request history  (<req>.history.jsonl, capped at 50)
// ---------------------------------------------------------------------------

/**
 * Prepend a new entry to <req>.history.jsonl, trimming to 50.
 * @param {string} collection
 * @param {string} reqName
 * @param {object} entry
 */
async function appendForRequest(collection, reqName, entry) {
  const file = path.join(COLLECTIONS_DIR, collection, `${reqName}.history.jsonl`);
  let entries = [];
  if (await fs.pathExists(file)) {
    const raw = await fs.readFile(file, 'utf8');
    entries = raw.trim().split('\n').filter(Boolean).map(l => {
      try { return JSON.parse(l); } catch { return null; }
    }).filter(Boolean);
  }
  entries.unshift(entry); // newest first
  if (entries.length > HISTORY_PER_REQUEST_LIMIT) {
    entries = entries.slice(0, HISTORY_PER_REQUEST_LIMIT);
  }
  await fs.writeFile(file, entries.map(e => JSON.stringify(e)).join('\n') + '\n');
}

/**
 * Read per-request history (newest first, up to 50).
 * @param {string} collection
 * @param {string} reqName
 * @returns {Promise<object[]>}
 */
async function getForRequest(collection, reqName) {
  const file = path.join(COLLECTIONS_DIR, collection, `${reqName}.history.jsonl`);
  if (!(await fs.pathExists(file))) return [];
  try {
    const raw = await fs.readFile(file, 'utf8');
    return raw.trim().split('\n').filter(Boolean).map(l => {
      try { return JSON.parse(l); } catch { return null; }
    }).filter(Boolean);
  } catch {
    return [];
  }
}

module.exports = {
  append,
  getGlobal,
  clear,
  appendForRequest,
  getForRequest,
};
