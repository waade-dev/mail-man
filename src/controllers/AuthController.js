'use strict';

/**
 * src/controllers/AuthController.js
 *
 * Shorthand auth commands that write to the active environment.
 */

const api    = require('../utils/apiClient');
const { success, error } = require('../views/console');

async function requireActiveEnv() {
  const stateRes = await api.get('/api/state');
  const activeEnv = stateRes.body.activeEnv;
  if (!activeEnv) {
    error('No active environment. Set one with: mm env use <name>');
    process.exit(1);
  }
  const envRes = await api.get(`/api/environments/${encodeURIComponent(activeEnv)}`);
  if (envRes.status === 404) {
    error(`Active environment "${activeEnv}" not found on disk.`);
    process.exit(1);
  }
  return { name: activeEnv, env: envRes.body };
}

async function setBearer(token) {
  const { name } = await requireActiveEnv();
  await api.put(`/api/environments/${encodeURIComponent(name)}/vars`, { key: 'TOKEN', value: token });
  success(`Bearer token stored as TOKEN in environment "${name}".`);
}

async function setBasic(user, pass) {
  const { name } = await requireActiveEnv();
  const encoded = Buffer.from(`${user}:${pass}`).toString('base64');
  await api.put(`/api/environments/${encodeURIComponent(name)}/vars`, { key: 'AUTH_BASIC', value: encoded });
  success(`Basic auth stored as AUTH_BASIC (base64) in environment "${name}".`);
}

async function setApiKey(headerName, key) {
  const { name } = await requireActiveEnv();
  await api.put(`/api/environments/${encodeURIComponent(name)}/vars`, {
    vars: { API_KEY: key, API_KEY_HEADER: headerName },
  });
  success(`API key stored as API_KEY (header="${headerName}") in environment "${name}".`);
}

module.exports = { setBearer, setBasic, setApiKey };
