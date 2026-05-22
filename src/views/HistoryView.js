'use strict';

/**
 * src/views/HistoryView.js
 *
 * History table + per-request detail renderer.
 * Pure presentation — no I/O, no business logic.
 */

const chalk = require('chalk');

// ---------------------------------------------------------------------------
// Colour helpers
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// renderGlobal(entries)  — summary table (last 50)
// ---------------------------------------------------------------------------

/**
 * Render the global history summary table.
 * @param {object[]} entries  History entries (newest first).
 */
function renderGlobal(entries) {
  if (!entries || !entries.length) {
    console.log(chalk.cyan('ℹ ') + 'No history yet. Hit a request with: mm hit <collection>/<request>');
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

// ---------------------------------------------------------------------------
// renderForRequest(collection, request, entries)  — detailed per-request view
// ---------------------------------------------------------------------------

/**
 * Render per-request history in detail.
 * @param {string}   collection
 * @param {string}   request
 * @param {object[]} entries  History entries (newest first, up to 50).
 */
function renderForRequest(collection, request, entries) {
  if (!entries || !entries.length) {
    console.log(chalk.cyan('ℹ ') + `No history for ${chalk.bold(collection + '/' + request)} yet.`);
    console.log(chalk.cyan('ℹ ') + `  Hit it first: mm hit ${collection}/${request}`);
    return;
  }

  console.log(
    '\n  ' + chalk.bold.blue(`History: ${collection}/${request}`) +
    chalk.gray(`  (${entries.length} of 50 stored)\n`)
  );

  entries.forEach((e, i) => {
    const num  = chalk.dim(`#${String(i + 1).padStart(2, '0')}`);
    const badge = statusColor(e.status);
    const dur  = chalk.gray(`${e.duration}ms`);
    const time = chalk.gray(ts(e.timestamp));

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

module.exports = { renderGlobal, renderForRequest };
