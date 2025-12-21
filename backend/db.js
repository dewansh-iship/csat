import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

const DB_PATH = process.env.DB_PATH || path.join(process.cwd(), "data", "db.sqlite");

export function openDb() {
  const dir = path.dirname(DB_PATH);
  fs.mkdirSync(dir, { recursive: true });
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  migrate(db);
  return db;
}

export function getSubmissionById(db, id) {
  return db.prepare("SELECT * FROM submissions WHERE id=?").get(id);
}

export function listSubmissions(db, limit = 200) {
  return db
    .prepare("SELECT * FROM submissions ORDER BY created_at DESC LIMIT ?")
    .all(limit);
}

export function deleteSubmissionById(db, id) {
  // Returns the deleted row (so caller can cleanup uploaded file if needed)
  const row = db.prepare("SELECT id, file_path FROM submissions WHERE id=?").get(id);
  if (!row) return null;
  db.prepare("DELETE FROM submissions WHERE id=?").run(id);
  return row;
}

function migrate(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS submissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL,
      meta_json TEXT NOT NULL,
      answers_json TEXT NOT NULL,
      scores_json TEXT NOT NULL,
      remark_text TEXT,
      file_path TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_submissions_email ON submissions(email);
    CREATE INDEX IF NOT EXISTS idx_submissions_created ON submissions(created_at DESC);
  `);
  // Backward-compatible migrations for existing databases
  try { db.exec("ALTER TABLE submissions ADD COLUMN remark_text TEXT"); } catch {}
  try { db.exec("ALTER TABLE submissions ADD COLUMN file_path TEXT"); } catch {}
}
