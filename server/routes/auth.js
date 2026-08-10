// server/routes/auth.js
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');
const { JWT_SECRET } = require('../middleware/auth');

const router = express.Router();

function signToken(user) {
  return jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
}

function publicUser(u) {
  return { id: u.id, username: u.username, email: u.email, role: u.role };
}

router.post('/register', async (req, res) => {
  try {
    const { username, email, password } = req.body || {};

    if (!username || !email || !password)
      return res.status(400).json({ error: 'Username, email, and password are all required.' });
    if (!/^\S+@\S+\.\S+$/.test(email))
      return res.status(400).json({ error: 'That email address doesn\u2019t look right.' });
    if (password.length < 8)
      return res.status(400).json({ error: 'Password needs to be at least 8 characters.' });

    const existing = await db.queryOne('SELECT id FROM users WHERE username = ? OR email = ?', [username, email]);
    if (existing) return res.status(409).json({ error: 'That username or email is already taken.' });

    // First registered user becomes admin automatically
    const countRow = await db.queryOne('SELECT COUNT(*) AS n FROM users', []);
    const role = Number(countRow.n) === 0 ? 'admin' : 'standard';

    const passwordHash = await bcrypt.hash(password, 10);
    const inserted = await db.queryOne(
      'INSERT INTO users (username, email, passwordHash, role) VALUES (?, ?, ?, ?) RETURNING id',
      [username, email, passwordHash, role]
    );
    const user = await db.queryOne('SELECT * FROM users WHERE id = ?', [inserted.id]);

    res.status(201).json({ token: signToken(user), user: publicUser(user) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Registration failed.' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (!username) return res.status(400).json({ error: 'Username required.' });
    if (!password) return res.status(400).json({ error: 'Password required.' });

    const user = await db.queryOne('SELECT * FROM users WHERE username = ? OR email = ?', [username, username]);
    if (!user) return res.status(401).json({ error: 'Incorrect username or password.' });

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return res.status(401).json({ error: 'Incorrect username or password.' });

    res.json({ token: signToken(user), user: publicUser(user) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Login failed.' });
  }
});

module.exports = router;
