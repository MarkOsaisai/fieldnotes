// server/env-validator.js
// Validate required environment variables at startup

const DEFAULT_JWT_SECRET = 'dev-secret-change-me';

function validateEnvironment() {
  const errors = [];
  const warnings = [];

  const rawJwtSecret = process.env.JWT_SECRET;
  const resolvedJwtSecret = rawJwtSecret && rawJwtSecret.trim() ? rawJwtSecret : DEFAULT_JWT_SECRET;
  process.env.JWT_SECRET = resolvedJwtSecret;

  // Required variables
  if (!rawJwtSecret || !rawJwtSecret.trim()) {
    warnings.push('JWT_SECRET is not set. Using the built-in development secret for local testing.');
  } else if (resolvedJwtSecret.length < 16) {
    warnings.push('JWT_SECRET is too short. Use at least 16 characters for security.');
  }

  // Database configuration
  if (process.env.DATABASE_URL) {
    // PostgreSQL mode
    if (!process.env.DATABASE_URL.includes('postgresql') && !process.env.DATABASE_URL.includes('postgres')) {
      warnings.push('DATABASE_URL does not appear to be a valid PostgreSQL connection string.');
    }
    console.log('✓ PostgreSQL mode enabled (DATABASE_URL is set)');
  } else {
    console.log('✓ SQLite mode (local development). Set DATABASE_URL for PostgreSQL.');
  }

  // File storage configuration
  if (process.env.CLOUDINARY_CLOUD_NAME) {
    if (!process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
      warnings.push('CLOUDINARY_CLOUD_NAME is set but CLOUDINARY_API_KEY or CLOUDINARY_API_SECRET are missing.');
    } else {
      console.log('✓ Cloudinary enabled for gallery uploads');
    }
  } else {
    warnings.push('No Cloudinary configured. Gallery uploads will not persist on Vercel. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET for production.');
  }

  // Print results
  if (errors.length > 0) {
    console.error('\n❌ Environment Validation Errors:');
    errors.forEach(err => console.error('  •', err));
    throw new Error('Environment validation failed. Please fix the errors above.');
  }

  if (warnings.length > 0) {
    console.warn('\n⚠️  Environment Warnings:');
    warnings.forEach(warn => console.warn('  •', warn));
  }

  if (errors.length === 0 && warnings.length === 0) {
    console.log('\n✓ Environment validation passed');
  }
}

module.exports = validateEnvironment;
