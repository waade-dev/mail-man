'use strict';

/**
 * src/controllers/LsController.js
 *
 * mm ls — List all collections and their requests as a tree.
 * Data comes from the running server via HTTP.
 */

const api      = require('../utils/apiClient');
const TreeView = require('../views/TreeView');
const { error } = require('../views/console');

async function ls() {
  let colsRes;
  try {
    colsRes = await api.get('/api/collections');
  } catch (e) {
    error(`Could not reach mail-man server: ${e.message}`);
    process.exit(1);
  }

  const colNames = colsRes.body;

  const data = await Promise.all(
    colNames.map(async name => {
      const { body: reqs } = await api.get(`/api/collections/${encodeURIComponent(name)}`);
      return {
        name,
        requests: Array.isArray(reqs) ? reqs : [],
      };
    })
  );

  TreeView.render(data);
}

module.exports = { ls };
