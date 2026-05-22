'use strict';

/**
 * src/controllers/RequestController.js
 *
 * mm add <collection/request> — Create or edit a request.
 * Prompts run locally (interactive); save goes to server via HTTP.
 */

const inquirer = require('inquirer');
const chalk    = require('chalk');
const api      = require('../utils/apiClient');
const { parsePath } = require('../utils/pathHelper');
const { success, error, info } = require('../views/console');

const NAME_REGEX = /^[a-zA-Z0-9_-]+$/;

// ─────────────────────────────────────────────────────────────
//  Interactive field prompts
// ─────────────────────────────────────────────────────────────

async function promptRequestFields(defaults = {}) {
  // 1. Method
  const { method } = await inquirer.prompt([{
    type:    'list',
    name:    'method',
    message: 'HTTP method:',
    choices: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'],
    default: defaults.method || 'GET',
  }]);

  // 2. URL
  const { url } = await inquirer.prompt([{
    type:     'input',
    name:     'url',
    message:  'URL  (use {{BASE_URL}} for env variables):',
    default:  defaults.url || '',
    validate: v => v.trim() ? true : 'URL is required.',
  }]);

  // 3. Headers
  let headers = defaults.headers ? { ...defaults.headers } : {};
  const { addHeaders } = await inquirer.prompt([{
    type:    'confirm',
    name:    'addHeaders',
    message: 'Add / edit headers?',
    default: Object.keys(headers).length > 0,
  }]);
  if (addHeaders) {
    if (Object.keys(headers).length > 0) {
      console.log(chalk.gray('  Current headers (enter key to overwrite, blank key to finish):'));
      for (const [k, v] of Object.entries(headers)) {
        console.log(chalk.gray(`    ${k}: ${v}`));
      }
    }
    while (true) {
      const { hKey } = await inquirer.prompt([{
        type: 'input', name: 'hKey', message: 'Header key (blank to finish):',
      }]);
      if (!hKey.trim()) break;
      const { hVal } = await inquirer.prompt([{
        type: 'input', name: 'hVal',
        message: `Value for "${hKey}":`, default: headers[hKey] || '',
      }]);
      headers[hKey] = hVal;
    }
  }

  // 4. Body
  let body = defaults.body || null;
  const { addBody } = await inquirer.prompt([{
    type: 'confirm', name: 'addBody',
    message: 'Add / edit request body?', default: !!body,
  }]);
  if (addBody) {
    const current = typeof body === 'object' ? JSON.stringify(body, null, 2) : (body || '');
    const { bodyStr } = await inquirer.prompt([{
      type: 'editor', name: 'bodyStr',
      message: 'Request body (JSON or raw):', default: current,
    }]);
    const trimmed = bodyStr.trim();
    if (trimmed) {
      try { body = JSON.parse(trimmed); } catch { body = trimmed; }
    } else {
      body = null;
    }
  }

  // 5. Auth
  const defaultAuthType = defaults.auth ? _authTypeLabel(defaults.auth.type) : 'None';
  const { authChoice } = await inquirer.prompt([{
    type: 'list', name: 'authChoice',
    message: 'Authentication:',
    choices: ['None', 'Bearer Token', 'Basic Auth', 'API Key'],
    default: defaultAuthType,
  }]);
  let auth = { type: 'none' };
  if (authChoice === 'Bearer Token') {
    const { token } = await inquirer.prompt([{
      type: 'input', name: 'token',
      message: 'Bearer token (use {{TOKEN}} for env variable):',
      default: defaults.auth && defaults.auth.token ? defaults.auth.token : '{{TOKEN}}',
    }]);
    auth = { type: 'bearer', token };
  } else if (authChoice === 'Basic Auth') {
    const d = defaults.auth && defaults.auth.type === 'basic' ? defaults.auth : {};
    const a = await inquirer.prompt([
      { type: 'input',    name: 'username', message: 'Username:', default: d.username || '' },
      { type: 'password', name: 'password', message: 'Password:', mask: '*', default: d.password || '' },
    ]);
    auth = { type: 'basic', username: a.username, password: a.password };
  } else if (authChoice === 'API Key') {
    const d = defaults.auth && defaults.auth.type === 'apikey' ? defaults.auth : {};
    const a = await inquirer.prompt([
      { type: 'input', name: 'header', message: 'Header name (e.g. X-API-Key):', default: d.header || 'X-API-Key' },
      { type: 'input', name: 'key',    message: 'Key value (use {{API_KEY}} for env):', default: d.key || '{{API_KEY}}' },
    ]);
    auth = { type: 'apikey', header: a.header, key: a.key };
  }

  // 6. Description
  const { description } = await inquirer.prompt([{
    type: 'input', name: 'description',
    message: 'Description (optional):', default: defaults.description || '',
  }]);

  return { method, url, headers, body, auth, description };
}

function _authTypeLabel(type) {
  const map = { bearer: 'Bearer Token', basic: 'Basic Auth', apikey: 'API Key' };
  return map[type] || 'None';
}

// ─────────────────────────────────────────────────────────────
//  mm add <collection/request>
// ─────────────────────────────────────────────────────────────

async function addRequest(pathStr) {
  const { collection, request } = parsePath(pathStr);

  if (!collection || !request) {
    error('Usage: mm add <collection>/<request>');
    error('  e.g.  mm add my-api/get-users');
    process.exit(1);
  }

  if (!NAME_REGEX.test(collection)) {
    error(`Collection name "${collection}" is invalid. Use letters, numbers, hyphens, underscores.`);
    process.exit(1);
  }
  if (!NAME_REGEX.test(request)) {
    error(`Request name "${request}" is invalid. Use letters, numbers, hyphens, underscores.`);
    process.exit(1);
  }

  // Fetch state in parallel: collection list + existing request definition
  const [colsRes, reqRes] = await Promise.all([
    api.get('/api/collections'),
    api.get(`/api/collections/${encodeURIComponent(collection)}/${encodeURIComponent(request)}`),
  ]);

  const colIsNew = !colsRes.body.includes(collection);
  const existing = reqRes.status === 200 ? reqRes.body.request : null;
  const isEdit   = !!existing;

  if (colIsNew) {
    info(`Collection "${chalk.bold(collection)}" doesn't exist — will be created.`);
  }

  const mode = isEdit
    ? `Editing  ${chalk.bold(collection + '/' + request)}`
    : `Adding   ${chalk.bold(collection + '/' + request)}`;
  console.log('\n  ' + chalk.blue(mode) + '\n');

  const fields = await promptRequestFields(existing || {});

  const reqObj = {
    name:      request,
    ...fields,
    createdAt: existing ? existing.createdAt : new Date().toISOString(),
    ...(isEdit ? { updatedAt: new Date().toISOString() } : {}),
  };

  await api.post(
    `/api/collections/${encodeURIComponent(collection)}/${encodeURIComponent(request)}`,
    reqObj
  );

  if (colIsNew) success(`Collection "${collection}" created.`);
  success(`${isEdit ? 'Updated' : 'Saved'}: ${chalk.bold(collection + '/' + request)}`);
}

module.exports = { addRequest };
