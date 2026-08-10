// server/routes/categories.js
const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const categories = await db.query('SELECT id, title, createdAt FROM categories ORDER BY title ASC', []);
    res.json({ categories });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load categories.' });
  }
});

router.post('/', requireAuth, async (req, res) => {
  try {
    const { title } = req.body || {};
    if (!title || !title.trim()) return res.status(400).json({ error: 'Category title is required.' });

    const trimmedTitle = title.trim();
    const existing = await db.queryOne(
      'SELECT id FROM categories WHERE LOWER(title) = LOWER(?)',
      [trimmedTitle]
    );
    if (existing) return res.status(409).json({ error: 'A category with that title already exists.' });

    const inserted = await db.queryOne('INSERT INTO categories (title) VALUES (?) RETURNING id', [trimmedTitle]);
    const category = await db.queryOne('SELECT id, title, createdAt FROM categories WHERE id = ?', [inserted.id]);
    res.status(201).json({ category });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create category.' });
  }
});

module.exports = router;