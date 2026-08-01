/**
 * Creates LectiHub-server/.env from .env.example if missing.
 *
 * Usage (from LectiHub-server):
 *   node setupEnv.js
 */
const fs = require('fs');
const path = require('path');

const root = __dirname;
const envPath = path.join(root, '.env');
const examplePath = path.join(root, '.env.example');

function parseEnv(text) {
  const map = new Map();
  for (const line of text.split(/\r?\n/)) {
    if (!line || line.trim().startsWith('#')) continue;
    const i = line.indexOf('=');
    if (i === -1) continue;
    map.set(line.slice(0, i).trim(), line.slice(i + 1).trim());
  }
  return map;
}

function upsertEnv(text, updates) {
  const lines = text.split(/\r?\n/);
  const seen = new Set();
  const out = lines.map((line) => {
    if (!line || line.trim().startsWith('#')) return line;
    const i = line.indexOf('=');
    if (i === -1) return line;
    const key = line.slice(0, i).trim();
    if (!(key in updates)) return line;
    seen.add(key);
    return `${key}=${updates[key]}`;
  });

  for (const [key, value] of Object.entries(updates)) {
    if (!seen.has(key)) out.push(`${key}=${value}`);
  }
  return `${out.filter((l, idx, arr) => !(l === '' && arr[idx - 1] === '')).join('\n').replace(/\n*$/, '\n')}`;
}

if (!fs.existsSync(examplePath)) {
  console.error('Missing .env.example — cannot set up .env');
  process.exit(1);
}

let created = false;
if (!fs.existsSync(envPath)) {
  fs.copyFileSync(examplePath, envPath);
  created = true;
  console.log('Created .env from .env.example');
} else {
  console.log('.env already exists — refreshing local defaults');
}

const current = fs.readFileSync(envPath, 'utf8');
const parsed = parseEnv(current);

// Strip accidental markdown docs pasted into .env (keep only KEY=value / comments)
const cleaned = current
  .split(/\r?\n/)
  .filter((line) => {
    const t = line.trim();
    if (!t) return true;
    if (t.startsWith('#')) return true;
    if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(t)) return true;
    return false;
  })
  .join('\n');

const updates = {
  JWT_SECRET: parsed.get('JWT_SECRET') || 'lectihub_super_secret_key_change_this_later',
  PORT: parsed.get('PORT') || '3000',
};

const next = upsertEnv(cleaned || fs.readFileSync(examplePath, 'utf8'), updates);
fs.writeFileSync(envPath, next, 'utf8');

const final = parseEnv(next);
console.log(created ? 'Setup complete.' : 'Updated.');
console.log(`JWT_SECRET: ${final.get('JWT_SECRET') ? 'set' : 'MISSING'}`);
console.log('Restart the API: node server.js');
