// controllers/adminController.js
// Handles administrative statistics, user management, and system audit logs

const { pool } = require('../config/db');
const { logActivity } = require('../utils/logger');

// Overview statistics for administrative dashboard
async function getDashboardStats(req, res, next) {
  try {
    const [counts] = await pool.query(
      `SELECT 
        COUNT(*) AS total_items,
        COUNT(CASE WHEN type = 'LOST' THEN 1 END) AS total_lost,
        COUNT(CASE WHEN type = 'FOUND' THEN 1 END) AS total_found,
        COUNT(CASE WHEN status IN ('RECOVERED', 'CLAIMED') THEN 1 END) AS resolved_items,
        COUNT(CASE WHEN status = 'ACTIVE' THEN 1 END) AS active_items,
        COUNT(CASE WHEN status = 'MATCHED' THEN 1 END) AS matched_items
       FROM items`
    );

    const [userCounts] = await pool.query(
      `SELECT 
        COUNT(*) AS total_users,
        COUNT(CASE WHEN role = 'ADMIN' THEN 1 END) AS admin_users,
        COUNT(CASE WHEN user_type = 'STUDENT' THEN 1 END) AS students,
        COUNT(CASE WHEN user_type = 'FACULTY' THEN 1 END) AS faculty,
        COUNT(CASE WHEN user_type = 'STAFF' THEN 1 END) AS staff
       FROM users`
    );

    const [claimsCounts] = await pool.query(
      `SELECT 
        COUNT(*) AS total_claims,
        COUNT(CASE WHEN status = 'PENDING' THEN 1 END) AS pending_claims,
        COUNT(CASE WHEN status = 'APPROVED' THEN 1 END) AS approved_claims,
        COUNT(CASE WHEN status = 'REJECTED' THEN 1 END) AS rejected_claims
       FROM claims`
    );

    const [matchCounts] = await pool.query(
      `SELECT 
        COUNT(*) AS total_matches,
        COUNT(CASE WHEN match_level = 'HIGH' THEN 1 END) AS high_matches,
        COUNT(CASE WHEN match_level = 'MEDIUM' THEN 1 END) AS medium_matches
       FROM matches`
    );

    // Category distribution
    const [categoryDistribution] = await pool.query(
      `SELECT c.name, COUNT(i.id) AS count
       FROM categories c
       LEFT JOIN items i ON c.id = i.category_id
       GROUP BY c.id, c.name
       ORDER BY count DESC`
    );

    // Recent claims
    const [recentClaims] = await pool.query(
      `SELECT 
        cl.id, cl.status, cl.created_at,
        i.item_name, i.type,
        u.full_name AS claimant_name
       FROM claims cl
       JOIN items i ON cl.item_id = i.id
       JOIN users u ON cl.claimant_id = u.id
       ORDER BY cl.created_at DESC
       LIMIT 5`
    );

    // Recent activity logs
    const [recentLogs] = await pool.query(
      `SELECT al.id, al.action, al.description, al.created_at, u.full_name AS user_name
       FROM activity_logs al
       LEFT JOIN users u ON al.user_id = u.id
       ORDER BY al.created_at DESC
       LIMIT 10`
    );

    res.json({
      success: true,
      stats: {
        items: counts[0],
        users: userCounts[0],
        claims: claimsCounts[0],
        matches: matchCounts[0],
        resolutionRate: counts[0].total_items > 0
          ? Math.round((counts[0].resolved_items / counts[0].total_items) * 100)
          : 0,
        categoryDistribution,
        recentClaims,
        recentLogs
      }
    });
  } catch (error) {
    next(error);
  }
}

// Get all users with their activity metrics
async function getAllUsers(req, res, next) {
  try {
    const [users] = await pool.query(
      `SELECT 
        u.id, u.full_name, u.email, u.phone, u.role, u.user_type,
        u.department, u.college, u.created_at,
        COUNT(DISTINCT CASE WHEN i.type = 'LOST' THEN i.id END) AS lost_reported,
        COUNT(DISTINCT CASE WHEN i.type = 'FOUND' THEN i.id END) AS found_reported,
        COUNT(DISTINCT cl.id) AS claims_filed
       FROM users u
       LEFT JOIN items i ON u.id = i.user_id
       LEFT JOIN claims cl ON u.id = cl.claimant_id
       GROUP BY u.id
       ORDER BY u.created_at DESC`
    );

    res.json({
      success: true,
      users
    });
  } catch (error) {
    next(error);
  }
}

// Update user role (e.g. promote to ADMIN or revoke)
async function updateUserRole(req, res, next) {
  try {
    const { id } = req.params;
    const { role } = req.body;

    if (!['USER', 'ADMIN'].includes(role)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid role. Must be USER or ADMIN.'
      });
    }

    if (parseInt(id, 10) === req.user.id && role !== 'ADMIN') {
      return res.status(400).json({
        success: false,
        message: 'You cannot revoke your own administrator privileges.'
      });
    }

    await pool.query('UPDATE users SET role = ? WHERE id = ?', [role, id]);
    await logActivity(req.user.id, 'USER_ROLE_CHANGE', `Updated user #${id} role to ${role}`);

    res.json({
      success: true,
      message: `User role updated to ${role}`
    });
  } catch (error) {
    next(error);
  }
}

// View audit logs with pagination
async function getActivityLogs(req, res, next) {
  try {
    const { page = 1, limit = 50 } = req.query;

    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10)));
    const offsetNum = (Math.max(1, parseInt(page, 10)) - 1) * limitNum;

    const [logs] = await pool.query(
      `SELECT al.id, al.action, al.description, al.created_at,
              u.full_name AS user_name, u.email AS user_email, u.role AS user_role
       FROM activity_logs al
       LEFT JOIN users u ON al.user_id = u.id
       ORDER BY al.created_at DESC
       LIMIT ? OFFSET ?`,
      [limitNum, offsetNum]
    );

    const [countRows] = await pool.query('SELECT COUNT(*) AS total FROM activity_logs');
    const total = countRows[0].total;

    res.json({
      success: true,
      logs,
      pagination: {
        total,
        page: parseInt(page, 10),
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum)
      }
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getDashboardStats,
  getAllUsers,
  updateUserRole,
  getActivityLogs
};
