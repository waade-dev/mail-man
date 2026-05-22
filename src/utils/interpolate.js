'use strict';

/**
 * Replace all {{KEY}} placeholders in a string with values from the
 * variables map.  Unknown placeholders are left as-is so the caller can
 * detect them or let the server return the appropriate error.
 *
 * @param {string} str        Source string, may contain {{VAR}} tokens.
 * @param {object} variables  Key/value map of variable names → values.
 * @returns {string}
 */
function interpolate(str, variables) {
  if (!str || typeof str !== 'string') return str;
  return str.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    return Object.prototype.hasOwnProperty.call(variables, key)
      ? variables[key]
      : match;
  });
}

/**
 * Interpolate all variable-containing fields of a request object against
 * the supplied environment variables.
 *
 * Returns a *new* object; the original is not mutated.
 *
 * @param {object} request      Raw request object loaded from disk.
 * @param {object} envVariables Key/value map from the active environment.
 * @returns {object}            Resolved request ready to be sent.
 */
function resolveRequest(request, envVariables = {}) {
  const vars = envVariables || {};

  // Deep-clone to avoid mutating the on-disk representation
  const resolved = JSON.parse(JSON.stringify(request));

  // URL
  resolved.url = interpolate(resolved.url, vars);

  // Headers (values only – keys are rarely templated but handle anyway)
  if (resolved.headers && typeof resolved.headers === 'object') {
    const h = {};
    for (const [k, v] of Object.entries(resolved.headers)) {
      h[interpolate(k, vars)] = interpolate(v, vars);
    }
    resolved.headers = h;
  }

  // Body: if it's a string interpolate directly; if it's an object
  // round-trip through JSON so nested string values get resolved.
  // The try/catch guards against a substituted value producing invalid JSON
  // (e.g. a variable value that contains unescaped quotes).
  if (resolved.body) {
    if (typeof resolved.body === 'string') {
      resolved.body = interpolate(resolved.body, vars);
    } else if (typeof resolved.body === 'object') {
      try {
        resolved.body = JSON.parse(interpolate(JSON.stringify(resolved.body), vars));
      } catch {
        // Interpolation broke JSON validity — keep original object untouched
      }
    }
  }

  // Auth token
  if (resolved.auth && resolved.auth.token) {
    resolved.auth.token = interpolate(resolved.auth.token, vars);
  }

  return resolved;
}

module.exports = { interpolate, resolveRequest };
