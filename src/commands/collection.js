'use strict';

/**
 * Collection & request management commands:
 *   mm new <name>
 *   mm collections
 *   mm ls <collection>
 *   mm view <collection> <request>
 *   mm rm <collection> [request]
 */

const inquirer   = require('inquirer');
const chalk      = require('chalk');
const store      = require('../utils/store');
const { success, error, info, warn, header, colorMethod } = require('../utils/output');

// ---------------------------------------------------------------------------
// mm new <name>  – create a new (empty) collection
// ---------------------------------------------------------------------------

async function newCollection(name) {
  // Validate name
  if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
    error('Collection name must contain only letters, numbers, hyphens, or underscores.');
    process.exit(1);
  }

  const existing = await store.getCollections();
  if (existing.includes(name)) {
    warn(`Collection "${name}" already exists.`);
    return;
  }

  // Create the directory – saveRequest is the canonical writer but ensureDir is enough here
  const path = require('path');
  const fs   = require('fs-extra');
  await fs.ensureDir(path.join(store.COLLECTIONS_DIR, name));
  success(`Collection "${name}" created.`);
}

// ---------------------------------------------------------------------------
// mm collections – list all collections
// ---------------------------------------------------------------------------

async function listCollections() {
  const cols = await store.getCollections();
  if (cols.length === 0) {
    info('No collections yet. Create one with: mm new <name>');
    return;
  }
  header('\n  Collections\n');
  for (const col of cols) {
    const reqs = await store.getRequests(col);
    console.log(
      `  ${chalk.bold.white(col.padEnd(30))} ${chalk.gray(`${reqs.length} request${reqs.length !== 1 ? 's' : ''}`)}`
    );
  }
  console.log('');
}

// ---------------------------------------------------------------------------
// mm ls <collection> – list requests in a collection
// ---------------------------------------------------------------------------

async function listRequests(collection) {
  const cols = await store.getCollections();
  if (!cols.includes(collection)) {
    error(`Collection "${collection}" not found.`);
    process.exit(1);
  }

  const reqs = await store.getRequests(collection);
  if (reqs.length === 0) {
    info(`Collection "${collection}" is empty. Add requests with: mm add ${collection}`);
    return;
  }

  header(`\n  ${collection}\n`);
  for (const reqName of reqs) {
    const req = await store.getRequest(collection, reqName);
    const methodStr = colorMethod(req.method);
    const desc = req.description ? chalk.gray(` — ${req.description}`) : '';
    console.log(`  ${methodStr}  ${chalk.white(reqName)}${desc}`);
  }
  console.log('');
}

// ---------------------------------------------------------------------------
// mm view <collection> <request> – pretty-print request details
// ---------------------------------------------------------------------------

async function viewRequest(collection, reqName) {
  const req = await store.getRequest(collection, reqName);
  if (!req) {
    error(`Request "${reqName}" not found in collection "${collection}".`);
    process.exit(1);
  }
  const { printRequest } = require('../utils/output');
  printRequest(req);
}

// ---------------------------------------------------------------------------
// mm rm <collection> [request] – remove collection or request
// ---------------------------------------------------------------------------

async function removeItem(collection, reqName) {
  if (reqName) {
    // Remove a single request
    const req = await store.getRequest(collection, reqName);
    if (!req) {
      error(`Request "${reqName}" not found in collection "${collection}".`);
      process.exit(1);
    }
    const { confirm } = await inquirer.prompt([{
      type: 'confirm',
      name: 'confirm',
      message: `Delete request "${reqName}" from "${collection}"?`,
      default: false,
    }]);
    if (!confirm) { info('Aborted.'); return; }
    await store.deleteRequest(collection, reqName);
    success(`Request "${reqName}" deleted from "${collection}".`);
  } else {
    // Remove entire collection
    const cols = await store.getCollections();
    if (!cols.includes(collection)) {
      error(`Collection "${collection}" not found.`);
      process.exit(1);
    }
    const reqs = await store.getRequests(collection);
    const { confirm } = await inquirer.prompt([{
      type: 'confirm',
      name: 'confirm',
      message: `Delete entire collection "${collection}" (${reqs.length} requests)?`,
      default: false,
    }]);
    if (!confirm) { info('Aborted.'); return; }
    await store.deleteCollection(collection);
    success(`Collection "${collection}" deleted.`);
  }
}

module.exports = { newCollection, listCollections, listRequests, viewRequest, removeItem };
