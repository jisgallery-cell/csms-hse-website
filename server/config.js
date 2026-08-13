// config.js — resolves where persistent data (db.json + uploaded files) lives.
//
// Local development: no DATA_DIR env var set, so everything stays exactly
// where it always has (./data/db.json and ./uploads/), unchanged behavior.
//
// Hosted deployment (Railway/Render/etc.): set the DATA_DIR env var to a
// mounted persistent volume path (e.g. /app/persistent). Both the database
// file and uploaded documents/photos are then stored inside that single
// volume, so they survive restarts and redeploys instead of being wiped.
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : null;

const DB_PATH = DATA_DIR ? path.join(DATA_DIR, 'db.json') : path.join(ROOT, 'data', 'db.json');
const UPLOAD_DIR = DATA_DIR ? path.join(DATA_DIR, 'uploads') : path.join(ROOT, 'uploads');

module.exports = { DATA_DIR, DB_PATH, UPLOAD_DIR };
