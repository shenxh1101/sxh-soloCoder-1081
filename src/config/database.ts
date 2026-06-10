import sqlite3 from 'sqlite3';
import path from 'path';
import fs from 'fs';

const dataDir = path.join(process.cwd(), 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'survey.db');

export class Database {
  private db: sqlite3.Database;

  constructor() {
    this.db = new sqlite3.Database(dbPath, (err) => {
      if (err) {
        console.error('Error opening database:', err.message);
      } else {
        console.log('Connected to SQLite database');
      }
    });

    this.db.serialize(() => {
      this.db.run('PRAGMA journal_mode = WAL');
      this.db.run('PRAGMA foreign_keys = ON');
    });
  }

  run(sql: string, params: any[] = []): Promise<{ lastID: number; changes: number }> {
    return new Promise((resolve, reject) => {
      this.db.run(sql, params, function (err) {
        if (err) reject(err);
        else resolve({ lastID: this.lastID, changes: this.changes });
      });
    });
  }

  get<T = any>(sql: string, params: any[] = []): Promise<T | undefined> {
    return new Promise((resolve, reject) => {
      this.db.get(sql, params, (err, row) => {
        if (err) reject(err);
        else resolve(row as T | undefined);
      });
    });
  }

  all<T = any>(sql: string, params: any[] = []): Promise<T[]> {
    return new Promise((resolve, reject) => {
      this.db.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows as T[]);
      });
    });
  }

  exec(sql: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.exec(sql, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  prepare(sql: string): Statement {
    return new Statement(this.db, sql);
  }

  close(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }
}

export class Statement {
  private stmt: sqlite3.Statement;
  private db: sqlite3.Database;
  private sql: string;

  constructor(db: sqlite3.Database, sql: string) {
    this.db = db;
    this.sql = sql;
    this.stmt = db.prepare(sql);
  }

  run(...params: any[]): Promise<{ lastID: number; changes: number }> {
    return new Promise((resolve, reject) => {
      this.stmt.run(...params, function (err) {
        if (err) reject(err);
        else resolve({ lastID: this.lastID, changes: this.changes });
      });
    });
  }

  get<T = any>(...params: any[]): Promise<T | undefined> {
    return new Promise((resolve, reject) => {
      this.stmt.get(...params, (err, row) => {
        if (err) reject(err);
        else resolve(row as T | undefined);
      });
    });
  }

  all<T = any>(...params: any[]): Promise<T[]> {
    return new Promise((resolve, reject) => {
      this.stmt.all(...params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows as T[]);
      });
    });
  }

  finalize(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.stmt.finalize((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }
}

export type TransactionCallback = (db: Database) => Promise<void>;

export function transaction(db: Database, callback: TransactionCallback): Promise<void> {
  return new Promise(async (resolve, reject) => {
    try {
      await db.run('BEGIN TRANSACTION');
      await callback(db);
      await db.run('COMMIT');
      resolve();
    } catch (err) {
      await db.run('ROLLBACK');
      reject(err);
    }
  });
}

const db = new Database();

export default db;
