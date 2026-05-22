'use strict';

/**
 * src/models/Collection.js
 *
 * Collection + request CRUD.
 * All file I/O lives here — no console output.
 */

const path = require('path');
const fs   = require('fs-extra');
const { COLLECTIONS_DIR } = require('./db');

// ---------------------------------------------------------------------------
// Collections
// ---------------------------------------------------------------------------

/**
 * Return an array of collection names (directory names under COLLECTIONS_DIR).
 * @returns {Promise<string[]>}
 */
async function getAll() {
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
 * Filters out .last.json files so they never appear as requests.
 * @param {string} collection
 * @returns {Promise<string[]>}
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
 * @param {string} name
 * @returns {Promise<object|null>}
 */
async function getRequest(collection, name) {
  const file = path.join(COLLECTIONS_DIR, collection, `${name}.json`);
  if (!(await fs.pathExists(file))) return null;
  return fs.readJson(file);
}

/**
 * Persist a request object.
 * @param {string} collection
 * @param {object} reqObj  Must have a `name` property.
 */
async function save(collection, reqObj) {
  const dir = path.join(COLLECTIONS_DIR, collection);
  await fs.ensureDir(dir);
  const file = path.join(dir, `${reqObj.name}.json`);
  await fs.writeJson(file, reqObj, { spaces: 2 });
}

/**
 * Delete a single request file.
 * @param {string} collection
 * @param {string} name
 * @returns {Promise<boolean>}
 */
async function deleteRequest(collection, name) {
  const file = path.join(COLLECTIONS_DIR, collection, `${name}.json`);
  if (!(await fs.pathExists(file))) return false;
  await fs.remove(file);
  return true;
}

/**
 * Delete an entire collection directory.
 * @param {string} collection
 * @returns {Promise<boolean>}
 */
async function deleteCollection(collection) {
  const dir = path.join(COLLECTIONS_DIR, collection);
  if (!(await fs.pathExists(dir))) return false;
  await fs.remove(dir);
  return true;
}

module.exports = {
  COLLECTIONS_DIR,
  getAll,
  getRequests,
  getRequest,
  save,
  deleteRequest,
  deleteCollection,
};
