'use strict';

/**
 * src/models/State.js
 *
 * Active environment + last-response state.
 * All file I/O lives here — no console output.
 */

const path = require('path');
const fs   = require('fs-extra');
const { STATE_FILE, COLLECTIONS_DIR } = require('./db');

// ---------------------------------------------------------------------------
// State  (.state.json)
// ---------------------------------------------------------------------------

/**
 * Read the current state object.
 * @returns {Promise<{activeEnv: string|null, lastResponse: object|null}>}
 */
async function get() {
  try {
    return await fs.readJson(STATE_FILE);
  } catch {
    return { activeEnv: null, lastResponse: null };
  }
}

/**
 * Persist the state object.
 * @param {object} stateObj
 */
async function save(stateObj) {
  await fs.writeJson(STATE_FILE, stateObj, { spaces: 2 });
}

// ---------------------------------------------------------------------------
// Per-request last response  (<req>.last.json)
// ---------------------------------------------------------------------------

/**
 * Persist the last response for a specific collection/request pair.
 * File lives at: data/collections/<collection>/<request>.last.json
 * @param {string} collection
 * @param {string} reqName
 * @param {object} data
 */
async function saveLastResponse(collection, reqName, data) {
  const file = path.join(COLLECTIONS_DIR, collection, `${reqName}.last.json`);
  await fs.writeJson(file, data, { spaces: 2 });
}

/**
 * Load the last response for a specific collection/request pair.
 * @param {string} collection
 * @param {string} reqName
 * @returns {Promise<object|null>}
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
  get,
  save,
  saveLastResponse,
  getLastResponse,
};
