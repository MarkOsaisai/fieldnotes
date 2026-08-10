// server/index.js
// Fieldnotes — app entry point.

require('dotenv').config();

// Validate environment variables
const validateEnvironment = require('./env-validator');
validateEnvironment();

const path = require('path');
const express = require('express');

// Touching db.js here ensures the schema is created before any route runs.
require('./db');

const authRoutes = require('./routes/auth');
const postsRoutes = require('./routes/posts');
const galleryRoutes = require('./routes/gallery');
const categoriesRoutes = require('./routes/categories');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Serve the SPA and its static assets.
app.use(express.static(path.join(__dirname, '..', 'public')));

// Serve uploaded gallery images.
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// API routes.
app.use('/api/auth', authRoutes);
app.use('/api/posts', postsRoutes);
app.use('/api/gallery', galleryRoutes);
app.use('/api/categories', categoriesRoutes);

// Fallback: any non-API, non-file request goes to the SPA shell.
// (The frontend uses hash-based routing, so this mainly covers a fresh
// load of "/" and guards against accidental deep-link 404s.)
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/') || req.path.startsWith('/uploads/')) return next();
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// Basic error handler (e.g. multer errors that slip past route-level handling).
app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Something went wrong.' });
});

function listenOn(port) {
  const server = app.listen(port, () => {
    console.log(`Fieldnotes running at http://localhost:${port}`);
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE' && port < 3010) {
      const nextPort = port + 1;
      console.warn(`Port ${port} is busy, trying ${nextPort} instead.`);
      server.close(() => listenOn(nextPort));
    } else {
      throw err;
    }
  });
}

listenOn(Number(PORT));
