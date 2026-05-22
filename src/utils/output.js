'use strict';

const chalk = require('chalk');

// ---------------------------------------------------------------------------
// Simple log helpers
// ---------------------------------------------------------------------------

const success = (msg) => console.log(chalk.green('✓ ') + msg);
const error   = (msg) => console.log(chalk.red('✗ ') + msg);
const info    = (msg) => console.log(chalk.cyan('ℹ ') + msg);
const warn    = (msg) => console.log(chalk.yellow('⚠ ') + msg);
const header  = (msg) => console.log(chalk.bold.blue(msg));

// ---------------------------------------------------------------------------
// Method color map
// ---------------------------------------------------------------------------

const METHOD_COLORS = {
  GET:     chalk.green,
  POST:    chalk.yellow,
  PUT:     chalk.blue,
  DELETE:  chalk.red,
  PATCH:   chalk.magenta,
  HEAD:    chalk.cyan,
  OPTIONS: chalk.white,
};

function colorMethod(method) {
  const m = (method || 'GET').toUpperCase();
  const fn = METHOD_COLORS[m] || chalk.white;
  return fn.bold(m.padEnd(7));
}

// ---------------------------------------------------------------------------
// Request pretty-printer
// ---------------------------------------------------------------------------

function printRequest(req) {
  console.log('');
  header(`  ${req.name}`);
  if (req.description) console.log(chalk.gray(`  ${req.description}`));
  console.log('');

  console.log(`  ${chalk.bold('Method :')} ${colorMethod(req.method)}`);
  console.log(`  ${chalk.bold('URL    :')} ${chalk.white(req.url)}`);

  if (req.headers && Object.keys(req.headers).length > 0) {
    console.log(`  ${chalk.bold('Headers:')}`);
    for (const [k, v] of Object.entries(req.headers)) {
      console.log(`    ${chalk.cyan(k)}: ${v}`);
    }
  }

  if (req.body) {
    console.log(`  ${chalk.bold('Body   :')}`);
    const bodyStr = typeof req.body === 'object'
      ? JSON.stringify(req.body, null, 2)
      : req.body;
    console.log(chalk.gray(bodyStr.split('\n').map(l => '    ' + l).join('\n')));
  }

  if (req.auth && req.auth.type && req.auth.type !== 'none') {
    console.log(`  ${chalk.bold('Auth   :')} ${chalk.cyan(req.auth.type)}`);
    if (req.auth.type === 'bearer') {
      const tok = req.auth.token || '';
      const masked = tok.length > 8 ? tok.slice(0, 4) + '****' + tok.slice(-4) : '****';
      console.log(`    Token: ${chalk.yellow(masked)}`);
    } else if (req.auth.type === 'basic') {
      console.log(`    User : ${chalk.yellow(req.auth.username || '')}`);
    } else if (req.auth.type === 'apikey') {
      console.log(`    Header: ${chalk.yellow(req.auth.header || '')}`);
    }
  }

  console.log(`  ${chalk.bold('Created:')} ${chalk.gray(req.createdAt || 'unknown')}`);
  console.log('');
}

// ---------------------------------------------------------------------------
// Response pretty-printer
// ---------------------------------------------------------------------------

function statusColor(status) {
  if (status >= 200 && status < 300) return chalk.green.bold(String(status));
  if (status >= 300 && status < 400) return chalk.cyan.bold(String(status));
  if (status >= 400 && status < 500) return chalk.yellow.bold(String(status));
  if (status >= 500)                 return chalk.red.bold(String(status));
  return chalk.white.bold(String(status));
}

function printResponse(res, duration) {
  console.log('');
  const statusText = res.statusText || '';
  console.log(
    chalk.bold('Status  : ') + statusColor(res.status) +
    chalk.gray(` ${statusText}`) +
    chalk.gray(`  (${duration}ms)`)
  );

  // Print response headers (collapsed – show a few key ones)
  if (res.headers) {
    console.log(chalk.bold('Headers :'));
    const important = ['content-type', 'content-length', 'x-request-id', 'x-ratelimit-remaining'];
    for (const [k, v] of Object.entries(res.headers)) {
      if (important.includes(k.toLowerCase()) || k.startsWith('x-')) {
        console.log(`  ${chalk.cyan(k)}: ${v}`);
      }
    }
  }

  // Body
  console.log(chalk.bold('Body    :'));
  const body = res.data;
  if (body === null || body === undefined) {
    console.log(chalk.gray('  (empty)'));
  } else {
    let pretty;
    try {
      pretty = JSON.stringify(typeof body === 'string' ? JSON.parse(body) : body, null, 2);
    } catch {
      pretty = String(body);
    }
    // Syntax highlight for terminal using chalk
    const highlighted = pretty
      .split('\n')
      .map(line => {
        // Keys
        line = line.replace(/"([^"]+)"(\s*:)/g, (_, k, colon) => chalk.cyan(`"${k}"`) + colon);
        // String values
        line = line.replace(/: ("(?:[^"\\]|\\.)*")/g, (_, v) => ': ' + chalk.green(v));
        // Numbers
        line = line.replace(/: (-?\d+\.?\d*)/g, (_, v) => ': ' + chalk.yellow(v));
        // Booleans / null
        line = line.replace(/: (true|false|null)/g, (_, v) => ': ' + chalk.magenta(v));
        return '  ' + line;
      })
      .join('\n');
    console.log(highlighted);
  }
  console.log('');
}

module.exports = {
  success,
  error,
  info,
  warn,
  header,
  colorMethod,
  printRequest,
  printResponse,
};
