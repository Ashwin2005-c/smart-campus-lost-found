// controllers/claimController.js
// Handles item ownership claims, verification review, and resolutions

const { pool } = require('../config/db');
const { logActivity } = require('../utils/logger');

// Submit a claim on a found item
async function createClaim(req, res, next) {
  try {
    const { item_id, description, verification_details } = req.body;

    if (!item_id || !description || !verification_details) {
      return res.status(400).json({
        success: false,
        message: 'Item ID, claim description, and verification details (proof of ownership) are required.'
      });
    }

    // Verify item exists and is a FOUND item
    const [items] = await pool.query(
      `SELECT i.*, u.full_name AS finder_name, u.email AS finder_email
       FROM items i
       JOIN users u ON i.user_id = u.id
       WHERE i.id = ?`,
      [item_id]
    );

    if (items.length === 0) {
      return res.status(404).json({ success: false, message: 'Item not found.' });
    }

    const item = items[0];

    if (item.type !== 'FOUND') {
      return res.status(400).json({
        success: false,
        message: 'Claims can only be submitted for FOUND items.'
      });
    }

    if (item.user_id === req.user.id) {
      return res.status(400).json({
        success: false,
        message: 'You cannot submit a claim on an item that you reported finding.'
      });
    }

    if (['CLAIMED', 'RECOVERED', 'CLOSED'].includes(item.status)) {
      return res.status(400).json({
        success: false,
        message: `This item is already ${item.status.toLowerCase()} and cannot accept new claims.`
      });
    }

    // Check if user already submitted a pending claim on this item
    const [existing] = await pool.query(
      "SELECT id FROM claims WHERE item_id = ? AND claimant_id = ? AND status = 'PENDING'",
      [item_id, req.user.id]
    );

    if (existing.length > 0) {
      return res.status(409).json({
        success: false,
        message: 'You already have a pending verification claim on this item.'
      });
    }

    const [result] = await pool.query(
      `INSERT INTO claims (item_id, claimant_id, description, verification_details, status)
       VALUES (?, ?, ?, ?, 'PENDING')`,
      [item_id, req.user.id, description.trim(), verification_details.trim()]
    );

    const claimId = result.insertId;

    await logActivity(
      req.user.id,
      'CLAIM_SUBMITTED',
      `User filed claim #${claimId} on found item "${item.item_name}" (#${item.id})`
    );

    // Notify the finder
    await pool.query(
      `INSERT INTO notifications (user_id, title, message)
       VALUES (?, ?, ?)`,
      [
        item.user_id,
        `New Ownership Claim on "${item.item_name}"`,
        `${req.user.full_name} submitted a claim with ownership verification details for the item you found.`
      ]
    );

    res.status(201).json({
      success: true,
      message: 'Your claim has been submitted! Campus administration and the finder have been notified.',
      claimId
    });
  } catch (error) {
    next(error);
  }
}

// Get claims submitted by the logged-in user
async function getMyClaims(req, res, next) {
  try {
    const [claims] = await pool.query(
      `SELECT 
        cl.id, cl.item_id, cl.description, cl.verification_details,
        cl.status, cl.admin_comment, cl.created_at, cl.updated_at,
        i.item_name, i.location, i.item_date, i.image_url, i.status AS item_status,
        c.name AS category_name,
        finder.full_name AS finder_name, finder.email AS finder_email
       FROM claims cl
       JOIN items i ON cl.item_id = i.id
       JOIN categories c ON i.category_id = c.id
       JOIN users finder ON i.user_id = finder.id
       WHERE cl.claimant_id = ?
       ORDER BY cl.created_at DESC`,
      [req.user.id]
    );

    res.json({
      success: true,
      claims
    });
  } catch (error) {
    next(error);
  }
}

