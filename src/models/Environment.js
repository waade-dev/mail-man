'use strict';

/**
 * src/models/Environment.js
 *
 * Environment CRUD.
 * All file I/O lives here — no console output.
 */

const path = require('path');
const fs   = require('fs-extra');
const { ENVIRONMENTS_DIR } = require('./db');

// ---------------------------------------------------------------------------
// Environments
// ---------------------------------------------------------------------------

/**
 * Return an array of environment names.
 * @returns {Promise<string[]>}
 */
async function getAll() {
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
 * @returns {Promise<object|null>}
 */
async function get(name) {
  const file = path.join(ENVIRONMENTS_DIR, `${name}.json`);
  if (!(await fs.pathExists(file))) return null;
  return fs.readJson(file);
}

/**
 * Persist an environment object.
 * @param {object} envObj  Must have a `name` property.
 */
async function save(envObj) {
  const file = path.join(ENVIRONMENTS_DIR, `${envObj.name}.json`);
  await fs.writeJson(file, envObj, { spaces: 2 });
}

/**
 * Delete environment file or a single key within it.
 * @param {string} name
 * @param {string|null} key  If null, deletes entire env.
 * @returns {Promise<boolean>}
 */
async function remove(name, key = null) {
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

module.exports = {
  getAll,
  get,
  save,
  remove,
};
