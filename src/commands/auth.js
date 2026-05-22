'use strict';

/**
 * Shorthand auth commands that write to the active environment:
 *   mm auth bearer <token>
 *   mm auth basic <user> <pass>
 *   mm auth apikey <header> <key>
 */

const store  = require('../utils/store');
const { success, error, warn } = require('../utils/output');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function requireActiveEnv() {
  const state = await store.getState();
  if (!state.activeEnv) {
    error('No active environment. Set one with: mm env use <name>');
    process.exit(1);
  }
  const env = await store.getEnvironment(state.activeEnv);
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
  await store.saveEnvironment(env);
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
  await store.saveEnvironment(env);
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
  await store.saveEnvironment(env);
  success(`API key stored as API_KEY (header="${headerName}") in environment "${env.name}".`);
}

module.exports = { setBearer, setBasic, setApiKey };
