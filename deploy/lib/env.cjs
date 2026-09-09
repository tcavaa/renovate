/**
 * Loads .env files into process.env for the two plain-node entry points on cPanel
 * (server.cjs and deploy/migrate.cjs), where neither dotenv nor @next/env can be relied on:
 * in release mode the checkout has no node_modules of its own, only the standalone server's.
 *
 * Same precedence as Next: .env.production.local, .env.local, .env.production, .env — the
 * first file to define a variable wins, and nothing already in the environment is overwritten
 * (variables set in the Node.js app's cPanel settings therefore take priority). Supports
 * `KEY=value`, `export KEY=value`, single or double quotes, `#` comments; no interpolation.
 */
const fs = require('node:fs');
const path = require('node:path');

const FILES = ['.env.production.local', '.env.local', '.env.production', '.env'];

function parse(text) {
  const out = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const m = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!m) continue;
    let value = m[2].trim();
    if (value.startsWith('"') && value.endsWith('"') && value.length >= 2) {
      value = value.slice(1, -1).replace(/\\n/g, '\n');
    } else if (value.startsWith("'") && value.endsWith("'") && value.length >= 2) {
      value = value.slice(1, -1);
    } else {
      const hash = value.indexOf(' #');
      if (hash >= 0) value = value.slice(0, hash).trim();
    }
    out[m[1]] = value;
  }
  return out;
}

/** Loads the env files found in `dir`; returns the names of the files that were read. */
function loadEnvFiles(dir) {
  const loaded = [];
  for (const name of FILES) {
    const file = path.join(dir, name);
    if (!fs.existsSync(file)) continue;
    for (const [key, value] of Object.entries(parse(fs.readFileSync(file, 'utf8')))) {
      if (process.env[key] === undefined) process.env[key] = value;
    }
    loaded.push(name);
  }
  return loaded;
}

module.exports = { loadEnvFiles, parse };
