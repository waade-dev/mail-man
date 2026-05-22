'use strict';

/**
 * mm start
 *
 * Spawns the mail-man dashboard server as a detached background process,
 * writes the PID + port to data/.mm-server.pid, then opens Chrome.
 */

const { spawn }  = require('child_process');
const path       = require('path');
const fs         = require('fs-extra');
const open       = require('open');
const chalk      = require('chalk');
const { info, success, error, warn } = require('../utils/output');

const SERVER_SCRIPT = path.join(__dirname, '../server/index.js');
const PID_FILE      = path.join(
  require('os').homedir(), 'Developer', 'mail-man', 'data', '.mm-server.pid'
);

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

module.exports = { startServer };
