'use strict';

/**
 * src/views/ResponseView.js
 *
 * Coloured response output for `mm hit`.
 * Pure presentation — no I/O, no business logic.
 */

const chalk = require('chalk');

// ---------------------------------------------------------------------------
// Method colour helper (also used by HitController for the "Sending" line)
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
  const m  = (method || 'GET').toUpperCase();
  const fn = METHOD_COLORS[m] || chalk.white;
  return fn.bold(m.padEnd(7));
}

// ---------------------------------------------------------------------------
// Status colour helper
// ---------------------------------------------------------------------------

function statusColor(status) {
  if (status >= 200 && status < 300) return chalk.green.bold(String(status));
  if (status >= 300 && status < 400) return chalk.cyan.bold(String(status));
  if (status >= 400 && status < 500) return chalk.yellow.bold(String(status));
  if (status >= 500)                 return chalk.red.bold(String(status));
  return chalk.white.bold(String(status));
}

// ---------------------------------------------------------------------------
// render(response, duration)
// ---------------------------------------------------------------------------

/**
 * Print a colour-coded HTTP response to the console.
 * @param {object} res       Axios response object (has .status, .statusText, .headers, .data)
 * @param {number} duration  Request duration in milliseconds
 */
function render(res, duration) {
  console.log('');
  const statusText = res.statusText || '';
  console.log(
    chalk.bold('Status  : ') + statusColor(res.status) +
    chalk.gray(` ${statusText}`) +
    chalk.gray(`  (${duration}ms)`)
  );

  // Print response headers (collapsed — key ones only)
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
    const highlighted = pretty
      .split('\n')
      .map(line => {
        line = line.replace(/"([^"]+)"(\s*:)/g, (_, k, colon) => chalk.cyan(`"${k}"`) + colon);
        line = line.replace(/: ("(?:[^"\\]|\\.)*")/g, (_, v) => ': ' + chalk.green(v));
        line = line.replace(/: (-?\d+\.?\d*)/g, (_, v) => ': ' + chalk.yellow(v));
        line = line.replace(/: (true|false|null)/g, (_, v) => ': ' + chalk.magenta(v));
        return '  ' + line;
      })
      .join('\n');
    console.log(highlighted);
  }
  console.log('');
}

module.exports = { render, colorMethod };
