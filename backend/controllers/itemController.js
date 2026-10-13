// controllers/itemController.js
// Handles Lost and Found items lifecycle, filtering, search, and details

const { pool } = require('../config/db');
const { logActivity } = require('../utils/logger');
const { matchItem } = require('../services/matchingService');
const { uploadToCloudinary } = require('../middleware/upload');

// Get all items with rich search and filtering
async function getItems(req, res, next) {
  try {
    const {
      type,
      category_id,
      status,
      search,
      location,
      fromDate,
      toDate,
      page = 1,
      limit = 24
    } = req.query;

    let querySql = `
      SELECT 
        i.id, i.user_id, i.category_id, i.item_name, i.description,
        i.location, i.item_date, i.image_url, i.type, i.status,
        i.created_at, i.updated_at,
        c.name AS category_name,
        u.full_name AS poster_name,
        u.user_type AS poster_type,
        u.department AS poster_department,
        (SELECT COUNT(*) FROM claims cl WHERE cl.item_id = i.id) AS claims_count,
        (SELECT COUNT(*) FROM matches m WHERE (m.lost_item_id = i.id OR m.found_item_id = i.id)) AS matches_count
      FROM items i
      JOIN categories c ON i.category_id = c.id
      JOIN users u ON i.user_id = u.id
      WHERE 1=1
    `;

    const queryParams = [];

    if (type && ['LOST', 'FOUND'].includes(type.toUpperCase())) {
      querySql += ' AND i.type = ?';
      queryParams.push(type.toUpperCase());
    }

    if (category_id) {
      querySql += ' AND i.category_id = ?';
      queryParams.push(category_id);
    }

    if (status) {
      querySql += ' AND i.status = ?';
      queryParams.push(status);
    }

    if (location) {
      querySql += ' AND i.location LIKE ?';
      queryParams.push(`%${location}%`);
    }

    if (fromDate) {
      querySql += ' AND i.item_date >= ?';
      queryParams.push(fromDate);
    }

    if (toDate) {
      querySql += ' AND i.item_date <= ?';
      queryParams.push(toDate);
    }

    if (search) {
      querySql += ' AND (i.item_name LIKE ? OR i.description LIKE ? OR i.location LIKE ?)';
      const term = `%${search}%`;
      queryParams.push(term, term, term);
    }

    // Count total matches for pagination
    const countSql = `SELECT COUNT(*) as total FROM (${querySql}) as filtered`;
    const [countRows] = await pool.query(countSql, queryParams);
    const total = countRows[0] ? countRows[0].total : 0;

    // Sorting and pagination
    querySql += ' ORDER BY i.created_at DESC LIMIT ? OFFSET ?';
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10)));
    const offsetNum = (Math.max(1, parseInt(page, 10)) - 1) * limitNum;
    queryParams.push(limitNum, offsetNum);

    const [items] = await pool.query(querySql, queryParams);

    res.json({
      success: true,
      items,
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

// Get item by ID with full details, claims, and potential matches
async function getItemById(req, res, next) {
  try {
    const { id } = req.params;

    const [items] = await pool.query(
      `SELECT 
        i.id, i.user_id, i.category_id, i.item_name, i.description,
        i.location, i.item_date, i.image_url, i.type, i.status,
        i.created_at, i.updated_at,
        c.name AS category_name,
        u.full_name AS poster_name,
        u.email AS poster_email,
        u.phone AS poster_phone,
        u.user_type AS poster_type,
        u.department AS poster_department,
        u.college AS poster_college
      FROM items i
      JOIN categories c ON i.category_id = c.id
      JOIN users u ON i.user_id = u.id
      WHERE i.id = ?`,
      [id]
    );

    if (items.length === 0) {
      return res.status(404).json({ success: false, message: 'Item not found' });
    }

    const item = items[0];

    // Fetch related matches
    const [matches] = await pool.query(
      `SELECT 
        m.id AS match_id, m.similarity_score, m.match_level, m.status AS match_status, m.created_at,
        opp.id AS matched_item_id, opp.item_name AS matched_item_name, opp.location AS matched_location,
        opp.item_date AS matched_item_date, opp.image_url AS matched_image_url, opp.type AS matched_type,
        opp_user.full_name AS matched_user_name,
        opp_cat.name AS matched_category_name
       FROM matches m
       JOIN items opp ON (opp.id = CASE WHEN m.lost_item_id = ? THEN m.found_item_id ELSE m.lost_item_id END)
       JOIN categories opp_cat ON opp.category_id = opp_cat.id
       JOIN users opp_user ON opp.user_id = opp_user.id
       WHERE m.lost_item_id = ? OR m.found_item_id = ?
       ORDER BY m.similarity_score DESC`,
      [item.id, item.id, item.id]
    );

    // If caller is the reporter or an admin, include claims on this item
    let claims = [];
    const callerId = req.user ? req.user.id : null;
    const isCallerAdmin = req.user && req.user.role === 'ADMIN';
    const isCallerOwner = callerId === item.user_id;

    if (isCallerOwner || isCallerAdmin) {
      const [itemClaims] = await pool.query(
        `SELECT 
          cl.id, cl.item_id, cl.claimant_id, cl.description, cl.verification_details,
          cl.status, cl.admin_comment, cl.created_at, cl.updated_at,
          u.full_name AS claimant_name, u.email AS claimant_email, u.phone AS claimant_phone,
          u.user_type AS claimant_type, u.department AS claimant_department
         FROM claims cl
         JOIN users u ON cl.claimant_id = u.id
         WHERE cl.item_id = ?
         ORDER BY cl.created_at DESC`,
        [item.id]
      );
      claims = itemClaims;
    }

    res.json({
      success: true,
      item,
      matches,
      claims,
      isOwner: isCallerOwner,
      isAdmin: isCallerAdmin
    });
  } catch (error) {
    next(error);
  }
}

// Create new Lost or Found item
async function createItem(req, res, next) {
  try {
    const { item_name, category_id, description, location, item_date, type } = req.body;

    if (!item_name || !category_id || !location || !item_date || !type) {
      return res.status(400).json({
        success: false,
        message: 'Item name, category, location, date, and report type (LOST or FOUND) are required.'
      });
    }

    if (!['LOST', 'FOUND'].includes(type.toUpperCase())) {
      return res.status(400).json({
        success: false,
        message: 'Item type must be either LOST or FOUND.'
      });
    }

    // Handle image upload:
    // - If Cloudinary is configured: req.file.buffer is uploaded to Cloudinary -> returns secure URL
    // - If local disk storage: req.file.filename is used to build a relative /uploads/ path
    let imageUrl = null;
    if (req.file) {
      if (req.file.buffer) {
        // Memory storage (Cloudinary mode) — upload the buffer
        imageUrl = await uploadToCloudinary(req.file.buffer, req.file.mimetype);
      } else {
        imageUrl = `/uploads/${req.file.filename}`;
      }
    } else if (req.body.image_url) {
      imageUrl = req.body.image_url;
    }

    const [result] = await pool.query(
      `INSERT INTO items (user_id, category_id, item_name, description, location, item_date, image_url, type, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE')`,
      [
        req.user.id,
        category_id,
        item_name.trim(),
        description ? description.trim() : null,
        location.trim(),
        item_date,
        imageUrl,
        type.toUpperCase()
      ]
    );

    const itemId = result.insertId;

    await logActivity(
      req.user.id,
      `ITEM_CREATE_${type.toUpperCase()}`,
      `Reported ${type.toUpperCase()}: "${item_name}" at ${location}`
    );

    // Trigger Smart Matching Engine in the background
    const matchResult = await matchItem(itemId);

    // Fetch created item with joins
    const [created] = await pool.query(
      `SELECT i.*, c.name AS category_name, u.full_name AS poster_name
       FROM items i
       JOIN categories c ON i.category_id = c.id
       JOIN users u ON i.user_id = u.id
       WHERE i.id = ?`,
      [itemId]
    );

    res.status(201).json({
      success: true,
      message: `${type.toUpperCase() === 'LOST' ? 'Lost item report filed' : 'Found item reported'} successfully!`,
      item: created[0],
      matchesCreated: matchResult.matchesCreated || 0
    });
  } catch (error) {
    next(error);
  }
}

// Update existing item
async function updateItem(req, res, next) {
  try {
    const { id } = req.params;
    const { item_name, category_id, description, location, item_date, status, type } = req.body;

    const [items] = await pool.query('SELECT * FROM items WHERE id = ?', [id]);
    if (items.length === 0) {
      return res.status(404).json({ success: false, message: 'Item not found' });
    }

    const item = items[0];

    // Check ownership or admin
    if (item.user_id !== req.user.id && req.user.role !== 'ADMIN') {
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to update this item report.'
      });
    }

    // Handle image upload:
    // - If Cloudinary is configured: req.file.buffer is uploaded to Cloudinary -> returns secure URL
    // - If local disk storage: req.file.filename is used to build a relative /uploads/ path
    let imageUrl = item.image_url;
    if (req.file) {
      if (req.file.buffer) {
        imageUrl = await uploadToCloudinary(req.file.buffer, req.file.mimetype);
      } else {
        imageUrl = `/uploads/${req.file.filename}`;
      }
    } else if (req.body.image_url) {
      imageUrl = req.body.image_url;
    }

    await pool.query(
      `UPDATE items SET
         item_name = COALESCE(?, item_name),
         category_id = COALESCE(?, category_id),
         description = COALESCE(?, description),
         location = COALESCE(?, location),
         item_date = COALESCE(?, item_date),
         image_url = ?,
         status = COALESCE(?, status),
         type = COALESCE(?, type)
       WHERE id = ?`,
      [
        item_name ? item_name.trim() : null,
        category_id || null,
        description !== undefined ? description : null,
        location ? location.trim() : null,
        item_date || null,
        imageUrl,
        status || null,
        type || null,
        id
      ]
    );

    await logActivity(
      req.user.id,
      'ITEM_UPDATE',
      `Updated item #${id}: ${item_name || item.item_name} (Status: ${status || item.status})`
    );

    // If status or details changed, re-run matching
    await matchItem(id);

    const [updated] = await pool.query(
      `SELECT i.*, c.name AS category_name, u.full_name AS poster_name
       FROM items i
       JOIN categories c ON i.category_id = c.id
       JOIN users u ON i.user_id = u.id
       WHERE i.id = ?`,
      [id]
    );

    res.json({
      success: true,
      message: 'Item updated successfully!',
      item: updated[0]
    });
  } catch (error) {
    next(error);
  }
}

