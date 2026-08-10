// server/storage-config.js
// Storage configuration abstraction
// Supports both local file storage and Cloudinary cloud storage
// Note: Cloudinary packages are optional and only required if CLOUDINARY_CLOUD_NAME is set

const path = require('path');
const fs = require('fs');
const multer = require('multer');

const STORAGE_TYPE = process.env.CLOUDINARY_CLOUD_NAME ? 'cloudinary' : 'local';

let storage;

if (STORAGE_TYPE === 'cloudinary') {
  // Cloudinary configuration for production
  try {
    const cloudinary = require('cloudinary').v2;
    const { CloudinaryStorage } = require('multer-storage-cloudinary');

    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
    });

    if (!process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
      throw new Error('Cloudinary API credentials (CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET) are required when CLOUDINARY_CLOUD_NAME is set');
    }

    storage = new CloudinaryStorage({
      cloudinary,
      folder: 'fieldnotes-gallery',
      allowed_formats: ['jpg', 'png', 'jpeg', 'gif', 'webp'],
      resource_type: 'auto',
    });

    console.log('✓ Using Cloudinary for gallery storage');
  } catch (err) {
    console.error('❌ Failed to initialize Cloudinary:', err.message);
    console.error('Install Cloudinary packages: npm install cloudinary multer-storage-cloudinary');
    console.error('Falling back to local storage.');
    // Continue to local storage fallback
  }
}

if (STORAGE_TYPE === 'local' || !storage) {
  // Local file storage configuration
  const uploadDir = path.join(__dirname, 'uploads');
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }

  storage = multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
      const ext = path.extname(file.originalname);
      const name = path.basename(file.originalname, ext);
      cb(null, `${name}-${uniqueSuffix}${ext}`);
    },
  });

  if (STORAGE_TYPE === 'local') {
    console.log('⚠  Using local file storage for gallery uploads (not persistent on Vercel)');
  }
}

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const allowedMimes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only JPEG, PNG, GIF, and WebP images are allowed'), false);
    }
  },
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
});

module.exports = {
  type: STORAGE_TYPE === 'cloudinary' && storage ? 'cloudinary' : 'local',
  upload,
  getFileUrl: (file) => {
    if (STORAGE_TYPE === 'cloudinary' && file.path) {
      // Cloudinary provides the full URL in file.path
      return file.path;
    } else {
      // Local storage: construct URL from filename
      return `/uploads/${file.filename}`;
    }
  },
};
