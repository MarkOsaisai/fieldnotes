# Fieldnotes — Vercel Deployment Guide

This guide explains how to deploy Fieldnotes to Vercel and what to know about the deployment environment.

## Quick Start

1. **Push your code to GitHub** (Vercel integrates with git)
2. **Connect to Vercel** at [vercel.com](https://vercel.com)
3. **Import your repository**
4. **Set environment variables** (see below)
5. **Deploy**

## Important: Database & File Storage

**Fieldnotes now supports both local storage (development) and cloud storage (production):**

### Database Options

**SQLite (Default for local development)**

- Uses Node's built-in `node:sqlite` module
- Requires Node 22.5+
- Data stored in `server/data/fieldnotes.db`
- ⚠️ **Not persistent on Vercel** — database resets on each deployment

**PostgreSQL (Recommended for production)**

- Set `DATABASE_URL` environment variable
- Data persists across deployments
- Recommended services: [Neon](https://neon.tech), [Supabase](https://supabase.com), [AWS RDS](https://aws.amazon.com/rds/)
- ✅ Fully integrated — app auto-detects and connects

### File Upload Options

**Local Storage (Default for development)**

- Stores images in `server/uploads/`
- ⚠️ **Not persistent on Vercel** — images deleted on each deployment
- Only use for local development

**Cloudinary (Recommended for production)**

- Images stored on Cloudinary's CDN
- ✅ Fully integrated — app auto-detects and uses Cloudinary
- Sign up: [Cloudinary](https://cloudinary.com)
- Free tier: 25GB storage/month, perfect for small communities

## Environment Variables

Set these on the Vercel dashboard under **Settings → Environment Variables**:

### Required

- `JWT_SECRET` — A strong random string for signing JWT tokens
  - **Generate:** `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`

### Optional: Database (Production)

- `DATABASE_URL` — PostgreSQL connection string
  - **Format:** `postgresql://user:password@host:port/database`
  - **If not set:** Uses SQLite locally (not persistent on Vercel)
  - **Services:** Neon, Supabase, AWS RDS, etc.

### Optional: File Storage (Production)

- `CLOUDINARY_CLOUD_NAME` — Your Cloudinary cloud name
- `CLOUDINARY_API_KEY` — Your Cloudinary API key
- `CLOUDINARY_API_SECRET` — Your Cloudinary API secret
- **Alternative:** `CLOUDINARY_URL` — Full Cloudinary URL (contains all above)
  - **If not set:** Uses local storage (images will not persist on Vercel)
  - **Service:** Free tier at [Cloudinary](https://cloudinary.com)

### Example Setup

**Local development (.env file):**

```
JWT_SECRET=your-dev-secret-here
# Uses SQLite and local uploads by default
```

**Production on Vercel (dashboard environment variables):**

```
JWT_SECRET=your-prod-secret-here
DATABASE_URL=postgresql://user:pass@neon.tech/fieldnotes
CLOUDINARY_CLOUD_NAME=your-cloud-name
CLOUDINARY_API_KEY=your-api-key
CLOUDINARY_API_SECRET=your-api-secret
```

## Node Version

Fieldnotes requires Node.js 22.5+. Vercel's default Node.js version may be older. To ensure compatibility, set it in `vercel.json` or on the Vercel dashboard:

**Option 1:** Modify `package.json` engines (if needed):

```json
"engines": {
  "node": "22.x"
}
```

**Option 2:** Let Vercel auto-detect from `vercel.json` (already configured).

## Deployment with Git Integration (Recommended)

1. Create a GitHub repository and push your code
2. Go to [vercel.com/new](https://vercel.com/new)
3. Click "Import Git Repository"
4. Select your repo
5. Vercel auto-detects the framework (Express) and configures build settings
6. Add environment variables (JWT_SECRET)
7. Click "Deploy"
8. Future pushes to `main` (or your production branch) will auto-deploy

## Manual Deployment

If you prefer to deploy without git:

```bash
# Install Vercel CLI
npm install -g vercel

# Login to your account
vercel login

# Deploy (from the project root)
vercel

# For production
vercel --prod
```

## Testing Locally Before Deployment

```bash
# Install dependencies
npm install

# Start the dev server
npm start

# Open http://localhost:3000
```

## Monitoring & Logs

View deployment logs and performance:

- **Vercel Dashboard:** https://vercel.com/dashboard
- **Real-time logs:** `vercel logs <deployment-url>`
- **Inspect deployment:** `vercel inspect <deployment-url>`

## Production Checklist

- [ ] Set `JWT_SECRET` on Vercel (required)
- [ ] Set `DATABASE_URL` for PostgreSQL persistence
- [ ] Set Cloudinary credentials (`CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`)
- [ ] Test authentication flow in preview deployment
- [ ] Test gallery upload in preview deployment
- [ ] (Optional) Add rate limiting to `/api/auth/login` and `/api/auth/register`
- [ ] Vercel enables HTTPS automatically ✓

## Troubleshooting

### Environment validation fails at startup

The app validates `JWT_SECRET` and other env vars on startup. Check the build logs on Vercel dashboard to see what's missing.

**Fix:** Set required environment variables in **Settings → Environment Variables**.

### Database is empty after deployment

**Expected if `DATABASE_URL` is not set** — SQLite database doesn't persist on Vercel's ephemeral filesystem.

**Fix:** Set `DATABASE_URL` to a PostgreSQL connection string (Neon, Supabase, etc.)

### Gallery images disappear after redeployment

**Expected if Cloudinary credentials are not set** — local uploads don't persist on Vercel.

**Fix:** Set Cloudinary environment variables:

- `CLOUDINARY_CLOUD_NAME`
- `CLOUDINARY_API_KEY`
- `CLOUDINARY_API_SECRET`

### JWT authentication fails

`JWT_SECRET` might not be set or might be too short (minimum 16 characters recommended).

**Fix:**

1. Verify `JWT_SECRET` is in **Settings → Environment Variables**
2. Regenerate with: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`

### "Cannot find module 'pg'" (PostgreSQL)

The optional `pg` dependency wasn't installed when you set `DATABASE_URL`.

**Fix:** Run `npm install pg` locally, commit, and push to trigger a new Vercel deployment with the correct dependencies.

### "Cannot find module 'cloudinary'" (Cloudinary)

The optional Cloudinary dependencies weren't installed.

**Fix:** Run `npm install cloudinary multer-storage-cloudinary` locally, commit, and push.

## Production Deployment Steps

### Step 1: Set Up Database (Optional but Recommended)

1. Choose a PostgreSQL provider: [Neon](https://neon.tech) (easiest), [Supabase](https://supabase.com), or [AWS RDS](https://aws.amazon.com/rds/)
2. Create a database and get the connection string
3. On Vercel dashboard: Add `DATABASE_URL` environment variable
4. Re-deploy (push to git or run `vercel deploy --prod`)

### Step 2: Set Up Cloud Storage (Optional but Recommended)

1. Sign up at [Cloudinary](https://cloudinary.com) (free tier available)
2. Get your cloud credentials from the Cloudinary console
3. On Vercel dashboard: Add three environment variables:
   - `CLOUDINARY_CLOUD_NAME`
   - `CLOUDINARY_API_KEY`
   - `CLOUDINARY_API_SECRET`
4. Re-deploy

### Step 3: Test and Launch

1. Visit your Vercel deployment URL
2. Create an account (first user becomes admin)
3. Test creating a post and uploading a gallery image
4. Once everything works: deploy to production (`vercel deploy --prod`)

## How Auto-Detection Works

The app automatically detects which services to use based on environment variables:

```javascript
if (process.env.DATABASE_URL) {
  // Use PostgreSQL
} else {
  // Use SQLite (local development)
}

if (process.env.CLOUDINARY_CLOUD_NAME) {
  // Use Cloudinary
} else {
  // Use local file storage
}
```

No code changes needed — just set environment variables!

## Resources

- [Vercel Documentation](https://vercel.com/docs)
- [Vercel Node.js Runtime](https://vercel.com/docs/functions/serverless-functions/runtimes/node-js)
- [Environment Variables on Vercel](https://vercel.com/docs/projects/environment-variables)
- [Node.js SQLite Migration Guide](https://www.sqlite.org/cli.html)
