'use strict';

/**
 * src/controllers/ServerController.js
 *
 * mm start  — start the dashboard server (fixed port 2525)
 * mm stop   — stop  the dashboard server
 * mm status — show whether it is running
 *
 * The server binds to a FIXED port (default 2525, override with MM_PORT).
 * All CLI commands are thin HTTP clients to this server — one PID, one port.
 * On macOS with install.sh, delegates to launchctl; falls back to direct spawn.
 */

const { spawn, execSync } = require('child_process');
const http   = require('http');
const path   = require('path');
const os     = require('os');
const fs     = require('fs-extra');
const open   = require('open');
const chalk  = require('chalk');
const { DATA_DIR } = require('../models/db');
const { info, success, error, warn } = require('../views/console');

const SERVER_SCRIPT = path.join(__dirname, '../server/index.js');
const PID_FILE      = path.join(DATA_DIR, '.mm-server.pid');
const LOG_DIR       = path.join(DATA_DIR, 'logs');
const PORT          = parseInt(process.env.MM_PORT || '2525', 10);
const BASE_URL      = `http://127.0.0.1:${PORT}`;

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
//  Health ping — detect if server is up on the fixed port
// ─────────────────────────────────────────────────────────────

function pingServer(timeoutMs = 500) {
  return new Promise((resolve) => {
    const req = http.get(`${BASE_URL}/api/health`, { timeout: timeoutMs }, res => {
      let data = '';
      res.on('data', c => { data += c; });
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { resolve(null); }
      });
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
  });
}

async function isRunning() {
  const r = await pingServer();
  return r && r.ok === true;
}

// ─────────────────────────────────────────────────────────────
//  Poll until server responds on the fixed port
// ─────────────────────────────────────────────────────────────

async function waitForServer(timeoutMs = 8000) {
  const POLL = 150;
  let elapsed = 0;
  process.stdout.write(chalk.cyan('  Starting'));
  while (elapsed < timeoutMs) {
    await new Promise(r => setTimeout(r, POLL));
    elapsed += POLL;
    process.stdout.write(chalk.cyan('.'));
    const r = await pingServer(400);
    if (r && r.ok) {
      process.stdout.write('\n');
      return r;
    }
  }
  process.stdout.write('\n');
  return null;
}

// ─────────────────────────────────────────────────────────────
//  Open Chrome (or default browser) to the dashboard
// ─────────────────────────────────────────────────────────────

async function openBrowser(targetUrl) {
  try {
    await open(targetUrl, { app: { name: open.apps.chrome } });
  } catch {
    warn('Could not open Chrome. Trying default browser…');
    try { await open(targetUrl); } catch { warn(`Visit manually: ${targetUrl}`); }
  }
}

// ─────────────────────────────────────────────────────────────
//  mm start
// ─────────────────────────────────────────────────────────────

async function startServer() {
  // ── Already running? (health ping is the source of truth) ───
  if (await isRunning()) {
    info(`mail-man is already running  →  ${chalk.cyan.underline(BASE_URL)}`);
    info(`Use ${chalk.bold('mm stop')} to shut it down`);
    await openBrowser(BASE_URL);
    return;
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

    const serverInfo = await waitForServer();
    if (!serverInfo) {
      error('Server did not respond within 8 seconds.');
      error(`Check logs: ${path.join(LOG_DIR, 'server.log')}`);
      process.exit(1);
    }

    success(`mail-man started  →  ${chalk.cyan.underline(BASE_URL)}`);
    info(`PID ${serverInfo.pid}  |  port ${PORT}  |  service: ${chalk.bold(LABEL)}`);
    info(`Logs  →  ${chalk.dim(LOG_DIR + '/')}`);
    await openBrowser(BASE_URL);
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

  const serverInfo = await waitForServer();
  if (!serverInfo) {
    error('Server did not respond within 8 seconds. Set DEBUG=1 and try again.');
    process.exit(1);
  }

  success(`mail-man dashboard running  →  ${chalk.cyan.underline(BASE_URL)}`);
  info(`PID ${serverInfo.pid}  |  port ${PORT}  |  use ${chalk.bold('mm stop')} to shut it down`);
  await openBrowser(BASE_URL);
}

// ─────────────────────────────────────────────────────────────
//  Kill a PID cleanly: SIGTERM → wait up to 4s → SIGKILL
// ─────────────────────────────────────────────────────────────

async function killPid(pid) {
  try { process.kill(pid, 0); } catch { return 'gone'; }

  try { process.kill(pid, 'SIGTERM'); } catch (e) {
    if (e.code === 'ESRCH') return 'gone';
    throw e;
  }

  for (let i = 0; i < 20; i++) {
    await new Promise(r => setTimeout(r, 200));
    try { process.kill(pid, 0); } catch { return 'killed'; }
  }

  warn(`Process ${pid} ignored SIGTERM — sending SIGKILL…`);
  try { process.kill(pid, 'SIGKILL'); } catch (e) {
    if (e.code === 'ESRCH') return 'killed';
    throw e;
  }
  await new Promise(r => setTimeout(r, 500));
  try { process.kill(pid, 0); } catch { return 'killed'; }
  return 'unkillable';
}

// ─────────────────────────────────────────────────────────────
//  mm stop
// ─────────────────────────────────────────────────────────────

async function stopServer() {
  // ── macOS launchctl path ─────────────────────────────────
  if (await isServiceInstalled()) {
    const result = launchctl('stop', LABEL);
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

  process.stdout.write(chalk.cyan(`  Stopping PID ${pidData.pid}…`));

  const outcome = await killPid(pidData.pid);
  process.stdout.write('\n');

  switch (outcome) {
    case 'gone':
      await fs.remove(PID_FILE);
      info('Process was already gone. Cleaned up stale PID file.');
      break;
    case 'killed':
      await fs.remove(PID_FILE);
      success(`mail-man stopped  (PID ${pidData.pid})`);
      break;
    case 'unkillable':
      error(`Could not kill PID ${pidData.pid}. Try: kill -9 ${pidData.pid}`);
      process.exit(1);
  }
}

// ─────────────────────────────────────────────────────────────
//  mm status
// ─────────────────────────────────────────────────────────────

async function statusServer() {
  const running = await isRunning();

  if (!running) {
    info(`mail-man  ${chalk.red('●')}  not running  (port ${PORT})`);
    if (await isServiceInstalled()) {
      info(`LaunchAgent: ${LABEL}  (installed, not started)`);
    }
    return;
  }

  // Read PID from file if available
  let pid = '?';
  try {
    const pidData = await fs.readJson(PID_FILE);
    pid = pidData.pid;
  } catch { /* PID file may not exist yet */ }

  console.log('');
  success(`mail-man  ${chalk.green('●')}  running`);
  console.log(`  ${chalk.dim('PID  ')}  ${chalk.white(pid)}`);
  console.log(`  ${chalk.dim('URL  ')}  ${chalk.cyan.underline(BASE_URL)}`);
  console.log(`  ${chalk.dim('PORT ')}  ${chalk.white(PORT)}`);

  if (await isServiceInstalled()) {
    console.log(`  ${chalk.dim('SVC  ')}  ${chalk.white(LABEL)}`);
    console.log(`  ${chalk.dim('LOGS ')}  ${chalk.dim(LOG_DIR + '/')}`);
  }
  console.log('');
}

module.exports = { startServer, stopServer, statusServer };
