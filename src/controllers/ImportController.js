'use strict';

/**
 * src/controllers/ImportController.js
 *
 * mm import <file>
 *
 * Imports a Postman v2 / v2.1 collection JSON file into mail-man.
 * - Flattens nested folders (hyphen-joined prefix).
 * - Sanitises request names.
 * - Supports bearer / basic / apikey auth.
 * - Parses headers + body (raw JSON, urlencoded, formdata).
 * - Shows progress as each request is imported.
 */

const fs         = require('fs-extra');
const path       = require('path');
const chalk      = require('chalk');
const Collection = require('../models/Collection');
const { success, error, info, warn } = require('../views/console');

// ---------------------------------------------------------------------------
// Name sanitiser  (letters, numbers, hyphens, underscores only)
// ---------------------------------------------------------------------------

function sanitise(name) {
  return (name || 'request')
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 64) || 'request';
}

// ---------------------------------------------------------------------------
// Parse Postman auth → mm auth object
// ---------------------------------------------------------------------------

function parseAuth(auth) {
  if (!auth || !auth.type || auth.type === 'noauth') return { type: 'none' };

  const type = auth.type.toLowerCase();

  if (type === 'bearer') {
    // Postman v2.1 stores auth params as an array of {key, value} objects
    const params = Array.isArray(auth.bearer)
      ? auth.bearer
      : (auth[type] ? [{ key: 'token', value: auth[type] }] : []);
    const tokenEntry = params.find(p => p.key === 'token');
    const token = tokenEntry ? tokenEntry.value : '{{TOKEN}}';
    return { type: 'bearer', token };
  }

  if (type === 'basic') {
    const params = Array.isArray(auth.basic) ? auth.basic : [];
    const username = (params.find(p => p.key === 'username') || {}).value || '';
    const password = (params.find(p => p.key === 'password') || {}).value || '';
    return { type: 'basic', username, password };
  }

  if (type === 'apikey') {
    const params = Array.isArray(auth.apikey) ? auth.apikey : [];
    const headerName = (params.find(p => p.key === 'key') || {}).value || 'X-API-Key';
    const keyValue   = (params.find(p => p.key === 'value') || {}).value || '{{API_KEY}}';
    return { type: 'apikey', header: headerName, key: keyValue };
  }

  return { type: 'none' };
}

// ---------------------------------------------------------------------------
// Parse Postman headers array → mm headers object
// ---------------------------------------------------------------------------

