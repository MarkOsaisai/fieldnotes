// server/routes/posts.js
const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const db = require('../db');
const { requireAuth, optionalAuth } = require('../middleware/auth');

const router = express.Router();

const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `post-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
  },
});

const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/webm', 'video/quicktime']);
const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_TYPES.has(file.mimetype)) return cb(new Error('Only images and common video formats are allowed.'));
    cb(null, true);
  },
});

const POST_FIELDS = `
  posts.id, posts.title, posts.content, posts.createdAt, posts.categoryId,
  posts.mediaType, posts.mediaUrl,
  users.id AS authorId, users.username AS authorUsername,
  categories.title AS categoryTitle,
  (SELECT COUNT(*) FROM likes WHERE likes.postId = posts.id) AS likeCount,
  (SELECT COUNT(*) FROM comments WHERE comments.postId = posts.id) AS commentCount
`;

async function attachViewerLiked(rows, viewerId) {
  if (!viewerId || rows.length === 0) return rows.map((r) => ({ ...r, likedByMe: false }));
  const placeholders = rows.map(() => '?').join(',');
  const likedRows = await db.query(
    `SELECT postId FROM likes WHERE userId = ? AND postId IN (${placeholders})`,
    [viewerId, ...rows.map((r) => r.id)]
  );
  const likedIds = new Set(likedRows.map((r) => r.postId));
  return rows.map((r) => ({ ...r, likedByMe: likedIds.has(r.id) }));
}

function isAuthorOrAdmin(postAuthorId, user) {
  return Boolean(user && (user.role === 'admin' || user.id === postAuthorId));
}

function removeMediaFile(mediaUrl) {
  if (!mediaUrl) return;
  const absolutePath = path.join(UPLOAD_DIR, mediaUrl.replace(/^\/uploads\//, ''));
  fs.unlink(absolutePath, () => {});
}

// GET /api/posts?filter=recent|popular&sort=newest|oldest|popular&categoryId=...&page=1&limit=8
router.get('/', optionalAuth, async (req, res) => {
  try {
    const filter = req.query.filter === 'popular' ? 'popular' : 'recent';
    const sort = req.query.sort === 'oldest' ? 'oldest' : req.query.sort === 'popular' ? 'popular' : 'newest';
    const categoryId = req.query.categoryId ? parseInt(req.query.categoryId, 10) : null;
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(20, Math.max(1, parseInt(req.query.limit, 10) || 8));
    const offset = (page - 1) * limit;

    const categoryClause = categoryId && !isNaN(categoryId) ? 'WHERE posts.categoryId = ?' : '';
    const categoryParam = categoryId && !isNaN(categoryId) ? [categoryId] : [];

    let rows;
    if (filter === 'popular' || sort === 'popular') {
      rows = await db.query(
        `SELECT ${POST_FIELDS},
          (SELECT COUNT(*) FROM likes WHERE likes.postId = posts.id
             AND likes.createdAt >= ${db.daysAgo(7)}) AS recentLikeCount
        FROM posts
        JOIN users ON users.id = posts.authorId
        LEFT JOIN categories ON categories.id = posts.categoryId
        ${categoryClause}
        ORDER BY recentLikeCount DESC, likeCount DESC, posts.createdAt DESC
        LIMIT ${limit} OFFSET ${offset}`,
        categoryParam
      );
    } else if (sort === 'oldest') {
      rows = await db.query(
        `SELECT ${POST_FIELDS}
        FROM posts
        JOIN users ON users.id = posts.authorId
        LEFT JOIN categories ON categories.id = posts.categoryId
        ${categoryClause}
        ORDER BY posts.createdAt ASC
        LIMIT ${limit} OFFSET ${offset}`,
        categoryParam
      );
    } else {
      rows = await db.query(
        `SELECT ${POST_FIELDS}
        FROM posts
        JOIN users ON users.id = posts.authorId
        LEFT JOIN categories ON categories.id = posts.categoryId
        ${categoryClause}
        ORDER BY posts.createdAt DESC
        LIMIT ${limit} OFFSET ${offset}`,
        categoryParam
      );
    }

    const countRow = await db.queryOne(`SELECT COUNT(*) AS n FROM posts ${categoryClause}`, categoryParam);
    const totalCount = Number(countRow.n);

    res.json({
      posts: await attachViewerLiked(rows, req.user?.id),
      hasMore: offset + rows.length < totalCount,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load posts.' });
  }
});

// GET /api/posts/participants — top contributors by post count
router.get('/participants', optionalAuth, async (req, res) => {
  try {
    const rows = await db.query(
      `SELECT users.id, users.username, COUNT(posts.id) AS postCount
      FROM users
      LEFT JOIN posts ON posts.authorId = users.id
      GROUP BY users.id
      ORDER BY postCount DESC, users.username ASC
      LIMIT 6`,
      []
    );
    res.json({ participants: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load participants.' });
  }
});

// GET /api/posts/:id — single post with comments
router.get('/:id', optionalAuth, async (req, res) => {
  try {
    const post = await db.queryOne(
      `SELECT ${POST_FIELDS}
       FROM posts
       JOIN users ON users.id = posts.authorId
       LEFT JOIN categories ON categories.id = posts.categoryId
       WHERE posts.id = ?`,
      [req.params.id]
    );
    if (!post) return res.status(404).json({ error: 'That post no longer exists.' });

    const [withLiked] = await attachViewerLiked([post], req.user?.id);

    const comments = await db.query(
      `SELECT comments.id, comments.text, comments.createdAt,
              users.id AS authorId, users.username AS authorUsername
       FROM comments
       JOIN users ON users.id = comments.authorId
       WHERE comments.postId = ?
       ORDER BY comments.createdAt ASC`,
      [req.params.id]
    );

    res.json({ post: withLiked, comments });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load post.' });
  }
});

// POST /api/posts — create a post
router.post('/', requireAuth, upload.single('media'), async (req, res) => {
  try {
    const { title, content, categoryId } = req.body || {};
    if (!title || !title.trim()) {
      if (req.file) removeMediaFile(`/uploads/${req.file.filename}`);
      return res.status(400).json({ error: 'A post needs a title.' });
    }

    const hasContent = typeof content === 'string' && content.trim().length > 0;
    if (!hasContent && !req.file) {
      return res.status(400).json({ error: 'A post needs some text or a media attachment.' });
    }

    let validCategoryId = null;
    if (categoryId) {
      const cat = await db.queryOne('SELECT id FROM categories WHERE id = ?', [categoryId]);
      if (!cat) {
        if (req.file) removeMediaFile(`/uploads/${req.file.filename}`);
        return res.status(400).json({ error: 'Selected category does not exist.' });
      }
      validCategoryId = categoryId;
    }

    const mediaUrl = req.file ? `/uploads/${req.file.filename}` : null;
    const mediaType = req.file ? (req.file.mimetype.startsWith('image/') ? 'image' : 'video') : null;

    const inserted = await db.queryOne(
      'INSERT INTO posts (authorId, categoryId, title, content, mediaType, mediaUrl) VALUES (?, ?, ?, ?, ?, ?) RETURNING id',
      [req.user.id, validCategoryId, title.trim(), (content || '').trim(), mediaType, mediaUrl]
    );
    const post = await db.queryOne(
      `SELECT ${POST_FIELDS}
       FROM posts
       JOIN users ON users.id = posts.authorId
       LEFT JOIN categories ON categories.id = posts.categoryId
       WHERE posts.id = ?`,
      [inserted.id]
    );

    res.status(201).json({ post: { ...post, likedByMe: false } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create post.' });
  }
});

// PUT /api/posts/:id — edit a post
router.put('/:id', requireAuth, upload.single('media'), async (req, res) => {
  try {
    const { title, content, categoryId, removeMedia } = req.body || {};
    if (!title || !title.trim()) {
      if (req.file) removeMediaFile(`/uploads/${req.file.filename}`);
      return res.status(400).json({ error: 'A post needs a title.' });
    }

    const existing = await db.queryOne('SELECT authorId, mediaUrl, mediaType FROM posts WHERE id = ?', [req.params.id]);
    if (!existing) {
      if (req.file) removeMediaFile(`/uploads/${req.file.filename}`);
      return res.status(404).json({ error: 'That post no longer exists.' });
    }
    if (!isAuthorOrAdmin(existing.authorId, req.user)) {
      if (req.file) removeMediaFile(`/uploads/${req.file.filename}`);
      return res.status(403).json({ error: 'You can only edit your own posts.' });
    }

    const hasContent = typeof content === 'string' && content.trim().length > 0;
    const hasMedia = Boolean(req.file) || (removeMedia === 'true' ? false : Boolean(existing.mediaUrl));
    if (!hasContent && !hasMedia) {
      if (req.file) removeMediaFile(`/uploads/${req.file.filename}`);
      return res.status(400).json({ error: 'A post needs some text or a media attachment.' });
    }

    let validCategoryId = null;
    if (categoryId) {
      const cat = await db.queryOne('SELECT id FROM categories WHERE id = ?', [categoryId]);
      if (!cat) {
        if (req.file) removeMediaFile(`/uploads/${req.file.filename}`);
        return res.status(400).json({ error: 'Selected category does not exist.' });
      }
      validCategoryId = categoryId;
    }

    let mediaUrl = existing.mediaUrl;
    let mediaType = existing.mediaType;
    if (req.file) {
      if (existing.mediaUrl) removeMediaFile(existing.mediaUrl);
      mediaUrl = `/uploads/${req.file.filename}`;
      mediaType = req.file.mimetype.startsWith('image/') ? 'image' : 'video';
    } else if (removeMedia === 'true' && existing.mediaUrl) {
      removeMediaFile(existing.mediaUrl);
      mediaUrl = null;
      mediaType = null;
    }

    await db.run(
      'UPDATE posts SET categoryId = ?, title = ?, content = ?, mediaType = ?, mediaUrl = ? WHERE id = ?',
      [validCategoryId, title.trim(), (content || '').trim(), mediaType, mediaUrl, req.params.id]
    );

    const post = await db.queryOne(
      `SELECT ${POST_FIELDS}
       FROM posts
       JOIN users ON users.id = posts.authorId
       LEFT JOIN categories ON categories.id = posts.categoryId
       WHERE posts.id = ?`,
      [req.params.id]
    );
    const [withLiked] = await attachViewerLiked([post], req.user.id);
    res.json({ post: withLiked });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update post.' });
  }
});

// DELETE /api/posts/:id
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const existing = await db.queryOne('SELECT authorId, mediaUrl FROM posts WHERE id = ?', [req.params.id]);
    if (!existing) return res.status(404).json({ error: 'That post no longer exists.' });
    if (!isAuthorOrAdmin(existing.authorId, req.user))
      return res.status(403).json({ error: 'You can only delete your own posts.' });

    await db.run('DELETE FROM posts WHERE id = ?', [req.params.id]);
    if (existing.mediaUrl) removeMediaFile(existing.mediaUrl);
    res.status(204).end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete post.' });
  }
});

// POST /api/posts/:id/like — toggle
router.post('/:id/like', requireAuth, async (req, res) => {
  try {
    const post = await db.queryOne('SELECT id FROM posts WHERE id = ?', [req.params.id]);
    if (!post) return res.status(404).json({ error: 'That post no longer exists.' });

    const existing = await db.queryOne(
      'SELECT id FROM likes WHERE userId = ? AND postId = ?',
      [req.user.id, req.params.id]
    );

    let liked;
    if (existing) {
      await db.run('DELETE FROM likes WHERE id = ?', [existing.id]);
      liked = false;
    } else {
      await db.run('INSERT INTO likes (userId, postId) VALUES (?, ?)', [req.user.id, req.params.id]);
      liked = true;
    }

    const countRow = await db.queryOne('SELECT COUNT(*) AS n FROM likes WHERE postId = ?', [req.params.id]);
    res.json({ liked, likeCount: Number(countRow.n) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to toggle like.' });
  }
});

// POST /api/posts/:id/comments — add a comment
router.post('/:id/comments', requireAuth, async (req, res) => {
  try {
    const { text } = req.body || {};
    if (!text || !text.trim()) return res.status(400).json({ error: 'Comment text can\u2019t be empty.' });

    const post = await db.queryOne('SELECT id FROM posts WHERE id = ?', [req.params.id]);
    if (!post) return res.status(404).json({ error: 'That post no longer exists.' });

    const inserted = await db.queryOne(
      'INSERT INTO comments (postId, authorId, text) VALUES (?, ?, ?) RETURNING id',
      [req.params.id, req.user.id, text.trim()]
    );
    const comment = await db.queryOne(
      `SELECT comments.id, comments.text, comments.createdAt,
              users.id AS authorId, users.username AS authorUsername
       FROM comments JOIN users ON users.id = comments.authorId
       WHERE comments.id = ?`,
      [inserted.id]
    );

    res.status(201).json({ comment });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to add comment.' });
  }
});

// PUT /api/posts/:id/comments/:commentId — edit a comment
router.put('/:id/comments/:commentId', requireAuth, async (req, res) => {
  try {
    const { text } = req.body || {};
    if (!text || !text.trim()) return res.status(400).json({ error: 'Comment text can\u2019t be empty.' });

    const comment = await db.queryOne(
      'SELECT id, postId, authorId FROM comments WHERE id = ? AND postId = ?',
      [req.params.commentId, req.params.id]
    );
    if (!comment) return res.status(404).json({ error: 'That comment no longer exists.' });
    if (!isAuthorOrAdmin(comment.authorId, req.user))
      return res.status(403).json({ error: 'You can only edit your own comments.' });

    await db.run('UPDATE comments SET text = ? WHERE id = ?', [text.trim(), req.params.commentId]);

    const updatedComment = await db.queryOne(
      `SELECT comments.id, comments.text, comments.createdAt,
              users.id AS authorId, users.username AS authorUsername
       FROM comments JOIN users ON users.id = comments.authorId
       WHERE comments.id = ?`,
      [req.params.commentId]
    );

    res.json({ comment: updatedComment });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update comment.' });
  }
});

// DELETE /api/posts/:id/comments/:commentId
router.delete('/:id/comments/:commentId', requireAuth, async (req, res) => {
  try {
    const comment = await db.queryOne(
      'SELECT id, postId, authorId FROM comments WHERE id = ? AND postId = ?',
      [req.params.commentId, req.params.id]
    );
    if (!comment) return res.status(404).json({ error: 'That comment no longer exists.' });
    if (!isAuthorOrAdmin(comment.authorId, req.user))
      return res.status(403).json({ error: 'You can only delete your own comments.' });

    await db.run('DELETE FROM comments WHERE id = ?', [req.params.commentId]);
    res.status(204).end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete comment.' });
  }
});

module.exports = router;