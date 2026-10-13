// middleware/upload.js
// Handles secure file uploads for item images.
//
// HOW IT WORKS:
//   - If CLOUDINARY_CLOUD_NAME is set in environment: uploads images to Cloudinary (persistent cloud storage)
//     Uses multer memoryStorage + Cloudinary v2 SDK upload_stream (no vulnerable packages needed)
//   - If Cloudinary is NOT configured: falls back to local disk storage in uploads/ folder
//     (WARNING: local uploads are LOST on Render restarts. Only use locally.)

const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { Readable } = require('stream');

// ----------------------------------------------------------------
// Shared file validation
// ----------------------------------------------------------------
const ALLOWED_MIME = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif'
];

const fileFilter = (req, file, cb) => {
  if (ALLOWED_MIME.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only JPEG, PNG, WEBP, and GIF images are permitted.'));
  }
};

const maxMb = parseInt(process.env.MAX_FILE_SIZE_MB || '5', 10);
const fileSizeLimit = maxMb * 1024 * 1024;

// ----------------------------------------------------------------
// Check if Cloudinary credentials are configured
// ----------------------------------------------------------------
const useCloudinary = !!(
  process.env.CLOUDINARY_CLOUD_NAME &&
  process.env.CLOUDINARY_API_KEY &&
  process.env.CLOUDINARY_API_SECRET
);

let cloudinary = null;

if (useCloudinary) {
  try {
    cloudinary = require('cloudinary').v2;
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
      secure: true
    });
    console.log('✅ Cloudinary image storage configured (cloud_name: ' + process.env.CLOUDINARY_CLOUD_NAME + ')');
  } catch (err) {
    console.error('⚠️ Failed to initialize Cloudinary:', err.message);
  }
}

// ----------------------------------------------------------------
// Multer config:
// - Use memoryStorage when Cloudinary is enabled (we stream the buffer)
// - Use diskStorage as fallback for local development
// ----------------------------------------------------------------
let multerConfig;

if (useCloudinary && cloudinary) {
  // Memory storage: file is available as req.file.buffer
  multerConfig = multer({
    storage: multer.memoryStorage(),
    fileFilter,
    limits: { fileSize: fileSizeLimit }
  });
} else {
  // Local disk storage fallback
  const uploadDir = path.join(__dirname, '..', 'uploads');
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }
  const diskStorage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
      cb(null, `item-${uniqueSuffix}${ext}`);
    }
  });
  multerConfig = multer({
    storage: diskStorage,
    fileFilter,
    limits: { fileSize: fileSizeLimit }
  });

  if (process.env.NODE_ENV === 'production') {
    console.warn('⚠️  WARNING: Using local disk storage in production. Images will NOT persist across Render restarts.');
    console.warn('   Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET to enable persistent storage.');
  }
}

// ----------------------------------------------------------------
// Cloudinary upload helper (used by controllers after multer runs)
// If Cloudinary is configured, upload the buffer and return the secure URL.
// Otherwise return null (controller uses local path).
// ----------------------------------------------------------------
async function uploadToCloudinary(fileBuffer, mimetype) {
  if (!useCloudinary || !cloudinary) return null;

  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: 'smart-campus-lost-found',
        resource_type: 'image',
        transformation: [{ width: 1200, height: 1200, crop: 'limit', quality: 'auto:good' }]
      },
      (error, result) => {
        if (error) return reject(error);
        resolve(result.secure_url);
      }
    );

    // Convert buffer to readable stream and pipe to Cloudinary
    const bufferStream = new Readable();
    bufferStream.push(fileBuffer);
    bufferStream.push(null);
    bufferStream.pipe(uploadStream);
  });
}

module.exports = {
  upload: multerConfig,
  uploadToCloudinary,
  useCloudinary
};
