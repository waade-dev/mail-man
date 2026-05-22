'use strict';

/**
 * src/controllers/AuthController.js
 *
 * Shorthand auth commands that write to the active environment:
 *   mm auth bearer <token>
 *   mm auth basic <user> <pass>
 *   mm auth apikey <header> <key>
 */

const Environment = require('../models/Environment');
const State       = require('../models/State');
const { success, error } = require('../views/console');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function requireActiveEnv() {
  const state = await State.get();
  if (!state.activeEnv) {
    error('No active environment. Set one with: mm env use <name>');
    process.exit(1);
  }
  const env = await Environment.get(state.activeEnv);
  if (!env) {
    error(`Active environment "${state.activeEnv}" not found on disk.`);
    process.exit(1);
  }
  return env;
}

// ---------------------------------------------------------------------------
// mm auth bearer <token>
// ---------------------------------------------------------------------------

async function setBearer(token) {
  const env = await requireActiveEnv();
  env.variables = env.variables || {};
  env.variables['TOKEN'] = token;
  await Environment.save(env);
  success(`Bearer token stored as TOKEN in environment "${env.name}".`);
}

// ---------------------------------------------------------------------------
// mm auth basic <user> <pass>
// ---------------------------------------------------------------------------

async function setBasic(user, pass) {
  const env = await requireActiveEnv();
  const encoded = Buffer.from(`${user}:${pass}`).toString('base64');
  env.variables = env.variables || {};
  env.variables['AUTH_BASIC'] = encoded;
  await Environment.save(env);
  success(`Basic auth stored as AUTH_BASIC (base64) in environment "${env.name}".`);
}

// ---------------------------------------------------------------------------
// mm auth apikey <header> <key>
// ---------------------------------------------------------------------------

async function setApiKey(headerName, key) {
  const env = await requireActiveEnv();
  env.variables = env.variables || {};
  env.variables['API_KEY'] = key;
  env.variables['API_KEY_HEADER'] = headerName;
  await Environment.save(env);
  success(`API key stored as API_KEY (header="${headerName}") in environment "${env.name}".`);
}

module.exports = { setBearer, setBasic, setApiKey };
