'use strict';

/**
 * src/controllers/EnvironmentController.js
 *
 * Environment management — all operations go through the server.
 */

const chalk  = require('chalk');
const api    = require('../utils/apiClient');
const { success, error, info, warn, header } = require('../views/console');

// ---------------------------------------------------------------------------
// mm env new <name>
// ---------------------------------------------------------------------------

async function envNew(name) {
  if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
    error('Environment name must contain only letters, numbers, hyphens, or underscores.');
    process.exit(1);
  }
  const res = await api.post('/api/environments', { name });
  if (res.status === 409) { warn(`Environment "${name}" already exists.`); return; }
  if (res.status !== 201) { error(res.body.error || 'Failed to create environment.'); process.exit(1); }
  success(`Environment "${name}" created.`);
}

// ---------------------------------------------------------------------------
// mm env ls
// ---------------------------------------------------------------------------

async function envList() {
  const [stateRes, envsRes] = await Promise.all([
    api.get('/api/state'),
    api.get('/api/environments'),
  ]);

  const activeEnv = stateRes.body.activeEnv;
  const envs      = envsRes.body;   // full env objects

  if (!envs.length) {
    info('No environments. Create one with: mm env new <name>');
    return;
  }

  header('\n  Environments\n');
  for (const env of envs) {
    const isActive = env.name === activeEnv;
    const marker   = isActive ? chalk.green.bold(' ● active') : '';
    const varCount = Object.keys(env.variables || {}).length;
    console.log(
      `  ${chalk.bold.white(env.name.padEnd(25))}${chalk.gray(`${varCount} var${varCount !== 1 ? 's' : ''}`)}${marker}`
    );
  }
  console.log('');
}

// ---------------------------------------------------------------------------
// mm env use <name>
// ---------------------------------------------------------------------------

async function envUse(name) {
  const check = await api.get(`/api/environments/${encodeURIComponent(name)}`);
  if (check.status === 404) {
    error(`Environment "${name}" not found.`);
    process.exit(1);
  }
  await api.post('/api/env/use', { name });
  success(`Active environment set to "${name}".`);
}

// ---------------------------------------------------------------------------
// mm env set <name> <key> <value>
// ---------------------------------------------------------------------------

async function envSet(name, key, value) {
  const check = await api.get(`/api/environments/${encodeURIComponent(name)}`);
  if (check.status === 404) {
    error(`Environment "${name}" not found.`);
    process.exit(1);
  }
  await api.put(`/api/environments/${encodeURIComponent(name)}/vars`, { key, value });
  success(`Set ${chalk.cyan(key)} = ${chalk.green(value)} in "${name}".`);
}

// ---------------------------------------------------------------------------
// mm env rm <name> [key]
// ---------------------------------------------------------------------------

async function envRm(name, key) {
  const inquirer = require('inquirer');
  const check    = await api.get(`/api/environments/${encodeURIComponent(name)}`);
  if (check.status === 404) {
    error(`Environment "${name}" not found.`);
    process.exit(1);
  }
  const env = check.body;

  if (key) {
    if (!Object.prototype.hasOwnProperty.call(env.variables || {}, key)) {
      error(`Key "${key}" not found in environment "${name}".`);
      process.exit(1);
    }
    const { confirm } = await inquirer.prompt([{
      type: 'confirm', name: 'confirm',
      message: `Delete key "${key}" from environment "${name}"?`, default: false,
    }]);
    if (!confirm) { info('Aborted.'); return; }
    await api.del(`/api/environments/${encodeURIComponent(name)}/vars/${encodeURIComponent(key)}`);
    success(`Key "${key}" removed from "${name}".`);
  } else {
    const { confirm } = await inquirer.prompt([{
      type: 'confirm', name: 'confirm',
      message: `Delete entire environment "${name}"?`, default: false,
    }]);
    if (!confirm) { info('Aborted.'); return; }
    const res = await api.del(`/api/environments/${encodeURIComponent(name)}`);
    if (res.body.wasActive) {
      warn('Active environment unset because the environment was deleted.');
    }
    success(`Environment "${name}" deleted.`);
  }
}

// ---------------------------------------------------------------------------
// mm env show <name>
// ---------------------------------------------------------------------------

async function envShow(name) {
  const [envRes, stateRes] = await Promise.all([
    api.get(`/api/environments/${encodeURIComponent(name)}`),
    api.get('/api/state'),
  ]);

  if (envRes.status === 404) {
    error(`Environment "${name}" not found.`);
    process.exit(1);
  }

  const env      = envRes.body;
  const isActive = stateRes.body.activeEnv === name;

  header(`\n  ${name}${isActive ? chalk.green.bold('  ● active') : ''}\n`);
  const vars = env.variables || {};
  if (Object.keys(vars).length === 0) {
    info('  No variables. Add one with: mm env set ' + name + ' KEY value');
  } else {
    for (const [k, v] of Object.entries(vars)) {
      console.log(`  ${chalk.cyan(k.padEnd(25))} ${chalk.white(v)}`);
    }
  }
  console.log('');
}

module.exports = { envNew, envList, envUse, envSet, envRm, envShow };
