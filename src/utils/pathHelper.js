'use strict';

/**
 * Parse a "collection/request" path string used across all commands.
 *
 * Examples:
 *   "my-api/get-users"  →  { collection: "my-api", request: "get-users" }
 *   "my-api"            →  { collection: "my-api", request: null }
 *   ""  / null          →  { collection: null,     request: null }
 */
function parsePath(pathStr) {
  if (!pathStr || !pathStr.trim()) return { collection: null, request: null };
  const trimmed = pathStr.trim();
  const slash   = trimmed.indexOf('/');
  if (slash === -1) return { collection: trimmed, request: null };
  const collection = trimmed.slice(0, slash).trim();
  const request    = trimmed.slice(slash + 1).trim() || null;
  return { collection: collection || null, request };
}

module.exports = { parsePath };
