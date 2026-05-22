'use strict';

/**
 * mm import <file>
 *
 * Import a Postman collection (JSON or ZIP) into mm.
 * Postman folders → mm collections.
 * Nested sub-folders are flattened into request names with _ separators.
 * Items at the root of the collection use the collection name as the mm collection.
 */

const path        = require('path');
const fs          = require('fs-extra');
const os          = require('os');
const { execSync }= require('child_process');
const chalk       = require('chalk');
const store       = require('../utils/store');
const { success, error, info, warn, header } = require('../utils/output');

// ─── name sanitisation ────────────────────────────────────────────────────────

/**
 * Convert any string to a valid mm slug: [a-zA-Z0-9_-]+
 */
function slug(name, maxLen = 60) {
  return (name || 'unnamed')
    .trim()
    .replace(/[^a-zA-Z0-9_\- ]/g, '')   // strip everything except safe chars + space
    .replace(/\s+/g, '_')               // spaces → underscores
    .replace(/^[-_]+|[-_]+$/g, '')      // trim leading/trailing separators
    .slice(0, maxLen)
    || 'unnamed';
}

// ─── ZIP handling ─────────────────────────────────────────────────────────────

async function extractCollection(zipPath) {
  const tmpDir = path.join(os.tmpdir(), `mm-import-${Date.now()}`);
  await fs.ensureDir(tmpDir);
  try {
    execSync(`unzip -q "${zipPath}" -d "${tmpDir}"`, { stdio: 'pipe' });
  } catch (e) {
    throw new Error(`Failed to unzip: ${e.message}`);
  }

  // Find the first .postman_collection.json or fallback to any .json
  const allFiles = await walkJson(tmpDir);
  const preferred = allFiles.find(f => f.includes('postman_collection'));
  const chosen    = preferred || allFiles.find(f => !f.includes('__MACOSX'));

  if (!chosen) throw new Error('No JSON file found inside ZIP.');
  const data = await fs.readJson(chosen);
  await fs.remove(tmpDir);
  return data;
}

async function walkJson(dir) {
  const results = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) results.push(...await walkJson(full));
    else if (e.name.endsWith('.json')) results.push(full);
  }
  return results;
}

// ─── Postman → mm conversion ──────────────────────────────────────────────────

/**
 * Convert a Postman request object to a mm-compatible request JSON.
 */
function convertRequest(postmanReq, reqName) {
  const method = (postmanReq.method || 'GET').toUpperCase();

  // URL
  const urlObj = postmanReq.url || '';
  const url    = typeof urlObj === 'string' ? urlObj : (urlObj.raw || '');

  // Headers: array [{key,value,disabled}] → object {key:value}
  const headers = {};
  for (const h of (postmanReq.header || [])) {
    if (!h.disabled && h.key) headers[h.key] = h.value || '';
  }

  // Body
  let body = null;
  const postmanBody = postmanReq.body || {};
  const mode = postmanBody.mode || '';

  if (mode === 'raw') {
    const raw = (postmanBody.raw || '').trim();
    if (raw) {
      try { body = JSON.parse(raw); } catch { body = raw; }
    }
  } else if (mode === 'formdata') {
    // Store as key=value pairs string so mm can display/edit
    const pairs = (postmanBody.formdata || [])
      .filter(i => !i.disabled)
      .map(i => `${i.key}=${i.value || ''}`)
      .join('\n');
    if (pairs) body = pairs;
  } else if (mode === 'urlencoded') {
    const pairs = (postmanBody.urlencoded || [])
      .filter(i => !i.disabled)
      .map(i => `${i.key}=${i.value || ''}`)
      .join('&');
    if (pairs) body = pairs;
  } else if (mode === 'graphql') {
    const gql = postmanBody.graphql || {};
    body = { query: gql.query || '', variables: gql.variables || '' };
  }

  // Auth
  let auth = { type: 'none' };
  const postmanAuth = postmanReq.auth || {};
  const authType = postmanAuth.type || 'noauth';

  if (authType === 'bearer') {
    const items = postmanAuth.bearer || [];
    const tok   = items.find(i => i.key === 'token');
    auth = { type: 'bearer', token: tok ? tok.value : '' };
  } else if (authType === 'basic') {
    const items = postmanAuth.basic || [];
    const find  = k => (items.find(i => i.key === k) || {}).value || '';
    auth = { type: 'basic', username: find('username'), password: find('password') };
  } else if (authType === 'apikey') {
    const items  = postmanAuth.apikey || [];
    const find   = k => (items.find(i => i.key === k) || {}).value || '';
    const hName  = find('key') || find('in') || 'X-API-Key';
    const hValue = find('value');
    auth = { type: 'apikey', header: hName, key: hValue };
  }

  return {
    name:        reqName,
    method,
    url,
    headers,
    body,
    auth,
    description: postmanReq.description || '',
    createdAt:   new Date().toISOString(),
  };
}

