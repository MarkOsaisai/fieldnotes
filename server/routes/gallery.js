// server/routes/gallery.js
// Phase 2.4: Gallery Management
//
// Images are stored using the storage configuration (local disk or Cloudinary).
// This is abstracted to support both local development and production cloud storage.
// 
// To use Cloudinary in production:
// 1. Install: npm install cloudinary multer-storage-cloudinary
// 2. Set environment variables:
//    - CLOUDINARY_CLOUD_NAME
//    - CLOUDINARY_API_KEY
//    - CLOUDINARY_API_SECRET

const express = require('express');
const path = require('path');
const fs = require('fs');
const db = require('../db');
const storageConfig = require('../storage-config');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// GET /api/gallery — everyone (including logged-out visitors) can read
router.get('/', (req, res) => {
  if (db.type === 'postgres') {
    // PostgreSQL async query
    db.query(
      `
      SELECT participants.id, participants.name, participants.role, participants.imageUrl,
             participants.createdAt, users.username AS uploadedBy
      FROM participants
      JOIN users ON users.id = participants.uploadedBy
      ORDER BY participants.createdAt DESC
    `
    ).then(participants => {
      res.json({ participants });
    }).catch(err => {
      console.error('Database error:', err);
      res.status(500).json({ error: 'Failed to load gallery' });
    });
  } else {
    const participants = db.query(
      `
      SELECT participants.id, participants.name, participants.role, participants.imageUrl,
             participants.createdAt, users.username AS uploadedBy
      FROM participants
      JOIN users ON users.id = participants.uploadedBy
      ORDER BY participants.createdAt DESC
    `
    );
    res.json({ participants });
  }
});

// POST /api/gallery — admin only
router.post('/', requireAuth, requireAdmin, (req, res) => {
  storageConfig.upload.single('image')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });

    const { name, role } = req.body || {};
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'A participant needs a name.' });
    }

    const imageUrl = req.file ? storageConfig.getFileUrl(req.file) : null;
    
    if (db.type === 'postgres') {
      db.query(
        'INSERT INTO participants (name, role, imageUrl, uploadedBy) VALUES ($1, $2, $3, $4) RETURNING *',
        [name.trim(), (role || '').trim() || null, imageUrl, req.user.id]
      ).then(rows => {
        const participant = rows[0];
        res.status(201).json({ participant });
      }).catch(err => {
        console.error('Database error:', err);
        res.status(500).json({ error: 'Failed to add participant' });
      });
    } else {
      const info = db.query(
        'INSERT INTO participants (name, role, imageUrl, uploadedBy) VALUES (?, ?, ?, ?)',
        [name.trim(), (role || '').trim() || null, imageUrl, req.user.id]
      );

      const participant = db.queryOne(
        `
        SELECT participants.id, participants.name, participants.role, participants.imageUrl,
               participants.createdAt, users.username AS uploadedBy
        FROM participants JOIN users ON users.id = participants.uploadedBy
        WHERE participants.id = ?
      `,
        [info.id]
      );

      res.status(201).json({ participant });
    }
  });
});

// PUT /api/gallery/:id — admin only (edit name/role, optionally replace image)
router.put('/:id', requireAuth, requireAdmin, (req, res) => {
  storageConfig.upload.single('imageUrl')(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.message });

    const existing = db.type === 'postgres'
      ? await db.queryOne('SELECT * FROM participants WHERE id = $1', [req.params.id])
      : db.queryOne('SELECT * FROM participants WHERE id = ?', [req.params.id]);
    
    if (!existing) return res.status(404).json({ error: 'That participant no longer exists.' });

    const name = (req.body?.name || existing.name).trim();
    const role = (req.body?.role ?? existing.role) || null;
    let imageUrl = existing.imageUrl;

    if (req.file) {
      imageUrl = storageConfig.getFileUrl(req.file);
      
      // Clean up old local file if it exists and we're using local storage
      if (storageConfig.type === 'local' && existing.imageUrl && existing.imageUrl.startsWith('/uploads/')) {
        const oldPath = path.join(__dirname, '..', existing.imageUrl);
        fs.unlink(oldPath, () => {});
      }
    }

    if (db.type === 'postgres') {
      await db.query(
        'UPDATE participants SET name = $1, role = $2, imageUrl = $3 WHERE id = $4',
        [name, role, imageUrl, req.params.id]
      );
      const participant = await db.queryOne(
        `
        SELECT participants.id, participants.name, participants.role, participants.imageUrl,
               participants.createdAt, users.username AS uploadedBy
        FROM participants JOIN users ON users.id = participants.uploadedBy
        WHERE participants.id = $1
      `,
        [req.params.id]
      );
      res.json({ participant });
    } else {
      db.query('UPDATE participants SET name = ?, role = ?, imageUrl = ? WHERE id = ?', [
        name,
        role,
        imageUrl,
        req.params.id,
      ]);

      const participant = db.queryOne(
        `
        SELECT participants.id, participants.name, participants.role, participants.imageUrl,
               participants.createdAt, users.username AS uploadedBy
        FROM participants JOIN users ON users.id = participants.uploadedBy
        WHERE participants.id = ?
      `,
        [req.params.id]
      );

      res.json({ participant });
    }
  });
});

// DELETE /api/gallery/:id — admin only
router.delete('/:id', requireAuth, requireAdmin, async (req, res) => {
  const existing = db.type === 'postgres'
    ? await db.queryOne('SELECT * FROM participants WHERE id = $1', [req.params.id])
    : db.queryOne('SELECT * FROM participants WHERE id = ?', [req.params.id]);
  
  if (!existing) return res.status(404).json({ error: 'That participant no longer exists.' });

  if (db.type === 'postgres') {
    await db.query('DELETE FROM participants WHERE id = $1', [req.params.id]);
  } else {
    db.query('DELETE FROM participants WHERE id = ?', [req.params.id]);
  }

  // Clean up old local file if it exists and we're using local storage
  if (storageConfig.type === 'local' && existing.imageUrl && existing.imageUrl.startsWith('/uploads/')) {
    const oldPath = path.join(__dirname, '..', existing.imageUrl);
    fs.unlink(oldPath, () => {});
  }

  res.status(204).end();
});

module.exports = router;
