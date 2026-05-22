'use strict';

/**
 * src/controllers/ServerController.js
 *
 * mm start  — start the dashboard server
 * mm stop   — stop  the dashboard server
 * mm status — show whether it is running
 *
 * On macOS, if the LaunchAgent plist has been installed by install.sh,
 * all three commands delegate to launchctl (like Tomcat via systemd/launchd).
 * Otherwise they fall back to a plain detached-child-process approach.
 */

const { spawn, execSync } = require('child_process');
const path  = require('path');
const os    = require('os');
const fs    = require('fs-extra');
const open  = require('open');
const chalk = require('chalk');
const { DATA_DIR } = require('../models/db');
const { info, success, error, warn } = require('../views/console');

const SERVER_SCRIPT = path.join(__dirname, '../server/index.js');
const PID_FILE      = path.join(DATA_DIR, '.mm-server.pid');
const LOG_DIR       = path.join(DATA_DIR, 'logs');

// ── launchd (macOS) ──────────────────────────────────────────
const LABEL      = 'com.mailman.server';
const PLIST_PATH = path.join(os.homedir(), 'Library', 'LaunchAgents', `${LABEL}.plist`);

async function isServiceInstalled() {
  return process.platform === 'darwin' && fs.pathExists(PLIST_PATH);
}

function launchctl(...args) {
  try {
    execSync(['launchctl', ...args].join(' '), { stdio: 'pipe' });
    return { ok: true };
  } catch (e) {
    return { ok: false, message: e.stderr ? e.stderr.toString().trim() : e.message };
  }
}

// ─────────────────────────────────────────────────────────────
//  Shared: poll until PID file appears  (works for both paths)
// ─────────────────────────────────────────────────────────────

async function waitForPid(timeoutMs = 8000) {
  const POLL = 150;
  let elapsed = 0;
  process.stdout.write(chalk.cyan('  Starting'));
  while (elapsed < timeoutMs) {
    await new Promise(r => setTimeout(r, POLL));
    elapsed += POLL;
    process.stdout.write(chalk.cyan('.'));
    if (await fs.pathExists(PID_FILE)) {
      try {
        const data = await fs.readJson(PID_FILE);
        if (data && data.pid && data.port) {
          process.stdout.write('\n');
          return data;
        }
      } catch { /* still writing */ }
    }
  }
  process.stdout.write('\n');
  return null;
}

// ─────────────────────────────────────────────────────────────
//  Shared: open Chrome (or default browser) to the dashboard
// ─────────────────────────────────────────────────────────────

async function openBrowser(url) {
  try {
    await open(url, { app: { name: open.apps.chrome } });
  } catch {
    warn('Could not open Chrome. Trying default browser…');
    try { await open(url); } catch { warn(`Visit manually: ${url}`); }
  }
}

// ─────────────────────────────────────────────────────────────
//  mm start
// ─────────────────────────────────────────────────────────────

async function startServer() {
  // ── Already running? ────────────────────────────────────
  if (await fs.pathExists(PID_FILE)) {
    let pidData;
    try { pidData = await fs.readJson(PID_FILE); } catch { /* stale */ }
    if (pidData) {
      try {
        process.kill(pidData.pid, 0);           // 0 = existence check
        const url = `http://127.0.0.1:${pidData.port}`;
        info(`mail-man is already running  →  ${chalk.cyan.underline(url)}`);
        info(`PID ${pidData.pid}  |  use ${chalk.bold('mm stop')} to shut it down`);
        await openBrowser(url);
        return;
      } catch {
        await fs.remove(PID_FILE);              // stale — clean up
      }
    }
  }

  await fs.ensureDir(LOG_DIR);

  // ── macOS launchctl path ─────────────────────────────────
  if (await isServiceInstalled()) {
    const result = launchctl('start', LABEL);
    if (!result.ok) {
      warn(`launchctl start failed: ${result.message}`);
      warn('Falling back to direct spawn…');
      await spawnDirect();
      return;
    }

    const pidData = await waitForPid();
    if (!pidData) {
      error('Server did not start within 8 seconds.');
      error(`Check logs: ${path.join(LOG_DIR, 'server.log')}`);
      process.exit(1);
    }

    const url = `http://127.0.0.1:${pidData.port}`;
    success(`mail-man started  →  ${chalk.cyan.underline(url)}`);
    info(`PID ${pidData.pid}  |  service: ${chalk.bold(LABEL)}`);
    info(`Logs  →  ${chalk.dim(LOG_DIR + '/')}`);
    await openBrowser(url);
    return;
  }

  // ── Fallback: direct detached spawn ─────────────────────
  await spawnDirect();
}

