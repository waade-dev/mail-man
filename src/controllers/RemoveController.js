'use strict';

/**
 * src/controllers/RemoveController.js
 *
 * mm remove <collection/request>  — Delete a request.
 * mm remove <collection>          — Delete entire collection.
 * Confirmation prompt is local; delete goes through server.
 */

const inquirer  = require('inquirer');
const chalk     = require('chalk');
const api       = require('../utils/apiClient');
const { parsePath } = require('../utils/pathHelper');
const { success, error, info } = require('../views/console');

async function remove(pathStr) {
  const { collection, request } = parsePath(pathStr);

  if (!collection) {
    error('Usage: mm remove <collection>/<request>  or  mm remove <collection>');
    process.exit(1);
  }

  const colsRes = await api.get('/api/collections');
  const cols    = colsRes.body;

  // ── Remove a single request ─────────────────────────────────
  if (request) {
    if (!cols.includes(collection)) {
      error(`Collection "${collection}" not found.`);
      process.exit(1);
    }

    const reqRes = await api.get(
      `/api/collections/${encodeURIComponent(collection)}/${encodeURIComponent(request)}`
    );
    if (reqRes.status === 404) {
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

    const delRes = await api.del(
      `/api/collections/${encodeURIComponent(collection)}/${encodeURIComponent(request)}`
    );
    if (delRes.status !== 200) {
      error(`Failed to remove: ${delRes.body && delRes.body.error ? delRes.body.error : 'unknown error'}`);
      process.exit(1);
    }
    success(`Removed ${chalk.bold(collection + '/' + request)}`);
    return;
  }

  // ── Remove an entire collection ─────────────────────────────
  if (!cols.includes(collection)) {
    error(`Collection "${collection}" not found.`);
    process.exit(1);
  }

  const reqsRes = await api.get(`/api/collections/${encodeURIComponent(collection)}`);
  const reqs    = reqsRes.body || [];
  const label   = reqs.length === 1 ? '1 request' : `${reqs.length} requests`;

  const { confirm } = await inquirer.prompt([{
    type:    'confirm',
    name:    'confirm',
    message: `Remove collection ${chalk.bold(collection)} and all its ${label}?`,
    default: false,
  }]);
  if (!confirm) { info('Aborted.'); return; }

  const colDelRes = await api.del(`/api/collections/${encodeURIComponent(collection)}`);
  if (colDelRes.status !== 200) {
    error(`Failed to remove: ${colDelRes.body && colDelRes.body.error ? colDelRes.body.error : 'unknown error'}`);
    process.exit(1);
  }
  success(`Removed collection ${chalk.bold(collection)}.`);
}

module.exports = { remove };
