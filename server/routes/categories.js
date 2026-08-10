// server/routes/categories.js
// Category management endpoints — uses node:sqlite DatabaseSync API

const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// GET /api/categories — list all categories (public)
router.get('/', (req, res) => {
  try {
    const categories = db
      .prepare('SELECT id, title, createdAt FROM categories ORDER BY title ASC')
      .all();
    res.json({ categories });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load categories.' });
  }
});

// POST /api/categories — create a new category (auth required)
router.post('/', requireAuth, (req, res) => {
  try {
    const { title } = req.body || {};

    if (!title || !title.trim()) {
      return res.status(400).json({ error: 'Category title is required.' });
    }

    const trimmedTitle = title.trim();

    // Check for duplicates (case-insensitive)
    const existing = db
      .prepare('SELECT id FROM categories WHERE LOWER(title) = LOWER(?)')
      .get(trimmedTitle);

    if (existing) {
      return res.status(409).json({ error: 'A category with that title already exists.' });
    }

    const info = db
      .prepare('INSERT INTO categories (title) VALUES (?)')
      .run(trimmedTitle);

    const category = db
      .prepare('SELECT id, title, createdAt FROM categories WHERE id = ?')
      .get(Number(info.lastInsertRowid));

    res.status(201).json({ category });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create category.' });
  }
});

module.exports = router;