async function spawnDirect() {
  const child = spawn(process.execPath, [SERVER_SCRIPT], {
    detached: true,
    stdio:    'ignore',
    env:      { ...process.env },
  });
  child.unref();

  const pidData = await waitForPid();
  if (!pidData) {
    error('Server did not start within 8 seconds. Set DEBUG=1 and try again.');
    process.exit(1);
  }

  const url = `http://127.0.0.1:${pidData.port}`;
  success(`mail-man dashboard running  →  ${chalk.cyan.underline(url)}`);
  info(`PID ${pidData.pid}  |  use ${chalk.bold('mm stop')} to shut it down`);
  await openBrowser(url);
}

// ─────────────────────────────────────────────────────────────
//  mm stop
// ─────────────────────────────────────────────────────────────

async function stopServer() {
  // ── macOS launchctl path ─────────────────────────────────
  if (await isServiceInstalled()) {
    const result = launchctl('stop', LABEL);

    // launchctl stop returns non-zero if not running — treat gracefully
    if (!result.ok && !result.message.includes('No such process')) {
      warn(`launchctl stop: ${result.message}`);
    }

    if (await fs.pathExists(PID_FILE)) await fs.remove(PID_FILE);
    success(`mail-man stopped  (service: ${LABEL})`);
    return;
  }

  // ── Fallback: PID-file kill ──────────────────────────────
  if (!(await fs.pathExists(PID_FILE))) {
    info('mail-man server is not running.');
    return;
  }

  let pidData;
  try {
    pidData = await fs.readJson(PID_FILE);
  } catch {
    await fs.remove(PID_FILE);
    info('Cleaned up a corrupted PID file.');
    return;
  }

  try {
    process.kill(pidData.pid, 'SIGTERM');
    await fs.remove(PID_FILE);
    success(`mail-man stopped  (PID ${pidData.pid})`);
  } catch (e) {
    if (e.code === 'ESRCH') {
      await fs.remove(PID_FILE);
      info('Process was already gone. Cleaned up stale PID file.');
    } else {
      error(`Failed to stop: ${e.message}`);
      process.exit(1);
    }
  }
}

// ─────────────────────────────────────────────────────────────
//  mm status
// ─────────────────────────────────────────────────────────────

async function statusServer() {
  const pidExists = await fs.pathExists(PID_FILE);

  if (!pidExists) {
    info(`mail-man  ${chalk.red('●')}  not running`);
    if (await isServiceInstalled()) {
      info(`LaunchAgent: ${LABEL}  (installed, not started)`);
    }
    return;
  }

  let pidData;
  try { pidData = await fs.readJson(PID_FILE); } catch {
    warn('PID file is corrupted. Run mm start to restart.');
    return;
  }

  try {
    process.kill(pidData.pid, 0);             // check process alive
    const url = `http://127.0.0.1:${pidData.port}`;
    console.log('');
    success(`mail-man  ${chalk.green('●')}  running`);
    console.log(`  ${chalk.dim('PID  ')}  ${chalk.white(pidData.pid)}`);
    console.log(`  ${chalk.dim('URL  ')}  ${chalk.cyan.underline(url)}`);

    if (await isServiceInstalled()) {
      console.log(`  ${chalk.dim('SVC  ')}  ${chalk.white(LABEL)}`);
      console.log(`  ${chalk.dim('LOGS ')}  ${chalk.dim(LOG_DIR + '/')}`);
    }
    console.log('');
  } catch {
    warn(`PID ${pidData.pid} is no longer running (stale PID file).`);
    await fs.remove(PID_FILE);
    info('Cleaned up. Run mm start to restart.');
  }
}

module.exports = { startServer, stopServer, statusServer };