// Get all claims (Admin and campus coordinators)
async function getAllClaims(req, res, next) {
  try {
    const { status, page = 1, limit = 50 } = req.query;

    let querySql = `
      SELECT 
        cl.id, cl.item_id, cl.claimant_id, cl.description, cl.verification_details,
        cl.status, cl.admin_comment, cl.created_at, cl.updated_at,
        i.item_name, i.location, i.item_date, i.image_url, i.status AS item_status,
        c.name AS category_name,
        claimant.full_name AS claimant_name, claimant.email AS claimant_email,
        claimant.phone AS claimant_phone, claimant.user_type AS claimant_type,
        claimant.department AS claimant_department,
        finder.full_name AS finder_name, finder.email AS finder_email
      FROM claims cl
      JOIN items i ON cl.item_id = i.id
      JOIN categories c ON i.category_id = c.id
      JOIN users claimant ON cl.claimant_id = claimant.id
      JOIN users finder ON i.user_id = finder.id
      WHERE 1=1
    `;

    const params = [];
    if (status) {
      querySql += ' AND cl.status = ?';
      params.push(status);
    }

    querySql += ' ORDER BY cl.created_at DESC LIMIT ? OFFSET ?';
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10)));
    const offsetNum = (Math.max(1, parseInt(page, 10)) - 1) * limitNum;
    params.push(limitNum, offsetNum);

    const [claims] = await pool.query(querySql, params);

    res.json({
      success: true,
      claims
    });
  } catch (error) {
    next(error);
  }
}

// Review / Resolve a claim (Approve or Reject)
async function reviewClaim(req, res, next) {
  try {
    const { id } = req.params;
    const { status, admin_comment } = req.body;

    if (!['APPROVED', 'REJECTED'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Claim status must be either APPROVED or REJECTED.'
      });
    }

    const [claims] = await pool.query(
      `SELECT cl.*, i.item_name, i.user_id AS finder_id, claimant.full_name AS claimant_name
       FROM claims cl
       JOIN items i ON cl.item_id = i.id
       JOIN users claimant ON cl.claimant_id = claimant.id
       WHERE cl.id = ?`,
      [id]
    );

    if (claims.length === 0) {
      return res.status(404).json({ success: false, message: 'Claim not found.' });
    }

    const claim = claims[0];
    const isFinder = req.user.id === claim.finder_id;
    const isAdmin = req.user.role === 'ADMIN';

    if (!isFinder && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Only campus administrators or the item finder may review claims.'
      });
    }

    // Update claim
    await pool.query(
      `UPDATE claims SET
         status = ?,
         admin_comment = ?,
         updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [status, admin_comment || null, id]
    );

    if (status === 'APPROVED') {
      // Mark item as CLAIMED
      await pool.query(
        "UPDATE items SET status = 'CLAIMED' WHERE id = ?",
        [claim.item_id]
      );

      // Auto-reject any other pending claims on this item
      await pool.query(
        `UPDATE claims SET 
           status = 'REJECTED',
           admin_comment = 'Claim resolved: Item successfully claimed by verified owner.'
         WHERE item_id = ? AND id != ? AND status = 'PENDING'`,
        [claim.item_id, id]
      );

      // Notify claimant
      await pool.query(
        `INSERT INTO notifications (user_id, title, message)
         VALUES (?, ?, ?)`,
        [
          claim.claimant_id,
          `Claim Approved! Item: "${claim.item_name}"`,
          `Your claim on "${claim.item_name}" has been APPROVED. Please visit Campus Security or coordinate with the finder to collect your item. ${admin_comment ? 'Note: ' + admin_comment : ''}`
        ]
      );
    } else {
      // Rejected notification
      await pool.query(
        `INSERT INTO notifications (user_id, title, message)
         VALUES (?, ?, ?)`,
        [
          claim.claimant_id,
          `Claim Update: "${claim.item_name}"`,
          `Your claim on "${claim.item_name}" was not approved. ${admin_comment ? 'Reason: ' + admin_comment : 'Contact campus security for assistance.'}`
        ]
      );
    }

    await logActivity(
      req.user.id,
      `CLAIM_${status}`,
      `Claim #${id} for item "${claim.item_name}" was ${status} by ${req.user.full_name}`
    );

    res.json({
      success: true,
      message: `Claim successfully ${status.toLowerCase()}!`
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  createClaim,
  getMyClaims,
  getAllClaims,
  reviewClaim
};
