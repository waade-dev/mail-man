'use strict';

/**
 * src/controllers/HitController.js
 *
 * mm hit <collection/request> — Execute a saved HTTP request.
 * Request execution happens server-side; the CLI renders the result.
 */

const chalk        = require('chalk');
const api          = require('../utils/apiClient');
const ResponseView = require('../views/ResponseView');
const { error, warn } = require('../views/console');
const { parsePath }   = require('../utils/pathHelper');

// ─────────────────────────────────────────────────────────────
//  Spinner
// ─────────────────────────────────────────────────────────────

function createSpinner(msg) {
  const frames = ['⠋','⠙','⠹','⠸','⠼','⠴','⠦','⠧','⠇','⠏'];
  let i = 0;
  const id = setInterval(() => {
    process.stderr.write(`\r${chalk.cyan(frames[i++ % frames.length])} ${msg}`);
  }, 80);
  return { stop: () => { clearInterval(id); process.stderr.write('\r\x1b[K'); } };
}

// ─────────────────────────────────────────────────────────────
//  mm hit <collection/request>
// ─────────────────────────────────────────────────────────────

async function hit(pathStr) {
  const { collection, request } = parsePath(pathStr);

  if (!collection || !request) {
    error('Usage: mm hit <collection>/<request>');
    error('  e.g. mm hit my-api/get-users');
    process.exit(1);
  }

  // ── Fetch request definition for the "Sending" line ─────
  const defRes = await api.get(
    `/api/collections/${encodeURIComponent(collection)}/${encodeURIComponent(request)}`
  );

  if (defRes.status === 404) {
    error(`Request not found: ${chalk.bold(collection + '/' + request)}`);
    error(`  Add it first with: mm add ${collection}/${request}`);
    process.exit(1);
  }

  const reqDef = defRes.body && defRes.body.request;
  if (!reqDef) {
    error('Unexpected response from server — request definition missing.');
    process.exit(1);
  }

  // ── Fetch active env for display ─────────────────────────
  const stateRes  = await api.get('/api/state');
  const activeEnv = stateRes.body && stateRes.body.activeEnv;

  console.log('');
  console.log(
    chalk.bold('  Sending  ') +
    ResponseView.colorMethod(reqDef.method) + '  ' +
    chalk.white(reqDef.url)
  );
  if (activeEnv) console.log(chalk.gray(`  env: ${activeEnv}`));
  console.log('');

  // ── Fire via server ───────────────────────────────────────
  const spinner = createSpinner('Waiting for response…');
  const runRes  = await api.post(
    `/api/run/${encodeURIComponent(collection)}/${encodeURIComponent(request)}`
  );
  spinner.stop();

  if (runRes.status !== 200) {
    error(`Request failed: ${runRes.body.error || 'unknown error'}`);
    process.exit(1);
  }

  const snap = runRes.body;

  // Warn about unresolved variables in the URL
  const unresolved = (snap.url || '').match(/\{\{[^}]+\}\}/g);
  if (unresolved) warn(`Unresolved variables in URL: ${unresolved.join(', ')}`);

  // ── Render using ResponseView (expects axios-like object) ─
  ResponseView.render(
    { status: snap.status, statusText: snap.statusText, headers: snap.headers, data: snap.body },
    snap.duration
  );
}

module.exports = { hit };
