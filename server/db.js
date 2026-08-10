// server/db.js
// Phase 1: Database — Supports both SQLite (local) and PostgreSQL (production)
// For local development: uses Node's built-in node:sqlite module (Node 22.5+)
// For production: uses PostgreSQL via DATABASE_URL environment variable

const db = require('./db-config');

if (db.type === 'sqlite') {
  db.connection.exec('PRAGMA foreign_keys = ON;');

  const postsTableInfo = db.connection.prepare('PRAGMA table_info(posts)').all();
  const hasMediaType = postsTableInfo.some((column) => column.name === 'mediaType');
  const hasMediaUrl = postsTableInfo.some((column) => column.name === 'mediaUrl');

  if (!hasMediaType || !hasMediaUrl) {
    if (!hasMediaType) {
      db.connection.exec('ALTER TABLE posts ADD COLUMN mediaType TEXT;');
    }
    if (!hasMediaUrl) {
      db.connection.exec('ALTER TABLE posts ADD COLUMN mediaUrl TEXT;');
    }
  }

  db.connection.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      email TEXT NOT NULL UNIQUE,
      passwordHash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'standard' CHECK (role IN ('standard', 'admin')),
      createdAt TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL UNIQUE,
      createdAt TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS posts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      authorId INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      categoryId INTEGER REFERENCES categories(id) ON DELETE SET NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      mediaType TEXT,
      mediaUrl TEXT,
      createdAt TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      postId INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
      authorId INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      text TEXT NOT NULL,
      createdAt TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS likes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      userId INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      postId INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
      createdAt TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (userId, postId)
    );

    CREATE TABLE IF NOT EXISTS participants (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      role TEXT,
      imageUrl TEXT,
      uploadedBy INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      createdAt TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_posts_category ON posts(categoryId);
    CREATE INDEX IF NOT EXISTS idx_comments_post ON comments(postId);
    CREATE INDEX IF NOT EXISTS idx_likes_post ON likes(postId);
  `);
} else if (db.type === 'postgres') {
  // PostgreSQL schema initialization
  const initSchema = async () => {
    try {
      await db.exec(`
        CREATE TABLE IF NOT EXISTS users (
          id SERIAL PRIMARY KEY,
          username TEXT NOT NULL UNIQUE,
          email TEXT NOT NULL UNIQUE,
          passwordHash TEXT NOT NULL,
          role TEXT NOT NULL DEFAULT 'standard' CHECK (role IN ('standard', 'admin')),
          createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS categories (
          id SERIAL PRIMARY KEY,
          title TEXT NOT NULL UNIQUE,
          createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS posts (
          id SERIAL PRIMARY KEY,
          authorId INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          categoryId INTEGER REFERENCES categories(id) ON DELETE SET NULL,
          title TEXT NOT NULL,
          content TEXT NOT NULL,
          mediaType TEXT,
          mediaUrl TEXT,
          createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS comments (
          id SERIAL PRIMARY KEY,
          postId INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
          authorId INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          text TEXT NOT NULL,
          createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS likes (
          id SERIAL PRIMARY KEY,
          userId INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          postId INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
          createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          UNIQUE (userId, postId)
        );

        CREATE TABLE IF NOT EXISTS participants (
          id SERIAL PRIMARY KEY,
          name TEXT NOT NULL,
          role TEXT,
          imageUrl TEXT,
          uploadedBy INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_posts_category ON posts(categoryId);
        CREATE INDEX IF NOT EXISTS idx_comments_post ON comments(postId);
        CREATE INDEX IF NOT EXISTS idx_likes_post ON likes(postId);
      `);
      console.log('PostgreSQL schema initialized');
    } catch (err) {
      console.error('Error initializing PostgreSQL schema:', err);
    }
  };

  initSchema();
}

module.exports = db;
