import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
// Runtime private data is deliberately excluded from deployment file tracing.
export const dataDir = path.resolve(/* turbopackIgnore: true */ process.env.DATA_DIR || './data');
let instance: DatabaseSync | undefined;
export function db() {
  if (instance) return instance;
  mkdirSync(path.join(dataDir, 'uploads'), { recursive: true });
  mkdirSync(path.join(dataDir, 'previews'), { recursive: true });
  instance = new DatabaseSync(path.join(dataDir, 'study.sqlite'));
  instance.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS courses(id TEXT PRIMARY KEY,name TEXT NOT NULL,code TEXT NOT NULL DEFAULT '',color TEXT NOT NULL DEFAULT '#32695c',semester TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS documents(id TEXT PRIMARY KEY,course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,name TEXT NOT NULL,extension TEXT NOT NULL,size INTEGER NOT NULL,status TEXT NOT NULL DEFAULT 'queued',error TEXT NOT NULL DEFAULT '',page_count INTEGER NOT NULL DEFAULT 0,preview_path TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS chunks(id TEXT PRIMARY KEY,document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,page INTEGER NOT NULL,content TEXT NOT NULL,embedding TEXT,embedding_model TEXT NOT NULL DEFAULT '');
    CREATE INDEX IF NOT EXISTS chunks_course ON chunks(course_id);
    CREATE TABLE IF NOT EXISTS topics(id TEXT PRIMARY KEY,course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,title TEXT NOT NULL,description TEXT NOT NULL,source_page INTEGER NOT NULL,status TEXT NOT NULL DEFAULT 'draft',created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS questions(id TEXT PRIMARY KEY,topic_id TEXT NOT NULL REFERENCES topics(id) ON DELETE CASCADE,difficulty INTEGER NOT NULL CHECK(difficulty BETWEEN 1 AND 5),prompt TEXT NOT NULL,options TEXT NOT NULL DEFAULT '[]',answer TEXT NOT NULL,explanation TEXT NOT NULL,rubric TEXT NOT NULL DEFAULT '',status TEXT NOT NULL DEFAULT 'draft',source_page INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS attempts(id TEXT PRIMARY KEY,question_id TEXT NOT NULL REFERENCES questions(id) ON DELETE CASCADE,topic_id TEXT NOT NULL REFERENCES topics(id) ON DELETE CASCADE,answer TEXT NOT NULL,score REAL NOT NULL CHECK(score BETWEEN 0 AND 1),feedback TEXT NOT NULL,hinted INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS attempts_topic ON attempts(topic_id,created_at);
    CREATE TABLE IF NOT EXISTS assignments(id TEXT PRIMARY KEY,course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,title TEXT NOT NULL,due_at TEXT NOT NULL,timezone TEXT NOT NULL,hours REAL NOT NULL DEFAULT 2,weight REAL NOT NULL DEFAULT 0,completed INTEGER NOT NULL DEFAULT 0,notes TEXT NOT NULL DEFAULT '',revision INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS notifications(id TEXT PRIMARY KEY,assignment_id TEXT NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,dedupe_key TEXT NOT NULL UNIQUE,title TEXT NOT NULL,body TEXT NOT NULL,read INTEGER NOT NULL DEFAULT 0,email_status TEXT NOT NULL DEFAULT 'pending',created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS jobs(id TEXT PRIMARY KEY,kind TEXT NOT NULL,target_id TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'queued',error TEXT NOT NULL DEFAULT '',attempts INTEGER NOT NULL DEFAULT 0,lease_until TEXT,created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS messages(id TEXT PRIMARY KEY,course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,role TEXT NOT NULL,content TEXT NOT NULL,mode TEXT NOT NULL DEFAULT '',citations TEXT NOT NULL DEFAULT '[]',created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS ai_usage(id TEXT PRIMARY KEY,day TEXT NOT NULL,kind TEXT NOT NULL,created_at TEXT NOT NULL);
  `);
  return instance;
}
export function all<T>(sql: string, ...args: SQLInputValue[]): T[] {
  return db()
    .prepare(sql)
    .all(...args) as T[];
}
export function one<T>(sql: string, ...args: SQLInputValue[]): T | undefined {
  return db()
    .prepare(sql)
    .get(...args) as T | undefined;
}
export function run(sql: string, ...args: SQLInputValue[]) {
  return db()
    .prepare(sql)
    .run(...args);
}
export function transaction<T>(fn: () => T): T {
  db().exec('BEGIN IMMEDIATE');
  try {
    const value = fn();
    db().exec('COMMIT');
    return value;
  } catch (e) {
    db().exec('ROLLBACK');
    throw e;
  }
}
export const id = () => randomUUID();
export const now = () => new Date().toISOString();
export function setting(key: string, fallback = '') {
  return one<{ value: string }>('SELECT value FROM settings WHERE key=?', key)?.value ?? fallback;
}
export function setSetting(key: string, value: string) {
  run(
    'INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',
    key,
    value,
  );
}
export function enqueue(kind: string, target: string) {
  return transaction(() => {
    const existing = one<{ id: string }>(
      "SELECT id FROM jobs WHERE kind=? AND target_id=? AND status IN ('queued','running')",
      kind,
      target,
    );
    if (existing) return existing.id;
    const jobId = id();
    run(
      'INSERT INTO jobs(id,kind,target_id,created_at) VALUES(?,?,?,?)',
      jobId,
      kind,
      target,
      now(),
    );
    return jobId;
  });
}
