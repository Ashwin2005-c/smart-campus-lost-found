// routes/claimRoutes.js
const express = require('express');
const router = express.Router();
const claimController = require('../controllers/claimController');
const { authenticateToken, requireRole } = require('../middleware/auth');

router.post('/', authenticateToken, claimController.createClaim);
router.get('/my', authenticateToken, claimController.getMyClaims);
router.get('/all', authenticateToken, requireRole('ADMIN'), claimController.getAllClaims);
router.put('/:id/review', authenticateToken, claimController.reviewClaim);

module.exports = router;
