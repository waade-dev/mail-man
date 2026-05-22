'use strict';

/**
 * src/utils/apiClient.js
 *
 * Thin HTTP client used by every CLI controller.
 * All operations go through the running mail-man server — one process,
 * one port, like Tomcat.  Commands that bypass this (start/stop/status)
 * are exempt from the preAction gate in bin/mm.
 */

const http = require('http');

const PORT = parseInt(process.env.MM_PORT || '2525', 10);
const HOST = '127.0.0.1';

// ─────────────────────────────────────────────────────────────
//  Core HTTP call
// ─────────────────────────────────────────────────────────────

function call(method, urlPath, body) {
  return new Promise((resolve, reject) => {
    const payload = body != null ? JSON.stringify(body) : null;

    const options = {
      hostname: HOST,
      port:     PORT,
      path:     urlPath,
      method,
      headers: {
        'Content-Type':   'application/json',
        'Content-Length': payload ? Buffer.byteLength(payload) : 0,
      },
    };

    const req = http.request(options, res => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try   { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });

    req.on('error', reject);
    req.setTimeout(30000, () => { req.destroy(); reject(new Error('Request timed out')); });

    if (payload) req.write(payload);
    req.end();
  });
}

// ─────────────────────────────────────────────────────────────
//  Exported helpers
// ─────────────────────────────────────────────────────────────

module.exports = {
  get:  (path)        => call('GET',    path),
  post: (path, body)  => call('POST',   path, body),
  put:  (path, body)  => call('PUT',    path, body),
  del:  (path)        => call('DELETE', path),
  PORT,
  HOST,
  BASE: `http://${HOST}:${PORT}`,
};
