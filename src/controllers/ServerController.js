'use strict';

/**
 * src/controllers/ServerController.js
 *
 * mm start — Spawn the dashboard server as a detached background process.
 * mm stop  — Send SIGTERM to the running server.
 */

const { spawn } = require('child_process');
const path      = require('path');
const fs        = require('fs-extra');
const open      = require('open');
const chalk     = require('chalk');
const { DATA_DIR } = require('../models/db');
const { info, success, error, warn } = require('../views/console');

const SERVER_SCRIPT = path.join(__dirname, '../server/index.js');
const PID_FILE      = path.join(DATA_DIR, '.mm-server.pid');

// ---------------------------------------------------------------------------
// mm start
// ---------------------------------------------------------------------------

async function startServer() {
  // ── Already running? ──────────────────────────────────────────
  if (await fs.pathExists(PID_FILE)) {
    let pidData;
    try { pidData = await fs.readJson(PID_FILE); } catch { /* stale */ }

    if (pidData) {
      try {
        process.kill(pidData.pid, 0); // throws if process is gone
        info(`mail-man is already running  →  ${chalk.cyan.underline(`http://127.0.0.1:${pidData.port}`)}`);
        info(`PID ${pidData.pid}  |  use ${chalk.bold('mm stop')} to shut it down`);
        try {
          await open(`http://127.0.0.1:${pidData.port}`, { app: { name: open.apps.chrome } });
        } catch { await open(`http://127.0.0.1:${pidData.port}`).catch(() => {}); }
        return;
      } catch {
        // Process gone — clean up stale file
        await fs.remove(PID_FILE);
      }
    }
  }

  // ── Spawn server ──────────────────────────────────────────────
  const child = spawn(process.execPath, [SERVER_SCRIPT], {
    detached: true,
    stdio:    'ignore',
    env:      { ...process.env },
  });
  child.unref();

  // ── Wait for PID file (server writes it once listening) ───────
  const POLL_MS    = 150;
  const TIMEOUT_MS = 8000;
  let elapsed = 0;
  let pidData = null;

  process.stdout.write(chalk.cyan('  Starting'));
  while (elapsed < TIMEOUT_MS) {
    await new Promise(r => setTimeout(r, POLL_MS));
    elapsed += POLL_MS;
    process.stdout.write(chalk.cyan('.'));
    if (await fs.pathExists(PID_FILE)) {
      try { pidData = await fs.readJson(PID_FILE); break; } catch { /* not fully written yet */ }
    }
  }
  process.stdout.write('\n');

  if (!pidData) {
    error('Server did not start within 8 seconds. Set DEBUG=1 and try again.');
    process.exit(1);
  }

  const url = `http://127.0.0.1:${pidData.port}`;
  success(`mail-man dashboard running  →  ${chalk.cyan.underline(url)}`);
  info(`PID ${pidData.pid}  |  use ${chalk.bold('mm stop')} to shut it down`);

  // ── Open in Chrome ────────────────────────────────────────────
  try {
    await open(url, { app: { name: open.apps.chrome } });
  } catch {
    warn('Could not open Chrome. Trying default browser…');
    try { await open(url); } catch { warn(`Visit manually: ${url}`); }
  }
}

// ---------------------------------------------------------------------------
// mm stop
// ---------------------------------------------------------------------------

async function stopServer() {
  if (!(await fs.pathExists(PID_FILE))) {
    info('mail-man server is not running.');
    return;
  }

  let pidData;
  try {
    pidData = await fs.readJson(PID_FILE);
  } catch {
    await fs.remove(PID_FILE);
    info('Cleaned up a corrupted PID file. Server was not running.');
    return;
  }

  try {
    process.kill(pidData.pid, 'SIGTERM');
    await fs.remove(PID_FILE);
    success(`mail-man stopped  (PID ${pidData.pid})`);
  } catch (e) {
    if (e.code === 'ESRCH') {
      await fs.remove(PID_FILE);
      info('Server was not running. Cleaned up stale PID file.');
    } else {
      error(`Failed to stop server: ${e.message}`);
      process.exit(1);
    }
  }
}

module.exports = { startServer, stopServer };
