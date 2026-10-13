// utils/logger.js
// Asynchronous activity logger for system audits and admin views

const { pool } = require('../config/db');

async function logActivity(userId, action, description) {
  try {
    await pool.query(
      'INSERT INTO activity_logs (user_id, action, description) VALUES (?, ?, ?)',
      [userId || null, action, description || null]
    );
  } catch (err) {
    console.error('Activity log error:', err.message);
  }
}

module.exports = { logActivity };
