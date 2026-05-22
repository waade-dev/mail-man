'use strict';

/**
 * src/controllers/LsController.js
 *
 * mm ls — List all collections and their requests as a tree.
 */

const Collection = require('../models/Collection');
const TreeView   = require('../views/TreeView');

async function ls() {
  const cols = await Collection.getAll();

  const data = await Promise.all(
    cols.map(async name => ({
      name,
      requests: await Promise.all(
        (await Collection.getRequests(name)).map(async rname => {
          const r = await Collection.getRequest(name, rname);
          return { name: rname, method: r ? r.method : '?', description: r ? r.description : '' };
        })
      ),
    }))
  );

  TreeView.render(data);
}

module.exports = { ls };
