const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data', 'internship.db');
let db = null;
let SQL = null;

async function initDb() {
  if (db) return db;

  SQL = await initSqlJs();

  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  if (fs.existsSync(DB_PATH)) {
    const buffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }

  db.run('PRAGMA foreign_keys = ON;');
  return db;
}

function getDb() {
  if (!db) throw new Error('Database not initialized. Call initDb() first.');
  return db;
}

function saveDb() {
  if (!db) return;
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(DB_PATH, buffer);
}

function runAll(sql, params) {
  const stmt = db.prepare(sql);
  if (params) stmt.bind(params);
  const rows = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  return rows;
}

function runOne(sql, params) {
  const rows = runAll(sql, params);
  return rows.length > 0 ? rows[0] : undefined;
}

let inTransaction = false;

function runRun(sql, params) {
  db.run(sql, params);
  if (!inTransaction) saveDb();
  return { changes: db.getRowsModified() };
}

function runInsert(sql, params) {
  db.run(sql, params);
  if (!inTransaction) saveDb();
  return { lastInsertRowid: 1 };
}

function initSchema() {
  const d = getDb();
  d.run(`
    CREATE TABLE IF NOT EXISTS colleges (
      id            TEXT PRIMARY KEY,
      name          TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS companies (
      id            TEXT PRIMARY KEY,
      name          TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS users (
      id            TEXT PRIMARY KEY,
      username      TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role          TEXT NOT NULL CHECK(role IN ('student','enterprise_mentor','college_teacher','employment_admin')),
      name          TEXT NOT NULL,
      college_id    TEXT,
      company_id    TEXT,
      FOREIGN KEY (college_id) REFERENCES colleges(id),
      FOREIGN KEY (company_id) REFERENCES companies(id)
    );

    CREATE TABLE IF NOT EXISTS positions (
      id            TEXT PRIMARY KEY,
      company_id    TEXT NOT NULL,
      title         TEXT NOT NULL,
      description   TEXT DEFAULT '',
      capacity      INTEGER NOT NULL DEFAULT 1,
      hired_count   INTEGER NOT NULL DEFAULT 0,
      status        TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','closed')),
      created_by    TEXT NOT NULL,
      created_at    TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (company_id) REFERENCES companies(id),
      FOREIGN KEY (created_by) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS resumes (
      id              TEXT PRIMARY KEY,
      student_id      TEXT NOT NULL,
      content         TEXT DEFAULT '',
      college_status  TEXT NOT NULL DEFAULT 'pending' CHECK(college_status IN ('pending','approved','rejected')),
      reviewed_by     TEXT,
      reviewed_at     TEXT,
      FOREIGN KEY (student_id) REFERENCES users(id),
      FOREIGN KEY (reviewed_by) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS applications (
      id            TEXT PRIMARY KEY,
      student_id    TEXT NOT NULL,
      position_id   TEXT NOT NULL,
      resume_id     TEXT NOT NULL,
      status        TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','college_approved','enterprise_reviewing','hired','rejected','closed')),
      created_at    TEXT DEFAULT (datetime('now')),
      updated_at    TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (student_id) REFERENCES users(id),
      FOREIGN KEY (position_id) REFERENCES positions(id),
      FOREIGN KEY (resume_id) REFERENCES resumes(id)
    );
  `);
  saveDb();
}

function beginTransaction() {
  db.run('BEGIN TRANSACTION');
  inTransaction = true;
}

function commitTransaction() {
  db.run('COMMIT');
  inTransaction = false;
  saveDb();
}

function rollbackTransaction() {
  if (inTransaction) {
    db.run('ROLLBACK');
    inTransaction = false;
  }
}

function transaction(fn) {
  beginTransaction();
  try {
    const result = fn();
    commitTransaction();
    return result;
  } catch (e) {
    rollbackTransaction();
    throw e;
  }
}

module.exports = { initDb, getDb, saveDb, initSchema, runAll, runOne, runRun, runInsert, transaction, DB_PATH };