// Delete item
async function deleteItem(req, res, next) {
  try {
    const { id } = req.params;

    const [items] = await pool.query('SELECT * FROM items WHERE id = ?', [id]);
    if (items.length === 0) {
      return res.status(404).json({ success: false, message: 'Item not found' });
    }

    const item = items[0];

    if (item.user_id !== req.user.id && req.user.role !== 'ADMIN') {
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to delete this item.'
      });
    }

    await pool.query('DELETE FROM items WHERE id = ?', [id]);
    await logActivity(req.user.id, 'ITEM_DELETE', `Deleted item #${id}: "${item.item_name}"`);

    res.json({
      success: true,
      message: 'Item deleted successfully.'
    });
  } catch (error) {
    next(error);
  }
}

// Get items submitted by logged in user
async function getMyItems(req, res, next) {
  try {
    const [items] = await pool.query(
      `SELECT 
        i.*, c.name AS category_name,
        (SELECT COUNT(*) FROM claims cl WHERE cl.item_id = i.id) AS claims_count,
        (SELECT COUNT(*) FROM matches m WHERE (m.lost_item_id = i.id OR m.found_item_id = i.id)) AS matches_count
       FROM items i
       JOIN categories c ON i.category_id = c.id
       WHERE i.user_id = ?
       ORDER BY i.created_at DESC`,
      [req.user.id]
    );

    res.json({
      success: true,
      items
    });
  } catch (error) {
    next(error);
  }
}