/**
 * Recursively walk Postman items, saving each request into mm's store.
 * @param {object[]} items   - Postman collection item array
 * @param {string}   collectionName - the mm collection to save into
 * @param {string}   prefix  - folder path prefix for flattening nested folders
 * @param {object}   counts  - mutable { saved, skipped, collections: Set }
 */
async function processItems(items, collectionName, prefix, counts) {
  for (const item of items) {
    if (item.item) {
      // Folder — recurse with folder name appended to prefix
      const folderSlug = slug(item.name);
      const newPrefix  = prefix ? `${prefix}_${folderSlug}` : folderSlug;
      await processItems(item.item, collectionName, newPrefix, counts);

    } else if (item.request) {
      // Request
      const reqSlug  = slug(item.name);
      const fullName = prefix ? `${prefix}_${reqSlug}` : reqSlug;

      const reqObj = convertRequest(item.request, fullName);

      // Check for collision
      const existing = await store.getRequest(collectionName, fullName);
      if (existing) {
        warn(`Skipped (already exists): ${chalk.bold(collectionName + '/' + fullName)}`);
        counts.skipped++;
        continue;
      }

      await store.saveRequest(collectionName, reqObj);
      counts.collections.add(collectionName);
      counts.saved++;
      console.log(
        '  ' + chalk.green('✓') + '  ' +
        chalk.cyan(collectionName) + chalk.gray('/') + chalk.white(fullName) +
        chalk.gray(`  [${reqObj.method}]`)
      );
    }
  }
}

// ─── main command ─────────────────────────────────────────────────────────────

async function importCollection(filePath) {
  const absPath = path.resolve(filePath);

  if (!(await fs.pathExists(absPath))) {
    error(`File not found: ${absPath}`);
    process.exit(1);
  }

  console.log('\n' + chalk.bold.blue('✉  mm import') + '\n');
  info(`Loading: ${chalk.white(absPath)}`);

  let data;
  try {
    if (absPath.endsWith('.zip')) {
      info('Extracting ZIP…');
      data = await extractCollection(absPath);
    } else {
      data = await fs.readJson(absPath);
    }
  } catch (e) {
    error(`Failed to load collection: ${e.message}`);
    process.exit(1);
  }

  // Validate it looks like a Postman collection
  if (!data.info || !data.item) {
    error('This does not look like a Postman collection (missing .info or .item).');
    process.exit(1);
  }

  const collectionTitle = data.info.name || 'imported';
  const collectionSlug  = slug(collectionTitle);
  const items           = data.item || [];

  console.log('');
  header(`  Collection : ${collectionTitle}`);
  header(`  mm name    : ${collectionSlug}`);
  console.log('');

  const counts = { saved: 0, skipped: 0, collections: new Set() };

  // Top-level items: if it's a folder → use folder name as collection.
  // If it's a bare request → use the collection slug.
  for (const item of items) {
    if (item.item) {
      // Top-level folder → becomes its own mm collection
      const colSlug = slug(item.name);
      await processItems(item.item, colSlug, '', counts);
    } else if (item.request) {
      // Bare top-level request → goes into the collection slug
      const reqSlug = slug(item.name);
      const reqObj  = convertRequest(item.request, reqSlug);
      const existing = await store.getRequest(collectionSlug, reqSlug);
      if (existing) {
        warn(`Skipped (already exists): ${chalk.bold(collectionSlug + '/' + reqSlug)}`);
        counts.skipped++;
        continue;
      }
      await store.saveRequest(collectionSlug, reqObj);
      counts.collections.add(collectionSlug);
      counts.saved++;
      console.log(
        '  ' + chalk.green('✓') + '  ' +
        chalk.cyan(collectionSlug) + chalk.gray('/') + chalk.white(reqSlug) +
        chalk.gray(`  [${reqObj.method}]`)
      );
    }
  }

  console.log('');
  success(
    `Imported ${chalk.bold(counts.saved)} request${counts.saved !== 1 ? 's' : ''}` +
    ` into ${chalk.bold(counts.collections.size)} collection${counts.collections.size !== 1 ? 's' : ''}.` +
    (counts.skipped ? chalk.yellow(`  (${counts.skipped} skipped — already exist)`) : '')
  );

  if (counts.saved > 0) {
    console.log(chalk.gray('\n  Run  mm ls  to see your imported requests.'));
  }
  console.log('');
}

module.exports = { importCollection };
