'use strict';

/**
 * src/controllers/ImportController.js
 *
 * mm import <file>
 *
 * Reads a Postman v2/v2.1 collection JSON from disk and sends it to the
 * server.  All parsing and saving logic lives server-side.
 */

const fs    = require('fs-extra');
const path  = require('path');
const chalk = require('chalk');
const api   = require('../utils/apiClient');
const { success, error, info, warn } = require('../views/console');

async function importCollection(filePath) {
  const absPath = path.resolve(filePath);

  if (!(await fs.pathExists(absPath))) {
    error(`File not found: ${absPath}`);
    process.exit(1);
  }

  let raw;
  try {
    raw = await fs.readJson(absPath);
  } catch (e) {
    error(`Could not parse JSON: ${e.message}`);
    process.exit(1);
  }

  info(`Sending to server for import…`);

  const res = await api.post('/api/import', raw);

  if (res.status !== 200) {
    error(res.body.error || 'Import failed.');
    process.exit(1);
  }

  const { collectionName, results } = res.body;
  const imported = results.filter(r => !r.skipped);
  const skipped  = results.filter(r => r.skipped);

  info(`Importing → mm collection "${chalk.bold(collectionName)}"\n`);

  for (const r of imported) {
    console.log(
      `  ${chalk.green('✓')} ${chalk.bold((r.method || '').padEnd(7))} ` +
      `${chalk.cyan(r.name.padEnd(35))} ${chalk.gray((r.url || '').slice(0, 60))}`
    );
  }
  for (const r of skipped) {
    warn(`  Skipped "${r.name}" — ${r.reason}`);
  }

  console.log('');
  success(`Imported ${imported.length} request${imported.length !== 1 ? 's' : ''} into "${chalk.bold(collectionName)}".`);
  if (skipped.length) warn(`Skipped ${skipped.length} request${skipped.length !== 1 ? 's' : ''}.`);
  info(`Run ${chalk.bold('mm ls')} to see your collection.`);
}

module.exports = { importCollection };
