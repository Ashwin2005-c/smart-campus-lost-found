// server.js
// Entry point of the backend application for Smart Campus Lost & Found System

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const { testConnection } = require('./config/db');

const app = express();

// ------------------------------------------------------------
// CORS Configuration
// FRONTEND_URL is a comma-separated list of allowed origins.
// Example: http://localhost:5173,https://your-app.onrender.com
// ------------------------------------------------------------
const rawOrigins = process.env.FRONTEND_URL || 'http://localhost:5173';
const allowedOrigins = rawOrigins
  .split(',')
  .map(o => o.trim())
  .filter(Boolean);

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like curl, Postman, or same-origin requests)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error(`CORS: Origin ${origin} not allowed`));
  },
  credentials: true
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve uploaded item images as static files (local fallback when Cloudinary is not configured)
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}
app.use('/uploads', express.static(uploadDir));

// Serve frontend static files from public/
const publicDir = path.join(__dirname, 'public');
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}
app.use(express.static(publicDir));

// ------------------------------------------------------------
// Health check route
// ------------------------------------------------------------
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    message: 'Smart Campus Lost and Found API is running',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// ------------------------------------------------------------
// Route mounting
// ------------------------------------------------------------
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/items', require('./routes/itemRoutes'));
app.use('/api/matches', require('./routes/matchRoutes'));
app.use('/api/claims', require('./routes/claimRoutes'));
app.use('/api/notifications', require('./routes/notificationRoutes'));
app.use('/api/admin', require('./routes/adminRoutes'));

// ------------------------------------------------------------
// SPA Frontend fallback (for web app routing)
// Serves index.html from the public/ directory for any non-API route.
// ------------------------------------------------------------
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/') || req.path.startsWith('/uploads/')) {
    return next();
  }
  const publicIndex = path.join(publicDir, 'index.html');

  if (fs.existsSync(publicIndex)) {
    return res.sendFile(publicIndex);
  }
  next();
});

// ------------------------------------------------------------
// 404 handler for API routes
// ------------------------------------------------------------
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `API route not found: ${req.method} ${req.originalUrl}`
  });
});

// ------------------------------------------------------------
// Global error handler
// ------------------------------------------------------------
app.use((err, req, res, next) => {
  // Don't expose stack traces in production
  const isDev = (process.env.NODE_ENV || 'development') === 'development';
  console.error('Unhandled server error:', err.stack || err.message);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal server error occurred.',
    ...(isDev && { stack: err.stack })
  });
});

// ------------------------------------------------------------
// Start server only after checking DB
// 0.0.0.0 is required by Render and most cloud platforms
// ------------------------------------------------------------
const PORT = parseInt(process.env.PORT || '5000', 10);
const HOST = '0.0.0.0';

async function startServer() {
  try {
    await testConnection();
    app.listen(PORT, HOST, () => {
      console.log(`\n======================================================`);
      console.log(`🚀 Smart Campus Lost & Found System is LIVE!`);
      console.log(`📡 API & Web Server: http://localhost:${PORT}`);
      console.log(`🩺 Health check:      http://localhost:${PORT}/api/health`);
      console.log(`======================================================\n`);
    });
  } catch (err) {
    console.error('Database connection failed on startup:', err.message);
    // Still start server in degraded mode to allow health checks and diagnostics
    app.listen(PORT, HOST, () => {
      console.log(`⚠️  Server running in degraded mode on port ${PORT} (Database pending)`);
    });
  }
}

startServer();

module.exports = app;