// Get all categories
async function getCategories(req, res, next) {
  try {
    const [categories] = await pool.query(
      `SELECT c.id, c.name, COUNT(i.id) AS items_count
       FROM categories c
       LEFT JOIN items i ON c.id = i.category_id
       GROUP BY c.id, c.name
       ORDER BY c.name ASC`
    );

    res.json({
      success: true,
      categories
    });
  } catch (error) {
    next(error);
  }
}

// Summary stats for public homepage cards
async function getItemStats(req, res, next) {
  try {
    const [counts] = await pool.query(
      `SELECT 
        COUNT(*) AS total_items,
        COUNT(CASE WHEN type = 'LOST' AND status = 'ACTIVE' THEN 1 END) AS active_lost,
        COUNT(CASE WHEN type = 'FOUND' AND status = 'ACTIVE' THEN 1 END) AS active_found,
        COUNT(CASE WHEN status IN ('RECOVERED', 'CLAIMED') THEN 1 END) AS recovered_items,
        COUNT(CASE WHEN status = 'MATCHED' THEN 1 END) AS matched_items
       FROM items`
    );

    const [userCount] = await pool.query('SELECT COUNT(*) AS total_users FROM users');
    const [matchesCount] = await pool.query("SELECT COUNT(*) AS total_matches FROM matches WHERE match_level IN ('HIGH', 'MEDIUM')");

    res.json({
      success: true,
      stats: {
        total_items: counts[0].total_items || 0,
        active_lost: counts[0].active_lost || 0,
        active_found: counts[0].active_found || 0,
        recovered_items: counts[0].recovered_items || 0,
        matched_items: counts[0].matched_items || 0,
        total_users: userCount[0].total_users || 0,
        total_matches: matchesCount[0].total_matches || 0,
        resolution_rate: counts[0].total_items > 0
          ? Math.round(((counts[0].recovered_items) / counts[0].total_items) * 100)
          : 0
      }
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getItems,
  getItemById,
  createItem,
  updateItem,
  deleteItem,
  getMyItems,
  getCategories,
  getItemStats
};
