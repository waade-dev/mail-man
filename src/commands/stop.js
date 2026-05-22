'use strict';

/**
 * mm stop
 *
 * Reads data/.mm-server.pid and sends SIGTERM to the dashboard server.
 */

const fs    = require('fs-extra');
const path  = require('path');
const { success, error, info } = require('../utils/output');

const PID_FILE = path.join(
  require('os').homedir(), 'Developer', 'mail-man', 'data', '.mm-server.pid'
);

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
      // Process already gone
      await fs.remove(PID_FILE);
      info('Server was not running. Cleaned up stale PID file.');
    } else {
      error(`Failed to stop server: ${e.message}`);
      process.exit(1);
    }
  }
}

module.exports = { stopServer };
