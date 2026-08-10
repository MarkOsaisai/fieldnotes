// server/routes/auth.js
// Phase 2.1: User Identity (Auth) — /register and /login

const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');
const { JWT_SECRET } = require('../middleware/auth');

const router = express.Router();

function signToken(user) {
  return jwt.sign(
    { id: user.id, username: user.username, role: user.role },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

function publicUser(user) {
  return { id: user.id, username: user.username, email: user.email, role: user.role };
}

router.post('/register', async (req, res) => {
  const { username, email, password } = req.body || {};

  if (!username || !email || !password) {
    return res.status(400).json({ error: 'Username, email, and password are all required.' });
  }
  if (!/^\S+@\S+\.\S+$/.test(email)) {
    return res.status(400).json({ error: 'That email address doesn\u2019t look right.' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'Password needs to be at least 8 characters.' });
  }

  const existing = db.prepare('SELECT id FROM users WHERE username = ? OR email = ?').get(username, email);
  if (existing) {
    return res.status(409).json({ error: 'That username or email is already taken.' });
  }

  // First registered user becomes admin automatically, so there's always
  // someone able to manage the gallery. Everyone after that is standard.
  const userCount = db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
  const role = userCount === 0 ? 'admin' : 'standard';

  const passwordHash = await bcrypt.hash(password, 10);
  const info = db
    .prepare('INSERT INTO users (username, email, passwordHash, role) VALUES (?, ?, ?, ?)')
    .run(username, email, passwordHash, role);

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(Number(info.lastInsertRowid));
  const token = signToken(user);
  res.status(201).json({ token, user: publicUser(user) });
});

router.post('/login', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username) {
    return res.status(400).json({ error: 'Username required.' });
  }
  if (!password) {
    return res.status(400).json({ error: 'password required.' });
  }

  const user = db
    .prepare('SELECT * FROM users WHERE username = ? OR email = ?')
    .get(username, username);
  if (!user) return res.status(401).json({ error: 'Incorrect username or password.' });

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return res.status(401).json({ error: 'Incorrect username or password.' });

  const token = signToken(user);
  res.json({ token, user: publicUser(user) });
});

module.exports = router;
