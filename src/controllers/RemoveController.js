'use strict';

/**
 * src/controllers/RemoveController.js
 *
 * mm remove <collection/request>  — Delete a request.
 * mm remove <collection>          — Delete entire collection (with confirm).
 */

const inquirer   = require('inquirer');
const chalk      = require('chalk');
const path       = require('path');
const fs         = require('fs-extra');
const Collection = require('../models/Collection');
const { parsePath } = require('../utils/pathHelper');
const { success, error, info } = require('../views/console');

async function remove(pathStr) {
  const { collection, request } = parsePath(pathStr);

  if (!collection) {
    error('Usage: mm remove <collection>/<request>  or  mm remove <collection>');
    process.exit(1);
  }

  const cols = await Collection.getAll();

  // ── Remove a single request ─────────────────────────────────
  if (request) {
    if (!cols.includes(collection)) {
      error(`Collection "${collection}" not found.`);
      process.exit(1);
    }
    const req = await Collection.getRequest(collection, request);
    if (!req) {
      error(`Request "${request}" not found in "${collection}".`);
      process.exit(1);
    }

    const { confirm } = await inquirer.prompt([{
      type:    'confirm',
      name:    'confirm',
      message: `Remove ${chalk.bold(collection + '/' + request)}?`,
      default: false,
    }]);
    if (!confirm) { info('Aborted.'); return; }

    await Collection.deleteRequest(collection, request);

    // Also remove .last.json and .history.jsonl if present
    const base = path.join(Collection.COLLECTIONS_DIR, collection);
    await fs.remove(path.join(base, `${request}.last.json`)).catch(() => {});
    await fs.remove(path.join(base, `${request}.history.jsonl`)).catch(() => {});

    success(`Removed ${chalk.bold(collection + '/' + request)}`);
    return;
  }

  // ── Remove an entire collection ─────────────────────────────
  if (!cols.includes(collection)) {
    error(`Collection "${collection}" not found.`);
    process.exit(1);
  }

  const reqs  = await Collection.getRequests(collection);
  const label = reqs.length === 1 ? '1 request' : `${reqs.length} requests`;

  const { confirm } = await inquirer.prompt([{
    type:    'confirm',
    name:    'confirm',
    message: `Remove collection ${chalk.bold(collection)} and all its ${label}?`,
    default: false,
  }]);
  if (!confirm) { info('Aborted.'); return; }

  await Collection.deleteCollection(collection);
  success(`Removed collection ${chalk.bold(collection)}.`);
}

module.exports = { remove };
