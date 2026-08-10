// server/db-config.js
// Database configuration and abstraction layer
// Supports both SQLite (local development) and PostgreSQL (production on Vercel)

const path = require('path');
const fs = require('fs');

const DB_TYPE = process.env.DATABASE_URL ? 'postgres' : 'sqlite';

let db;

if (DB_TYPE === 'postgres') {
  // PostgreSQL configuration for production
  const pg = require('pg');
  const connectionString = process.env.DATABASE_URL;
  
  if (!connectionString) {
    throw new Error('DATABASE_URL environment variable is required for PostgreSQL');
  }

  const pool = new pg.Pool({
    connectionString,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  });

  db = {
    type: 'postgres',
    pool,
    query: async (sql, params = []) => {
      try {
        const result = await pool.query(sql, params);
        return result.rows;
      } catch (err) {
        console.error('DB Query Error:', sql, params);
        throw err;
      }
    },
    queryOne: async (sql, params = []) => {
      const results = await db.query(sql, params);
      return results[0] || null;
    },
    exec: async (sql) => {
      // For multi-statement SQL, split and execute
      const statements = sql.split(';').filter(s => s.trim());
      for (const statement of statements) {
        if (statement.trim()) {
          await pool.query(statement);
        }
      }
    },
  };

  console.log('Using PostgreSQL database');
} else {
  // SQLite configuration for local development
  const { DatabaseSync } = require('node:sqlite');

  const DATA_DIR = path.join(__dirname, 'data');
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

  const DB_PATH = process.env.FIELDNOTES_DB_PATH || path.join(DATA_DIR, 'fieldnotes.db');
  const sqlite = new DatabaseSync(DB_PATH);

  sqlite.exec('PRAGMA foreign_keys = ON;');

  db = {
    type: 'sqlite',
    connection: sqlite,
    query: (sql, params = []) => {
      try {
        const stmt = sqlite.prepare(sql);
        return stmt.all(...params);
      } catch (err) {
        console.error('DB Query Error:', sql, params);
        throw err;
      }
    },
    queryOne: (sql, params = []) => {
      try {
        const stmt = sqlite.prepare(sql);
        return stmt.get(...params) || null;
      } catch (err) {
        console.error('DB Query Error:', sql, params);
        throw err;
      }
    },
    exec: (sql) => {
      sqlite.exec(sql);
    },
  };

  console.log('Using SQLite database at', DB_PATH);
}

module.exports = db;
