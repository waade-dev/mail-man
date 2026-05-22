'use strict';

/**
 * mm history [collection/request]
 *
 * No arg  →  global last-50 across all requests (summary table)
 * With path  →  full per-request history (50 entries, req + response detail)
 */

const chalk    = require('chalk');
const inquirer = require('inquirer');
const store    = require('../utils/store');
const { parsePath } = require('../utils/pathHelper');
const { error, info, success } = require('../utils/output');

// ─────────────────────────────────────────────────────────────
//  Colour helpers
// ─────────────────────────────────────────────────────────────

const METHOD_COLORS = {
  GET: chalk.green, POST: chalk.yellow, PUT: chalk.blue,
  DELETE: chalk.red, PATCH: chalk.magenta, HEAD: chalk.cyan, OPTIONS: chalk.gray,
};
function colorMethod(m) {
  const fn = METHOD_COLORS[(m || '').toUpperCase()] || chalk.white;
  return fn((m || '').padEnd(7));
}
function statusColor(s) {
  if (s >= 200 && s < 300) return chalk.green(String(s));
  if (s >= 300 && s < 400) return chalk.cyan(String(s));
  if (s >= 400 && s < 500) return chalk.yellow(String(s));
  if (s >= 500)             return chalk.red(String(s));
  return chalk.white(String(s));
}
function ts(iso) {
  return new Date(iso).toLocaleString(undefined, {
    month: '2-digit', day: '2-digit', year: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

// ─────────────────────────────────────────────────────────────
//  Global history  (summary table, last 50)
// ─────────────────────────────────────────────────────────────

async function showGlobalHistory() {
  const entries = await store.getHistory(50);
  if (!entries.length) {
    info('No history yet. Hit a request with: mm hit <collection>/<request>');
    return;
  }

  console.log('\n  ' + chalk.bold.blue('Request History') + chalk.gray('  (last 50)\n'));
  console.log(
    '  ' +
    chalk.bold('Time'.padEnd(21)) +
    chalk.bold('Method'.padEnd(9)) +
    chalk.bold('Status'.padEnd(8)) +
    chalk.bold('ms'.padEnd(8)) +
    chalk.bold('Path'.padEnd(32)) +
    chalk.bold('URL')
  );
  console.log('  ' + chalk.gray('─'.repeat(110)));

  for (const e of entries) {
    const colReq = `${e.collection}/${e.request}`;
    console.log(
      '  ' +
      chalk.gray(ts(e.timestamp).padEnd(21)) +
      colorMethod(e.method) + '  ' +
      statusColor(e.status).padEnd(8) +
      chalk.gray(`${e.duration}ms`.padEnd(8)) +
      chalk.cyan(colReq.slice(0, 30).padEnd(32)) +
      chalk.white((e.url || '').slice(0, 50))
    );
  }
  console.log('');
}

// ─────────────────────────────────────────────────────────────
//  Per-request history  (detailed, last 50 for that request)
// ─────────────────────────────────────────────────────────────

async function showRequestHistory(collection, request) {
  const entries = await store.getRequestHistory(collection, request);

  if (!entries.length) {
    info(`No history for ${chalk.bold(collection + '/' + request)} yet.`);
    info(`  Hit it first: mm hit ${collection}/${request}`);
    return;
  }

  console.log(
    '\n  ' + chalk.bold.blue(`History: ${collection}/${request}`) +
    chalk.gray(`  (${entries.length} of 50 stored)\n`)
  );

  entries.forEach((e, i) => {
    const num    = chalk.dim(`#${String(i + 1).padStart(2, '0')}`);
    const badge  = statusColor(e.status);
    const dur    = chalk.gray(`${e.duration}ms`);
    const time   = chalk.gray(ts(e.timestamp));

    console.log(`  ${num}  ${time}  ${colorMethod(e.method)}  ${badge}  ${dur}`);
    console.log(`       ${chalk.white(e.url)}`);

    // Request headers (if any, compact)
    if (e.requestHeaders && Object.keys(e.requestHeaders).length) {
      const hdrs = Object.entries(e.requestHeaders)
        .map(([k, v]) => `${chalk.cyan(k)}: ${chalk.gray(String(v).slice(0, 60))}`)
        .join('  ·  ');
      console.log(`       ${chalk.dim('req headers:')} ${hdrs}`);
    }

    // Response preview (first 200 chars)
    if (e.body !== undefined && e.body !== null) {
      const preview = typeof e.body === 'object'
        ? JSON.stringify(e.body).slice(0, 200)
        : String(e.body).slice(0, 200);
      console.log(`       ${chalk.dim('response:')}    ${chalk.yellow(preview)}${preview.length === 200 ? chalk.gray('…') : ''}`);
    }
    console.log('');
  });
}

// ─────────────────────────────────────────────────────────────
//  mm history [path]  entry point
// ─────────────────────────────────────────────────────────────

async function historyCommand(pathStr) {
  if (!pathStr) {
    return showGlobalHistory();
  }

  const { collection, request } = parsePath(pathStr);

  if (!collection || !request) {
    error('Usage: mm history              (global)');
    error('       mm history <col>/<req>  (per-request)');
    process.exit(1);
  }

  await showRequestHistory(collection, request);
}

// ─────────────────────────────────────────────────────────────
//  mm history clear
// ─────────────────────────────────────────────────────────────

async function clearHistory() {
  const entries = await store.getHistory(999);
  if (!entries.length) { info('History is already empty.'); return; }

  const { confirm } = await inquirer.prompt([{
    type: 'confirm', name: 'confirm',
    message: `Clear all ${entries.length} global history entries?`,
    default: false,
  }]);
  if (!confirm) { info('Aborted.'); return; }

  await store.clearHistory();
  success('Global history cleared.');
}

module.exports = { historyCommand, clearHistory };
