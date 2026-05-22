'use strict';

/**
 * mm ls
 *
 * Prints every collection and its requests as a coloured tree:
 *
 *   my-api  (3 requests)
 *   ├── GET    get-users          Get all users
 *   ├── POST   create-user
 *   └── DELETE delete-user       Remove a user
 *
 *   payments  (2 requests)
 *   ├── POST   charge             Charge a card
 *   └── POST   refund
 *
 *   2 collections · 5 requests
 */

const chalk = require('chalk');
const store = require('../utils/store');
const { info } = require('../utils/output');

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
  const fn  = METHOD_COLORS[(m || '').toUpperCase()] || chalk.white;
  return fn((m || '').padEnd(METHOD_PAD));
}

async function lsAll() {
  const cols = await store.getCollections();

  if (cols.length === 0) {
    info('No collections yet. Create one with: mm add <collection>/<request>');
    return;
  }

  let totalRequests = 0;
  console.log('');

  for (const col of cols) {
    const reqs = await store.getRequests(col);
    totalRequests += reqs.length;

    const countLabel = reqs.length === 1 ? '1 request' : `${reqs.length} requests`;
    console.log(
      '  ' + chalk.bold.blue(col) + '  ' + chalk.gray(`(${countLabel})`)
    );

    if (reqs.length === 0) {
      console.log('  ' + chalk.gray('└── (empty)'));
      console.log('');
      continue;
    }

    for (let i = 0; i < reqs.length; i++) {
      const isLast  = i === reqs.length - 1;
      const branch  = isLast ? '└──' : '├──';
      const req     = await store.getRequest(col, reqs[i]);
      const method  = colorMethod(req ? req.method : '?');
      const name    = chalk.white(reqs[i]);
      const desc    = req && req.description ? chalk.gray('  ' + req.description) : '';

      console.log('  ' + chalk.gray(branch) + ' ' + method + ' ' + name + desc);
    }
    console.log('');
  }

  const colLabel = cols.length === 1 ? '1 collection' : `${cols.length} collections`;
  const reqLabel = totalRequests === 1 ? '1 request' : `${totalRequests} requests`;
  console.log('  ' + chalk.dim(`${colLabel} · ${reqLabel}`) + '\n');
}

module.exports = { lsAll };
