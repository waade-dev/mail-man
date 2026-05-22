'use strict';

/**
 * src/controllers/HistoryController.js
 *
 * mm history [collection/request]  — Show global or per-request history.
 * mm history clear                 — Clear global history.
 */

const inquirer    = require('inquirer');
const api         = require('../utils/apiClient');
const HistoryView = require('../views/HistoryView');
const { parsePath } = require('../utils/pathHelper');
const { error, info, success } = require('../views/console');

async function historyCommand(pathStr) {
  if (!pathStr) {
    const { body: entries } = await api.get('/api/history?limit=50');
    HistoryView.renderGlobal(entries);
    return;
  }

  const { collection, request } = parsePath(pathStr);

  if (!collection || !request) {
    error('Usage: mm history              (global)');
    error('       mm history <col>/<req>  (per-request)');
    process.exit(1);
  }

  const { body: entries } = await api.get(
    `/api/history/${encodeURIComponent(collection)}/${encodeURIComponent(request)}`
  );
  HistoryView.renderForRequest(collection, request, entries);
}

async function clearHistory() {
  const { body: entries } = await api.get('/api/history?limit=999');
  if (!entries.length) { info('History is already empty.'); return; }

  const { confirm } = await inquirer.prompt([{
    type: 'confirm', name: 'confirm',
    message: `Clear all ${entries.length} global history entries?`,
    default: false,
  }]);
  if (!confirm) { info('Aborted.'); return; }

  await api.del('/api/history');
  success('Global history cleared.');
}

module.exports = { historyCommand, clearHistory };
