'use strict';

/**
 * Environment management commands:
 *   mm env new <name>
 *   mm env ls
 *   mm env use <name>
 *   mm env set <name> <key> <value>
 *   mm env rm <name> [key]
 *   mm env show <name>
 */

const chalk  = require('chalk');
const store  = require('../utils/store');
const { success, error, info, warn, header } = require('../utils/output');

// ---------------------------------------------------------------------------
// mm env new <name>
// ---------------------------------------------------------------------------

async function envNew(name) {
  if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
    error('Environment name must contain only letters, numbers, hyphens, or underscores.');
    process.exit(1);
  }
  const existing = await store.getEnvironment(name);
  if (existing) {
    warn(`Environment "${name}" already exists.`);
    return;
  }
  await store.saveEnvironment({
    name,
    variables: {},
    createdAt: new Date().toISOString(),
  });
  success(`Environment "${name}" created.`);
}

// ---------------------------------------------------------------------------
// mm env ls
// ---------------------------------------------------------------------------

async function envList() {
  const envs  = await store.getEnvironments();
  const state = await store.getState();

  if (envs.length === 0) {
    info('No environments. Create one with: mm env new <name>');
    return;
  }

  header('\n  Environments\n');
  for (const name of envs) {
    const isActive = name === state.activeEnv;
    const marker   = isActive ? chalk.green.bold(' ● active') : '';
    const env      = await store.getEnvironment(name);
    const varCount = Object.keys(env.variables || {}).length;
    console.log(
      `  ${chalk.bold.white(name.padEnd(25))}${chalk.gray(`${varCount} var${varCount !== 1 ? 's' : ''}`)}${marker}`
    );
  }
  console.log('');
}

// ---------------------------------------------------------------------------
// mm env use <name>
// ---------------------------------------------------------------------------

async function envUse(name) {
  const env = await store.getEnvironment(name);
  if (!env) {
    error(`Environment "${name}" not found.`);
    process.exit(1);
  }
  const state = await store.getState();
  await store.saveState({ ...state, activeEnv: name });
  success(`Active environment set to "${name}".`);
}

// ---------------------------------------------------------------------------
// mm env set <name> <key> <value>
// ---------------------------------------------------------------------------

async function envSet(name, key, value) {
  let env = await store.getEnvironment(name);
  if (!env) {
    error(`Environment "${name}" not found.`);
    process.exit(1);
  }
  env.variables = env.variables || {};
  env.variables[key] = value;
  await store.saveEnvironment(env);
  success(`Set ${chalk.cyan(key)} = ${chalk.green(value)} in "${name}".`);
}

// ---------------------------------------------------------------------------
// mm env rm <name> [key]
// ---------------------------------------------------------------------------

async function envRm(name, key) {
  const inquirer = require('inquirer');
  const env = await store.getEnvironment(name);
  if (!env) {
    error(`Environment "${name}" not found.`);
    process.exit(1);
  }

  if (key) {
    if (!Object.prototype.hasOwnProperty.call(env.variables || {}, key)) {
      error(`Key "${key}" not found in environment "${name}".`);
      process.exit(1);
    }
    const { confirm } = await inquirer.prompt([{
      type: 'confirm',
      name: 'confirm',
      message: `Delete key "${key}" from environment "${name}"?`,
      default: false,
    }]);
    if (!confirm) { info('Aborted.'); return; }
    await store.deleteEnvironment(name, key);
    success(`Key "${key}" removed from "${name}".`);
  } else {
    const { confirm } = await inquirer.prompt([{
      type: 'confirm',
      name: 'confirm',
      message: `Delete entire environment "${name}"?`,
      default: false,
    }]);
    if (!confirm) { info('Aborted.'); return; }

    // If deleting the active env, clear it from state
    const state = await store.getState();
    if (state.activeEnv === name) {
      await store.saveState({ ...state, activeEnv: null });
      warn('Active environment unset because the environment was deleted.');
    }

    await store.deleteEnvironment(name);
    success(`Environment "${name}" deleted.`);
  }
}

// ---------------------------------------------------------------------------
// mm env show <name>
// ---------------------------------------------------------------------------

async function envShow(name) {
  const env = await store.getEnvironment(name);
  if (!env) {
    error(`Environment "${name}" not found.`);
    process.exit(1);
  }

  const state = await store.getState();
  const isActive = state.activeEnv === name;

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
