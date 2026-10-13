// routes/itemRoutes.js
const express = require('express');
const router = express.Router();
const itemController = require('../controllers/itemController');
const { authenticateToken, optionalAuth } = require('../middleware/auth');
const { upload } = require('../middleware/upload');

// Public routes
router.get('/', itemController.getItems);
router.get('/categories', itemController.getCategories);
router.get('/stats', itemController.getItemStats);

// Authenticated user items
router.get('/my', authenticateToken, itemController.getMyItems);

// Individual item details
router.get('/:id', optionalAuth, itemController.getItemById);

// Create, update, delete
router.post('/', authenticateToken, upload.single('image'), itemController.createItem);
router.put('/:id', authenticateToken, upload.single('image'), itemController.updateItem);
router.delete('/:id', authenticateToken, itemController.deleteItem);

module.exports = router;
