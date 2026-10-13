// controllers/matchController.js
// Handles retrieval and status confirmation of smart-matched items

const { pool } = require('../config/db');
const { logActivity } = require('../utils/logger');
const { runGlobalMatching, matchItem } = require('../services/matchingService');

// Get all matches involving items belonging to the current user
async function getMyMatches(req, res, next) {
  try {
    const userId = req.user.id;

    const [matches] = await pool.query(
      `SELECT 
        m.id AS match_id,
        m.similarity_score,
        m.match_level,
        m.status AS match_status,
        m.created_at AS match_created_at,

        -- Lost Item Info
        lost.id AS lost_item_id,
        lost.item_name AS lost_name,
        lost.description AS lost_description,
        lost.location AS lost_location,
        lost.item_date AS lost_date,
        lost.image_url AS lost_image_url,
        lost.status AS lost_status,
        lost_user.id AS lost_user_id,
        lost_user.full_name AS lost_user_name,
        lost_cat.name AS lost_category_name,

        -- Found Item Info
        found.id AS found_item_id,
        found.item_name AS found_name,
        found.description AS found_description,
        found.location AS found_location,
        found.item_date AS found_date,
        found.image_url AS found_image_url,
        found.status AS found_status,
        found_user.id AS found_user_id,
        found_user.full_name AS found_user_name,
        found_cat.name AS found_category_name

       FROM matches m
       JOIN items lost ON m.lost_item_id = lost.id
       JOIN users lost_user ON lost.user_id = lost_user.id
       JOIN categories lost_cat ON lost.category_id = lost_cat.id

       JOIN items found ON m.found_item_id = found.id
       JOIN users found_user ON found.user_id = found_user.id
       JOIN categories found_cat ON found.category_id = found_cat.id

       WHERE (lost.user_id = ? OR found.user_id = ?)
       ORDER BY m.similarity_score DESC, m.created_at DESC`,
      [userId, userId]
    );

    res.json({
      success: true,
      matches
    });
  } catch (error) {
    next(error);
  }
}

// Get all matches for an item
async function getMatchesForItem(req, res, next) {
  try {
    const { itemId } = req.params;

    const [matches] = await pool.query(
      `SELECT 
        m.id AS match_id,
        m.similarity_score,
        m.match_level,
        m.status AS match_status,
        m.created_at,

        -- Lost Item Info
        lost.id AS lost_item_id,
        lost.item_name AS lost_name,
        lost.location AS lost_location,
        lost.item_date AS lost_date,
        lost.image_url AS lost_image_url,
        lost_user.full_name AS lost_user_name,

        -- Found Item Info
        found.id AS found_item_id,
        found.item_name AS found_name,
        found.location AS found_location,
        found.item_date AS found_date,
        found.image_url AS found_image_url,
        found_user.full_name AS found_user_name

       FROM matches m
       JOIN items lost ON m.lost_item_id = lost.id
       JOIN users lost_user ON lost.user_id = lost_user.id
       JOIN items found ON m.found_item_id = found.id
       JOIN users found_user ON found.user_id = found_user.id
       WHERE m.lost_item_id = ? OR m.found_item_id = ?
       ORDER BY m.similarity_score DESC`,
      [itemId, itemId]
    );

    res.json({
      success: true,
      matches
    });
  } catch (error) {
    next(error);
  }
}

// Update match status (CONFIRMED or DISMISSED)
async function updateMatchStatus(req, res, next) {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!['CONFIRMED', 'DISMISSED', 'PENDING'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status. Must be PENDING, CONFIRMED, or DISMISSED.'
      });
    }

    const [matches] = await pool.query(
      `SELECT m.*, lost.user_id AS lost_owner_id, found.user_id AS found_owner_id
       FROM matches m
       JOIN items lost ON m.lost_item_id = lost.id
       JOIN items found ON m.found_item_id = found.id
       WHERE m.id = ?`,
      [id]
    );

    if (matches.length === 0) {
      return res.status(404).json({ success: false, message: 'Match not found' });
    }

    const match = matches[0];
    const isOwner = req.user.id === match.lost_owner_id || req.user.id === match.found_owner_id;
    const isAdmin = req.user.role === 'ADMIN';

    if (!isOwner && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to update this match.'
      });
    }

    await pool.query('UPDATE matches SET status = ? WHERE id = ?', [status, id]);
    await logActivity(req.user.id, 'MATCH_STATUS_UPDATE', `Match #${id} updated to ${status}`);

    res.json({
      success: true,
      message: `Match status updated to ${status}`
    });
  } catch (error) {
    next(error);
  }
}

// Trigger re-matching manually
async function triggerReMatch(req, res, next) {
  try {
    const { itemId } = req.body;
    let result;
    if (itemId) {
      result = await matchItem(itemId);
    } else {
      result = await runGlobalMatching();
    }

    res.json({
      success: true,
      message: 'Matching algorithm executed successfully.',
      result
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getMyMatches,
  getMatchesForItem,
  updateMatchStatus,
  triggerReMatch
};
