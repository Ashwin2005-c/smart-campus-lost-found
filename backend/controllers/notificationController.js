// controllers/notificationController.js
// Handles user alerts and notifications for matches, claims, and status changes

const { pool } = require('../config/db');

// Get notifications for current user
async function getNotifications(req, res, next) {
  try {
    const userId = req.user.id;

    const [notifications] = await pool.query(
      `SELECT id, user_id, title, message, is_read, created_at
       FROM notifications
       WHERE user_id = ?
       ORDER BY created_at DESC
       LIMIT 50`,
      [userId]
    );

    const [unread] = await pool.query(
      'SELECT COUNT(*) as unread_count FROM notifications WHERE user_id = ? AND is_read = FALSE',
      [userId]
    );

    res.json({
      success: true,
      notifications,
      unreadCount: unread[0] ? unread[0].unread_count : 0
    });
  } catch (error) {
    next(error);
  }
}

// Mark single notification as read
async function markAsRead(req, res, next) {
  try {
    const { id } = req.params;
    await pool.query(
      'UPDATE notifications SET is_read = TRUE WHERE id = ? AND user_id = ?',
      [id, req.user.id]
    );

    res.json({ success: true, message: 'Notification marked as read.' });
  } catch (error) {
    next(error);
  }
}

// Mark all notifications as read
async function markAllAsRead(req, res, next) {
  try {
    await pool.query(
      'UPDATE notifications SET is_read = TRUE WHERE user_id = ?',
      [req.user.id]
    );

    res.json({ success: true, message: 'All notifications marked as read.' });
  } catch (error) {
    next(error);
  }
}

// Delete notification
async function deleteNotification(req, res, next) {
  try {
    const { id } = req.params;
    await pool.query(
      'DELETE FROM notifications WHERE id = ? AND user_id = ?',
      [id, req.user.id]
    );

    res.json({ success: true, message: 'Notification removed.' });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getNotifications,
  markAsRead,
  markAllAsRead,
  deleteNotification
};
