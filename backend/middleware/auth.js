// middleware/auth.js
// Authentication & Role-Based Access Control Middleware

const jwt = require('jsonwebtoken');
const { pool } = require('../config/db');

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET environment variable is not set. Cannot verify tokens.');
  }
  return secret;
}

// Require authenticated user
async function authenticateToken(req, res, next) {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.startsWith('Bearer ')
      ? authHeader.split(' ')[1]
      : null;

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Access denied. Authentication token required.'
      });
    }

    const decoded = jwt.verify(token, getJwtSecret());

    // Verify user still exists in database
    const [users] = await pool.query(
      'SELECT id, full_name, email, phone, role, user_type, department, college FROM users WHERE id = ?',
      [decoded.id]
    );

    if (users.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Session invalid. User account no longer exists.'
      });
    }

    req.user = users[0];
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Session expired. Please log in again.'
      });
    }
    return res.status(403).json({
      success: false,
      message: 'Invalid or forged token.'
    });
  }
}

// Optional authentication (for public browsing where owner status can be determined if logged in)
async function optionalAuth(req, res, next) {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.startsWith('Bearer ')
      ? authHeader.split(' ')[1]
      : null;

    if (!token) {
      req.user = null;
      return next();
    }

    const decoded = jwt.verify(token, getJwtSecret());
    const [users] = await pool.query(
      'SELECT id, full_name, email, phone, role, user_type FROM users WHERE id = ?',
      [decoded.id]
    );

    req.user = users.length > 0 ? users[0] : null;
    next();
  } catch (error) {
    req.user = null;
    next();
  }
}

// Role authorization
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required for this operation.'
      });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `Forbidden. Requires one of roles: ${roles.join(', ')}`
      });
    }

    next();
  };
}

module.exports = {
  authenticateToken,
  optionalAuth,
  requireRole
};
