// controllers/authController.js
// Handles user registration, authentication, profile inspection, and updates

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool } = require('../config/db');
const { logActivity } = require('../utils/logger');

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET environment variable is not set.');
  return secret;
}
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

function createToken(user) {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user.role,
      user_type: user.user_type,
      full_name: user.full_name
    },
    getJwtSecret(),
    { expiresIn: JWT_EXPIRES_IN }
  );
}

// User registration
async function register(req, res, next) {
  try {
    const { full_name, email, phone, password, user_type, department, college } = req.body;

    if (!full_name || !email || !phone || !password) {
      return res.status(400).json({
        success: false,
        message: 'Name, email, phone number, and password are required fields.'
      });
    }

    const cleanEmail = email.trim().toLowerCase();

    // Check email uniqueness
    const [existing] = await pool.query('SELECT id FROM users WHERE email = ?', [cleanEmail]);
    if (existing.length > 0) {
      return res.status(409).json({
        success: false,
        message: 'An account with this email address already exists. Please log in.'
      });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const validUserType = ['STUDENT', 'FACULTY', 'STAFF'].includes(user_type) ? user_type : 'STUDENT';

    const [result] = await pool.query(
      `INSERT INTO users (full_name, email, phone, password_hash, role, user_type, department, college)
       VALUES (?, ?, ?, ?, 'USER', ?, ?, ?)`,
      [
        full_name.trim(),
        cleanEmail,
        phone.trim(),
        passwordHash,
        validUserType,
        department ? department.trim() : null,
        college ? college.trim() : null
      ]
    );

    const userId = result.insertId;

    const [newUser] = await pool.query(
      'SELECT id, full_name, email, phone, role, user_type, department, college, created_at FROM users WHERE id = ?',
      [userId]
    );

    const token = createToken(newUser[0]);
    await logActivity(userId, 'USER_REGISTER', `New user registered: ${full_name} (${cleanEmail})`);

    // Welcome notification
    await pool.query(
      `INSERT INTO notifications (user_id, title, message)
       VALUES (?, ?, ?)`,
      [
        userId,
        'Welcome to Smart Campus Lost & Found!',
        'You can now report lost or found items, view smart AI matches, and file claims directly from your campus dashboard.'
      ]
    );

    res.status(201).json({
      success: true,
      message: 'Registration successful! Welcome to Smart Campus Lost & Found.',
      token,
      user: newUser[0]
    });
  } catch (error) {
    next(error);
  }
}

// User login
async function login(req, res, next) {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required.'
      });
    }

    const cleanEmail = email.trim().toLowerCase();

    const [users] = await pool.query(
      'SELECT id, full_name, email, phone, password_hash, role, user_type, department, college, created_at FROM users WHERE email = ?',
      [cleanEmail]
    );

    if (users.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password credentials.'
      });
    }

    const user = users[0];
    const isMatch = await bcrypt.compare(password, user.password_hash);

    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password credentials.'
      });
    }

    const token = createToken(user);
    await logActivity(user.id, 'USER_LOGIN', `User logged in: ${user.email}`);

    // Exclude password hash from response
    delete user.password_hash;

    res.json({
      success: true,
      message: `Welcome back, ${user.full_name}!`,
      token,
      user
    });
  } catch (error) {
    next(error);
  }
}

// Get current profile
async function getMe(req, res, next) {
  try {
    const [users] = await pool.query(
      `SELECT id, full_name, email, phone, role, user_type, department, college, created_at, updated_at
       FROM users WHERE id = ?`,
      [req.user.id]
    );

    if (users.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Stats for profile
    const [itemStats] = await pool.query(
      `SELECT 
        COUNT(CASE WHEN type = 'LOST' THEN 1 END) as lost_count,
        COUNT(CASE WHEN type = 'FOUND' THEN 1 END) as found_count
       FROM items WHERE user_id = ?`,
      [req.user.id]
    );

    const [claimStats] = await pool.query(
      'SELECT COUNT(*) as claims_count FROM claims WHERE claimant_id = ?',
      [req.user.id]
    );

    res.json({
      success: true,
      user: users[0],
      stats: {
        lost_items: itemStats[0].lost_count || 0,
        found_items: itemStats[0].found_count || 0,
        claims: claimStats[0].claims_count || 0
      }
    });
  } catch (error) {
    next(error);
  }
}

// Update profile
async function updateProfile(req, res, next) {
  try {
    const { full_name, phone, department, college } = req.body;

    await pool.query(
      `UPDATE users SET
         full_name = COALESCE(?, full_name),
         phone = COALESCE(?, phone),
         department = COALESCE(?, department),
         college = COALESCE(?, college)
       WHERE id = ?`,
      [full_name, phone, department, college, req.user.id]
    );

    const [updated] = await pool.query(
      'SELECT id, full_name, email, phone, role, user_type, department, college FROM users WHERE id = ?',
      [req.user.id]
    );

    await logActivity(req.user.id, 'PROFILE_UPDATE', 'User updated profile information.');

    res.json({
      success: true,
      message: 'Profile updated successfully!',
      user: updated[0]
    });
  } catch (error) {
    next(error);
  }
}

// Demo accounts endpoint for instant test/evaluation
async function getDemoAccounts(req, res) {
  res.json({
    success: true,
    accounts: [
      {
        role: 'ADMIN',
        label: 'Campus Security Administrator',
        email: 'admin@campus.edu',
        password: 'Admin@123',
        description: 'Full access to admin overview, claim approval, and user directory.'
      },
      {
        role: 'USER',
        label: 'Student (Alex Carter)',
        email: 'student@campus.edu',
        password: 'Student@123',
        description: 'Has reported lost items with active high-similarity smart matches & claims.'
      },
      {
        role: 'USER',
        label: 'Student (Sophia Sharma)',
        email: 'sophia@campus.edu',
        password: 'Student@123',
        description: 'Has reported found items (Dell bag, Casio calculator).'
      }
    ]
  });
}

module.exports = {
  register,
  login,
  getMe,
  updateProfile,
  getDemoAccounts
};
