// server/db-config.js
// Supports SQLite (local dev) and PostgreSQL (production via DATABASE_URL)

const path = require('path');
const fs = require('fs');

const DB_TYPE = process.env.DATABASE_URL ? 'postgres' : 'sqlite';

// Convert ? placeholders to $1, $2, ... for PostgreSQL
function toPostgresParams(sql) {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

let db;

if (DB_TYPE === 'postgres') {
  const pg = require('pg');

  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  });

  db = {
    type: 'postgres',
    pool,
    // SQL fragment for time comparisons (dialect difference)
    daysAgo: (n) => `NOW() - INTERVAL '${n} days'`,
    query: async (sql, params = []) => {
      const result = await pool.query(toPostgresParams(sql), params);
      return result.rows;
    },
    queryOne: async (sql, params = []) => {
      const result = await pool.query(toPostgresParams(sql), params);
      return result.rows[0] || null;
    },
    // For UPDATE / DELETE statements
    run: async (sql, params = []) => {
      const result = await pool.query(toPostgresParams(sql), params);
      return { changes: result.rowCount };
    },
    exec: async (sql) => {
      const stmts = sql.split(';').filter(s => s.trim());
      for (const stmt of stmts) await pool.query(stmt);
    },
  };

  console.log('Using PostgreSQL database');
} else {
  const { DatabaseSync } = require('node:sqlite');

  const DATA_DIR = path.join(__dirname, 'data');
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

  const DB_PATH = process.env.FIELDNOTES_DB_PATH || path.join(DATA_DIR, 'fieldnotes.db');
  const sqlite = new DatabaseSync(DB_PATH);

  db = {
    type: 'sqlite',
    connection: sqlite,
    daysAgo: (n) => `datetime('now', '-${n} days')`,
    query: (sql, params = []) => sqlite.prepare(sql).all(...params),
    queryOne: (sql, params = []) => sqlite.prepare(sql).get(...params) || null,
    run: (sql, params = []) => sqlite.prepare(sql).run(...params),
    exec: (sql) => sqlite.exec(sql),
  };

  console.log('Using SQLite database at', DB_PATH);
}

module.exports = db;

