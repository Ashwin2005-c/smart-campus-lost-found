// routes/matchRoutes.js
const express = require('express');
const router = express.Router();
const matchController = require('../controllers/matchController');
const { authenticateToken } = require('../middleware/auth');

router.get('/my', authenticateToken, matchController.getMyMatches);
router.get('/item/:itemId', authenticateToken, matchController.getMatchesForItem);
router.put('/:id/status', authenticateToken, matchController.updateMatchStatus);
router.post('/re-match', authenticateToken, matchController.triggerReMatch);

module.exports = router;
