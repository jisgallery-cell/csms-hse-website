// db.js
// Zero-dependency JSON-file datastore. Provides a lightweight table-like API
// on top of a single db.json file. Intended for the CSMS HSE MVP phase.
// Swap-in path for production: replace this module with a real client
// (PostgreSQL/MySQL) while keeping the same function signatures.

const fs = require('fs');
const path = require('path');
const { DB_PATH } = require('./config');

let cache = null;

function ensureLoaded() {
  if (cache) return cache;
  if (!fs.existsSync(DB_PATH)) {
    throw new Error('Database belum di-seed. Jalankan: npm run seed');
  }
  const raw = fs.readFileSync(DB_PATH, 'utf-8');
  cache = JSON.parse(raw);
  return cache;
}

function persist() {
  fs.writeFileSync(DB_PATH, JSON.stringify(cache, null, 2), 'utf-8');
}

function initIfMissing(initialData) {
  if (fs.existsSync(DB_PATH)) return false;
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  cache = initialData;
  persist();
  return true;
}

function table(name) {
  const db = ensureLoaded();
  if (!db[name]) db[name] = [];
  return db[name];
}

function all(name) {
  return table(name).slice();
}

function findById(name, idField, id) {
  return table(name).find((r) => r[idField] === id) || null;
}

function insert(name, record) {
  table(name).push(record);
  persist();
  return record;
}

function updateById(name, idField, id, patch) {
  const rows = table(name);
  const idx = rows.findIndex((r) => r[idField] === id);
  if (idx === -1) return null;
  rows[idx] = Object.assign({}, rows[idx], patch);
  persist();
  return rows[idx];
}

function removeById(name, idField, id) {
  const rows = table(name);
  const idx = rows.findIndex((r) => r[idField] === id);
  if (idx === -1) return false;
  rows.splice(idx, 1);
  persist();
  return true;
}

function nextSeq(counterName) {
  const db = ensureLoaded();
  if (!db._counters) db._counters = {};
  db._counters[counterName] = (db._counters[counterName] || 0) + 1;
  persist();
  return db._counters[counterName];
}

module.exports = {
  ensureLoaded,
  persist,
  initIfMissing,
  table,
  all,
  findById,
  insert,
  updateById,
  removeById,
  nextSeq,
};
