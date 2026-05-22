'use strict';

/**
 * src/views/TreeView.js
 *
 * Tree renderer for `mm ls`.
 * Pure presentation — no I/O, no business logic.
 */

const chalk = require('chalk');
const { info } = require('./console');

const METHOD_PAD = 7;

const METHOD_COLORS = {
  GET:     chalk.green,
  POST:    chalk.yellow,
  PUT:     chalk.blue,
  PATCH:   chalk.magenta,
  DELETE:  chalk.red,
  HEAD:    chalk.cyan,
  OPTIONS: chalk.gray,
};

function colorMethod(m) {
  const fn = METHOD_COLORS[(m || '').toUpperCase()] || chalk.white;
  return fn((m || '').padEnd(METHOD_PAD));
}

/**
 * Render collections as a coloured tree.
 *
 * @param {Array<{name: string, requests: Array<{name: string, method: string, description: string}>}>} collections
 */
function render(collections) {
  if (!collections || collections.length === 0) {
    info('No collections yet. Create one with: mm add <collection>/<request>');
    return;
  }

  let totalRequests = 0;
  console.log('');

  for (const col of collections) {
    const reqs = col.requests || [];
    totalRequests += reqs.length;

    const countLabel = reqs.length === 1 ? '1 request' : `${reqs.length} requests`;
    console.log(
      '  ' + chalk.bold.blue(col.name) + '  ' + chalk.gray(`(${countLabel})`)
    );

    if (reqs.length === 0) {
      console.log('  ' + chalk.gray('└── (empty)'));
      console.log('');
      continue;
    }

    for (let i = 0; i < reqs.length; i++) {
      const isLast = i === reqs.length - 1;
      const branch = isLast ? '└──' : '├──';
      const req    = reqs[i];
      const method = colorMethod(req.method || '?');
      const name   = chalk.white(req.name);
      const desc   = req.description ? chalk.gray('  ' + req.description) : '';

      console.log('  ' + chalk.gray(branch) + ' ' + method + ' ' + name + desc);
    }
    console.log('');
  }

  const colLabel = collections.length === 1 ? '1 collection' : `${collections.length} collections`;
  const reqLabel = totalRequests === 1 ? '1 request' : `${totalRequests} requests`;
  console.log('  ' + chalk.dim(`${colLabel} · ${reqLabel}`) + '\n');
}

module.exports = { render };
