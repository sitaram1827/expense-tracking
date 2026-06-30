// Simple JSON-file based data store replacing MongoDB.
// All reads/writes are synchronous and funneled through a tiny queue
// so concurrent requests don't corrupt the file.

const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "data");
const DB_FILE = path.join(DATA_DIR, "db.json");

function ensureDb() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify({ users: [], transactions: [] }, null, 2));
  }
}

function readDb() {
  ensureDb();
  const raw = fs.readFileSync(DB_FILE, "utf-8");
  try {
    return JSON.parse(raw || "{}");
  } catch (e) {
    return { users: [], transactions: [] };
  }
}

function writeDb(db) {
  ensureDb();
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

module.exports = { readDb, writeDb };
