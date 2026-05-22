'use strict';

/**
 * mm run <collection> [request]
 *
 * Executes an HTTP request, prints the response with colour-coding,
 * appends to history, and saves lastResponse to .state.json.
 */

const axios      = require('axios');
const inquirer   = require('inquirer');
const chalk      = require('chalk');
const store      = require('../utils/store');
const { resolveRequest } = require('../utils/interpolate');
const { error, info, warn, printResponse } = require('../utils/output');

// ---------------------------------------------------------------------------
// Simple spinner (no extra deps – just a spinning character on stderr)
// ---------------------------------------------------------------------------

function createSpinner(msg) {
  const frames = ['⠋','⠙','⠹','⠸','⠼','⠴','⠦','⠧','⠇','⠏'];
  let i = 0;
  const id = setInterval(() => {
    process.stderr.write(`\r${chalk.cyan(frames[i++ % frames.length])} ${msg}`);
  }, 80);
  return {
    stop: () => {
      clearInterval(id);
      process.stderr.write('\r\x1b[K'); // clear line
    },
  };
}

// ---------------------------------------------------------------------------
// Build the axios config from a resolved request object
// ---------------------------------------------------------------------------

function buildAxiosConfig(req) {
  const config = {
    method: req.method,
    url:    req.url,
    headers: { ...(req.headers || {}) },
    // Don't throw on 4xx/5xx – we want to display the response
    validateStatus: () => true,
    // Return raw data so we can serialise it ourselves
    responseType: 'json',
  };

  // Body
  if (req.body !== null && req.body !== undefined) {
    const ct = (config.headers['Content-Type'] || config.headers['content-type'] || '').toLowerCase();
    if (ct.includes('application/json') || typeof req.body === 'object') {
      config.data = req.body;
      if (!ct) config.headers['Content-Type'] = 'application/json';
    } else {
      config.data = req.body;
    }
  }

  // Auth
  const auth = req.auth || {};
  if (auth.type === 'bearer' && auth.token) {
    config.headers['Authorization'] = `Bearer ${auth.token}`;
  } else if (auth.type === 'basic' && auth.username) {
    const encoded = Buffer.from(`${auth.username}:${auth.password || ''}`).toString('base64');
    config.headers['Authorization'] = `Basic ${encoded}`;
  } else if (auth.type === 'apikey' && auth.header && auth.key) {
    config.headers[auth.header] = auth.key;
  }

  return config;
}

// ---------------------------------------------------------------------------
// Core runner
// ---------------------------------------------------------------------------

async function executeRequest(collection, reqName) {
  // 1. Load the request
  const req = await store.getRequest(collection, reqName);
  if (!req) {
    error(`Request "${reqName}" not found in collection "${collection}".`);
    process.exit(1);
  }

  // 2. Load active environment variables (if any)
  const state = await store.getState();
  let envVars = {};
  if (state.activeEnv) {
    const env = await store.getEnvironment(state.activeEnv);
    if (env) {
      envVars = env.variables || {};
    } else {
      warn(`Active environment "${state.activeEnv}" not found. Running without variable substitution.`);
    }
  }

  // 3. Resolve {{variables}}
  const resolved = resolveRequest(req, envVars);

  // Warn about unresolved placeholders
  const unresolvedMatches = (resolved.url || '').match(/\{\{[^}]+\}\}/g);
  if (unresolvedMatches) {
    warn(`Unresolved variables in URL: ${unresolvedMatches.join(', ')}`);
  }

  // 4. Build axios config
  const axiosConfig = buildAxiosConfig(resolved);

  // 5. Print what we're about to send
  const { colorMethod } = require('../utils/output');
  console.log('');
  console.log(
    chalk.bold('  Sending  ') + colorMethod(resolved.method) + '  ' + chalk.white(resolved.url)
  );
  if (state.activeEnv) {
    console.log(chalk.gray(`  Env: ${state.activeEnv}`));
  }
  console.log('');

  // 6. Execute
  const spinner = createSpinner('Waiting for response...');
  const startTime = Date.now();
  let response;
  try {
    response = await axios(axiosConfig);
  } catch (e) {
    spinner.stop();
    error(`Network error: ${e.message}`);
    process.exit(1);
  }
  spinner.stop();
  const duration = Date.now() - startTime;

  // 7. Print response
  printResponse(response, duration);

  // 8. Persist to history
  const bodyStr = typeof response.data === 'object'
    ? JSON.stringify(response.data)
    : String(response.data || '');

  await store.appendHistory({
    timestamp:    new Date().toISOString(),
    collection,
    request:      reqName,
    method:       req.method,
    url:          resolved.url,
    status:       response.status,
    duration,
    responseBody: bodyStr.slice(0, 4096), // cap at 4 KB in history
  });

  // 9. Save lastResponse to state for `mm beautify`
  const responseSnapshot = {
    timestamp:  new Date().toISOString(),
    collection,
    request:    reqName,
    method:     req.method,
    url:        resolved.url,
    status:     response.status,
    statusText: response.statusText,
    headers:    response.headers,
    body:       response.data,
    duration,
  };

  // Global last response (mm beautify with no args)
  await store.saveState({
    ...state,
    lastResponse: responseSnapshot,
  });

  // Per-request last response (mm beautify <collection> <request>)
  await store.saveLastResponse(collection, reqName, responseSnapshot);
}

// ---------------------------------------------------------------------------
// mm run <collection> [request]
// ---------------------------------------------------------------------------

async function runCommand(collection, reqName) {
  // Validate collection exists
  const cols = await store.getCollections();
  if (!cols.includes(collection)) {
    error(`Collection "${collection}" not found.`);
    process.exit(1);
  }

  if (reqName) {
    // Direct run
    await executeRequest(collection, reqName);
  } else {
    // Interactive select
    const reqs = await store.getRequests(collection);
    if (reqs.length === 0) {
      info(`Collection "${collection}" is empty. Add requests with: mm add ${collection}`);
      return;
    }

    // Build rich choice labels
    const choices = await Promise.all(reqs.map(async name => {
      const r = await store.getRequest(collection, name);
      const { colorMethod } = require('../utils/output');
      return {
        name: `${colorMethod(r.method)}  ${name}${r.description ? chalk.gray('  ' + r.description) : ''}`,
        value: name,
        short: name,
      };
    }));

    const { selected } = await inquirer.prompt([{
      type: 'list',
      name: 'selected',
      message: `Select a request from "${collection}":`,
      choices,
    }]);

    await executeRequest(collection, selected);
  }
}

module.exports = { runCommand };
