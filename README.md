# Fieldnotes

A full-stack community app built from the project guide: posts, comments,
likes, a "Popular" feed filter, and an admin-managed participant gallery.

## Stack

- **Backend:** Node.js + Express, SQLite via Node's **built-in** `node:sqlite`
  module (requires Node 22.5+ — no native compiler, Python, or Visual Studio
  needed, unlike `better-sqlite3`), JWT auth, `bcryptjs` for password
  hashing, `multer` for image uploads.
- **Frontend:** Vanilla HTML/CSS/JS single-page app — no build step, no
  framework. Hash-based routing (`#/feed`, `#/gallery`, `#/post/:id`, etc).
- **Storage:** SQLite file at `server/data/fieldnotes.db` (created
  automatically). Gallery images are saved to `server/uploads/` and served at
  `/uploads/*`, standing in for a cloud bucket — see "Swapping in real cloud
  storage" below.

## Run it

```bash
npm install
npm start
```

Then open **http://localhost:3000**.

The **first account you register automatically becomes an admin** (so
there's always someone who can manage the gallery). Everyone after that is a
standard user. You can promote more admins later by editing the `role`
column in `server/data/fieldnotes.db`.

## What's implemented (mapped to the guide's phases)

**Phase 1 — Database:** five tables — `users`, `posts`, `comments`, `likes`,
`participants` — with foreign keys and a unique constraint on `(userId,
postId)` in `likes` to prevent duplicate likes. See `server/db.js`.

**Phase 2 — Backend:**
- `POST /api/auth/register`, `POST /api/auth/login` — bcrypt-hashed
  passwords, JWTs returned on success (`server/routes/auth.js`).
- `requireAuth` middleware protects all write routes; `requireAdmin` adds
  RBAC on top for gallery writes (`server/middleware/auth.js`).
- `POST /api/posts`, `POST /api/posts/:id/like` (toggle),
  `POST /api/posts/:id/comments` (`server/routes/posts.js`).
- `GET /api/posts?filter=popular` sorts by likes received in the last 7
  days first, falling back to total like count, so older posts don't
  permanently dominate the feed.
- `GET/POST/PUT/DELETE /api/gallery` — reads are public, writes require the
  `admin` role; images go through `multer` (`server/routes/gallery.js`).

**Phase 3 — Frontend:**
- Global auth state kept in `localStorage` + an in-memory `state` object in
  `public/app.js`; the header swaps "Log in / Join" for the username, an
  admin badge, "New post", and "Log out" once signed in.
- Feed view with a Recent/Popular toggle, a single-post view with a comment
  thread and inline comment form, and a gallery grid that only shows
  Add/Edit/Delete controls when `currentUser.role === 'admin'`.
- Client-side validation on register (email format, 8-character minimum
  password) before hitting the API.

**Phase 4 — Build order:** the code is structured in the same sequence the
guide recommends (auth → posts → engagement → popular filter → gallery), so
each layer builds cleanly on the one before it.

## Troubleshooting

- **`ExperimentalWarning: SQLite is an experimental feature`** printed on
  startup is harmless — `node:sqlite` is stable enough to use but not yet
  marked fully stable by Node itself. The app works fine despite the
  warning.
- **`node:sqlite` not found / import error** means your Node version is
  older than 22.5. Run `node -v` to check, then install a current LTS from
  nodejs.org (this avoids the native-compiler headaches of packages like
  `better-sqlite3`, which need Python + Visual Studio's C++ workload on
  Windows to install).

## Swapping in real cloud storage

`server/routes/gallery.js` currently uses `multer.diskStorage` to write
files to `server/uploads/`. To use AWS S3 or Cloudinary instead:

1. Install `multer-s3` (or the Cloudinary storage adapter).
2. Replace the `storage` object in `gallery.js` with the S3/Cloudinary
   storage engine, pointed at your bucket/credentials (via environment
   variables, not hardcoded).
3. Save the returned remote URL as `imageUrl` instead of `/uploads/...`.

Nothing else in the app needs to change — the rest of the code only cares
that `imageUrl` is a URL it can put in an `<img src>`.

## Notes / things to harden before real deployment

- Set a real `JWT_SECRET` via a `.env` file (see `dotenv` already wired in)
  instead of the dev default.
- Add rate limiting on `/api/auth/login` and `/api/auth/register`.
- Add pagination to the feed and gallery once post/participant counts grow
  past ~100.
