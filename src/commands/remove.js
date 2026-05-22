'use strict';

/**
 * mm remove <collection/request>
 * mm remove <collection>            ← removes entire collection (with confirm)
 *
 * Also deletes the associated .last.json and .history.jsonl files.
 */

const inquirer = require('inquirer');
const chalk    = require('chalk');
const store    = require('../utils/store');
const { parsePath } = require('../utils/pathHelper');
const { success, error, info } = require('../utils/output');
const path = require('path');
const fs   = require('fs-extra');

async function removeCommand(pathStr) {
  const { collection, request } = parsePath(pathStr);

  if (!collection) {
    error('Usage: mm remove <collection>/<request>  or  mm remove <collection>');
    process.exit(1);
  }

  const cols = await store.getCollections();

  // ── Remove a single request ─────────────────────────────────
  if (request) {
    if (!cols.includes(collection)) {
      error(`Collection "${collection}" not found.`);
      process.exit(1);
    }
    const req = await store.getRequest(collection, request);
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

    await store.deleteRequest(collection, request);

    // Also remove .last.json and .history.jsonl if present
    const base = path.join(store.COLLECTIONS_DIR, collection);
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

  const reqs  = await store.getRequests(collection);
  const label = reqs.length === 1 ? '1 request' : `${reqs.length} requests`;

  const { confirm } = await inquirer.prompt([{
    type:    'confirm',
    name:    'confirm',
    message: `Remove collection ${chalk.bold(collection)} and all its ${label}?`,
    default: false,
  }]);
  if (!confirm) { info('Aborted.'); return; }

  await store.deleteCollection(collection);
  success(`Removed collection ${chalk.bold(collection)}.`);
}

module.exports = { removeCommand };
