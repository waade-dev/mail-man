'use strict';

/**
 * src/models/db.js
 *
 * Path constants + ensureDirs() bootstrap.
 * All other models import from here.
 */

const path = require('path');
const fs   = require('fs-extra');
const os   = require('os');

// ---------------------------------------------------------------------------
// Path constants
// ---------------------------------------------------------------------------

const BASE_DIR        = path.join(os.homedir(), 'Developer', 'mail-man');
const DATA_DIR        = path.join(BASE_DIR, 'data');
const COLLECTIONS_DIR = path.join(DATA_DIR, 'collections');
const ENVIRONMENTS_DIR = path.join(DATA_DIR, 'environments');
const HISTORY_FILE    = path.join(DATA_DIR, 'history.jsonl');
const STATE_FILE      = path.join(DATA_DIR, '.state.json');

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
  if (!(await fs.pathExists(STATE_FILE))) {
    await fs.writeJson(STATE_FILE, { activeEnv: null, lastResponse: null }, { spaces: 2 });
  }
  if (!(await fs.pathExists(HISTORY_FILE))) {
    await fs.writeFile(HISTORY_FILE, '');
  }
}

module.exports = {
  BASE_DIR,
  DATA_DIR,
  COLLECTIONS_DIR,
  ENVIRONMENTS_DIR,
  HISTORY_FILE,
  STATE_FILE,
  ensureDirs,
};
