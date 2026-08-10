// server/middleware/auth.js
// Protects content-creation routes and enforces Role-Based Access Control (RBAC).

const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';

// Requires a valid token. Attaches req.user = { id, username, role }.
function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Log in to do that.' });

  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Your session expired. Log in again.' });
  }
}

// Attaches req.user if a valid token is present, but never blocks the request.
function optionalAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return next();
  try {
    req.user = jwt.verify(token, JWT_SECRET);
  } catch {
    // ignore invalid/expired token for optional routes
  }
  next();
}

// Must be used after requireAuth. Blocks anyone who isn't an admin.
function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admins only.' });
  }
  next();
}

module.exports = { requireAuth, optionalAuth, requireAdmin, JWT_SECRET };