function parseHeaders(headers) {
  if (!headers) return {};
  // Postman v2.1 header can be an array of {key, value, disabled} or a raw string
  if (typeof headers === 'string') {
    // raw "Key: Value\nKey2: Value2"
    const obj = {};
    for (const line of headers.split('\n')) {
      const idx = line.indexOf(':');
      if (idx > 0) {
        obj[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
      }
    }
    return obj;
  }
  if (Array.isArray(headers)) {
    const obj = {};
    for (const h of headers) {
      if (h.disabled) continue;
      if (h.key) obj[h.key] = h.value || '';
    }
    return obj;
  }
  return {};
}

// ---------------------------------------------------------------------------
// Parse Postman body → mm body (string or object)
// ---------------------------------------------------------------------------

function parseBody(body) {
  if (!body || !body.mode) return null;

  if (body.mode === 'raw') {
    const raw = (body.raw || '').trim();
    if (!raw) return null;
    try { return JSON.parse(raw); } catch { return raw; }
  }

  if (body.mode === 'urlencoded') {
    const params = Array.isArray(body.urlencoded) ? body.urlencoded : [];
    const obj = {};
    for (const p of params) {
      if (!p.disabled && p.key) obj[p.key] = p.value || '';
    }
    return Object.keys(obj).length ? obj : null;
  }

  if (body.mode === 'formdata') {
    const params = Array.isArray(body.formdata) ? body.formdata : [];
    const obj = {};
    for (const p of params) {
      if (!p.disabled && p.key && p.type !== 'file') obj[p.key] = p.value || '';
    }
    return Object.keys(obj).length ? obj : null;
  }

  return null;
}

// ---------------------------------------------------------------------------
// Flatten Postman items (handles nested folders)
// ---------------------------------------------------------------------------

function flattenItems(items, prefix) {
  const result = [];
  for (const item of (items || [])) {
    if (item.item) {
      // It's a folder — recurse with folder name as prefix
      const folderName = sanitise(item.name || 'folder');
      const newPrefix  = prefix ? `${prefix}-${folderName}` : folderName;
      result.push(...flattenItems(item.item, newPrefix));
    } else if (item.request) {
      result.push({ item, prefix });
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Convert a single Postman item → mm request object
// ---------------------------------------------------------------------------

function convertItem(item, prefix, collectionName, usedNames) {
  const req = item.request;

  // Method
  const method = typeof req === 'string' ? 'GET' : (req.method || 'GET').toUpperCase();

  // URL
  let url = '';
  if (typeof req === 'string') {
    url = req;
  } else if (req.url) {
    if (typeof req.url === 'string') {
      url = req.url;
    } else {
      // Postman v2.1 URL object
      url = req.url.raw || (req.url.host || []).join('.') || '';
    }
  }

  // Name (unique within collection)
  const baseName = sanitise(item.name || url || 'request');
  const prefixed = prefix ? `${prefix}-${baseName}` : baseName;
  let uniqueName = prefixed;
  let counter    = 2;
  while (usedNames.has(uniqueName)) {
    uniqueName = `${prefixed}-${counter++}`;
  }
  usedNames.add(uniqueName);

  // Headers (merge collection-level if needed — item-level takes priority)
  const rawHeaders = (typeof req !== 'string' && req.header) ? req.header : [];
  const headers    = parseHeaders(rawHeaders);

  // Body
  const body = (typeof req !== 'string' && req.body) ? parseBody(req.body) : null;

  // Auth
  const auth = (typeof req !== 'string' && req.auth) ? parseAuth(req.auth) : { type: 'none' };

  // Description
  const description = (typeof req !== 'string' && req.description)
    ? (typeof req.description === 'string' ? req.description : (req.description.content || ''))
    : '';

  return {
    name:        uniqueName,
    method,
    url,
    headers,
    body,
    auth,
    description: description.slice(0, 200),
    createdAt:   new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// mm import <file>
// ---------------------------------------------------------------------------

async function importCollection(filePath) {
  // Resolve file path
  const absPath = path.resolve(filePath);

  if (!(await fs.pathExists(absPath))) {
    error(`File not found: ${absPath}`);
    process.exit(1);
  }

  // Read + parse JSON
  let raw;
  try {
    raw = await fs.readJson(absPath);
  } catch (e) {
    error(`Could not parse JSON: ${e.message}`);
    process.exit(1);
  }

  // Detect Postman v2 / v2.1 schema
  const schemaUrl = raw.info && raw.info.schema ? raw.info.schema : '';
  const isPostman = schemaUrl.includes('schema.getpostman.com') ||
    (raw.info && raw.info.name && Array.isArray(raw.item));

  if (!isPostman) {
    error('File does not appear to be a Postman v2/v2.1 collection.');
    error('  Expected: { info: { schema: "...getpostman.com/..." }, item: [...] }');
    process.exit(1);
  }

  // Derive collection name from Postman info
  const collectionName = sanitise(raw.info.name || path.basename(absPath, '.json'));

  info(`Importing Postman collection "${raw.info.name || absPath}" → mm collection "${chalk.bold(collectionName)}"`);

  // Flatten all items (handles nested folders)
  const flatItems = flattenItems(raw.item || [], '');

  if (flatItems.length === 0) {
    warn('No requests found in this collection.');
    return;
  }

  info(`Found ${flatItems.length} request${flatItems.length !== 1 ? 's' : ''}. Importing…\n`);

  const usedNames = new Set();
  let imported    = 0;
  let skipped     = 0;

  for (const { item, prefix } of flatItems) {
    try {
      const reqObj = convertItem(item, prefix, collectionName, usedNames);

      // Skip requests with no URL
      if (!reqObj.url) {
        warn(`  Skipping "${item.name || '(unnamed)'}" — no URL`);
        skipped++;
        continue;
      }

      await Collection.save(collectionName, reqObj);

      const methodColored = chalk.bold(reqObj.method.padEnd(7));
      console.log(
        `  ${chalk.green('✓')} ${methodColored} ${chalk.cyan(reqObj.name.padEnd(35))} ${chalk.gray(reqObj.url.slice(0, 60))}`
      );
      imported++;
    } catch (e) {
      warn(`  Failed to import "${item.name || '(unnamed)'}": ${e.message}`);
      skipped++;
    }
  }

  console.log('');
  success(`Imported ${imported} request${imported !== 1 ? 's' : ''} into collection "${chalk.bold(collectionName)}".`);
  if (skipped > 0) warn(`Skipped ${skipped} request${skipped !== 1 ? 's' : ''} (no URL or parse error).`);
  info(`Run ${chalk.bold('mm ls')} to see your collection.`);
}

module.exports = { importCollection };
