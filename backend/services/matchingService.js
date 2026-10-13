// services/matchingService.js
// Smart AI & Heuristic Matching Engine for Smart Campus Lost & Found System

const { pool } = require('../config/db');

// Common English stopwords to ignore in text tokenization
const STOPWORDS = new Set([
  'a', 'about', 'above', 'after', 'again', 'against', 'all', 'am', 'an', 'and', 'any', 'are', 'as',
  'at', 'be', 'because', 'been', 'before', 'being', 'below', 'between', 'both', 'but', 'by',
  'could', 'did', 'do', 'does', 'doing', 'down', 'during', 'each', 'few', 'for', 'from', 'further',
  'had', 'has', 'have', 'having', 'he', 'her', 'here', 'hers', 'herself', 'him', 'himself', 'his',
  'how', 'i', 'if', 'in', 'into', 'is', 'it', 'its', 'itself', 'just', 'me', 'more', 'most', 'my',
  'myself', 'no', 'nor', 'not', 'now', 'of', 'off', 'on', 'once', 'only', 'or', 'other', 'our',
  'ours', 'ourselves', 'out', 'over', 'own', 'same', 'she', 'should', 'so', 'some', 'such', 'than',
  'that', 'the', 'their', 'theirs', 'them', 'themselves', 'then', 'there', 'these', 'they', 'this',
  'those', 'through', 'to', 'too', 'under', 'until', 'up', 'very', 'was', 'we', 'were', 'what',
  'when', 'where', 'which', 'while', 'who', 'whom', 'why', 'with', 'you', 'your', 'yours'
]);

function tokenize(text) {
  if (!text) return [];
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(token => token.length > 1 && !STOPWORDS.has(token));
}

// Calculate Jaccard similarity between two arrays of tokens
function calculateJaccard(tokensA, tokensB) {
  if (!tokensA.length || !tokensB.length) return 0;
  const setA = new Set(tokensA);
  const setB = new Set(tokensB);
  let intersection = 0;
  for (const token of setA) {
    if (setB.has(token)) intersection++;
  }
  const union = new Set([...setA, ...setB]).size;
  return union > 0 ? intersection / union : 0;
}

// Check for exact substring keyword hits (brands, key models like 'dell', 'iphone', 'casio')
function calculateBrandOrKeyOverlap(tokensA, tokensB) {
  const setB = new Set(tokensB);
  let hits = 0;
  for (const token of tokensA) {
    if (token.length >= 3 && setB.has(token)) {
      hits++;
    }
  }
  return hits;
}

// Compute comprehensive similarity between a lost item and a found item
function computeItemSimilarity(lostItem, foundItem) {
  let score = 0;
  const breakdown = {};

  // 1. Category Matching (Max 35 points)
  if (lostItem.category_id === foundItem.category_id) {
    score += 35;
    breakdown.category = 35;
  } else {
    breakdown.category = 0;
    // If categories don't match, maximum match potential is drastically reduced
  }

  // 2. Title & Description Keyword Matching (Max 40 points)
  const lostTitleTokens = tokenize(lostItem.item_name);
  const foundTitleTokens = tokenize(foundItem.item_name);
  const lostDescTokens = tokenize(lostItem.description || '');
  const foundDescTokens = tokenize(foundItem.description || '');

  const titleJaccard = calculateJaccard(lostTitleTokens, foundTitleTokens);
  const fullLostTokens = [...lostTitleTokens, ...lostDescTokens];
  const fullFoundTokens = [...foundTitleTokens, ...foundDescTokens];
  const fullJaccard = calculateJaccard(fullLostTokens, fullFoundTokens);
  const keywordHits = calculateBrandOrKeyOverlap(fullLostTokens, fullFoundTokens);

  // Title similarity is given high priority
  let textScore = (titleJaccard * 25) + (fullJaccard * 10);
  if (keywordHits >= 2) textScore += 5;
  textScore = Math.min(40, textScore);
  score += textScore;
  breakdown.text = Math.round(textScore);

  // 3. Location Matching (Max 15 points)
  const lostLocTokens = tokenize(lostItem.location);
  const foundLocTokens = tokenize(foundItem.location);
  const locJaccard = calculateJaccard(lostLocTokens, foundLocTokens);
  let locScore = locJaccard * 15;
  if (lostItem.location && foundItem.location &&
      (lostItem.location.toLowerCase().includes(foundItem.location.toLowerCase()) ||
       foundItem.location.toLowerCase().includes(lostItem.location.toLowerCase()))) {
    locScore = 15;
  }
  score += locScore;
  breakdown.location = Math.round(locScore);

  // 4. Date Proximity (Max 10 points)
  // Found date should ideally be on or shortly after the lost date
  const lostDate = new Date(lostItem.item_date);
  const foundDate = new Date(foundItem.item_date);
  const diffDays = Math.round((foundDate - lostDate) / (1000 * 60 * 60 * 24));

  let dateScore = 0;
  if (diffDays >= 0 && diffDays <= 7) {
    dateScore = 10;
  } else if (diffDays > 7 && diffDays <= 21) {
    dateScore = 7;
  } else if (diffDays > 21 && diffDays <= 60) {
    dateScore = 4;
  } else if (diffDays >= -2 && diffDays < 0) {
    // slight discrepancy in reporting date
    dateScore = 4;
  }
  score += dateScore;
  breakdown.date = dateScore;

  const totalScore = Math.min(100, Math.round(score * 100) / 100);

  let matchLevel = 'LOW';
  if (totalScore >= 70) {
    matchLevel = 'HIGH';
  } else if (totalScore >= 45) {
    matchLevel = 'MEDIUM';
  }

  return {
    score: totalScore,
    matchLevel,
    breakdown
  };
}

// Process automated matching for a single new or updated item
async function matchItem(itemId) {
  try {
    const [items] = await pool.query('SELECT * FROM items WHERE id = ?', [itemId]);
    if (items.length === 0) return { matchesCreated: 0 };
    const currentItem = items[0];

    const oppositeType = currentItem.type === 'LOST' ? 'FOUND' : 'LOST';

    // Get candidate items of opposite type that are ACTIVE or MATCHED
    const [candidates] = await pool.query(
      `SELECT * FROM items 
       WHERE type = ? AND status IN ('ACTIVE', 'MATCHED') AND id != ?`,
      [oppositeType, currentItem.id]
    );

    let matchesCreated = 0;

    for (const candidate of candidates) {
      const lostItem = currentItem.type === 'LOST' ? currentItem : candidate;
      const foundItem = currentItem.type === 'FOUND' ? currentItem : candidate;

      const { score, matchLevel } = computeItemSimilarity(lostItem, foundItem);

      // Save match if score threshold >= 25%
      if (score >= 25) {
        // Upsert into matches
        await pool.query(
          `INSERT INTO matches (lost_item_id, found_item_id, similarity_score, match_level, status)
           VALUES (?, ?, ?, ?, 'PENDING')
           ON DUPLICATE KEY UPDATE
             similarity_score = VALUES(similarity_score),
             match_level = VALUES(match_level)`,
          [lostItem.id, foundItem.id, score, matchLevel]
        );

        matchesCreated++;

        // Update items status to MATCHED if still ACTIVE
        if (lostItem.status === 'ACTIVE') {
          await pool.query("UPDATE items SET status = 'MATCHED' WHERE id = ?", [lostItem.id]);
        }
        if (foundItem.status === 'ACTIVE') {
          await pool.query("UPDATE items SET status = 'MATCHED' WHERE id = ?", [foundItem.id]);
        }

        // Notify both owners if it's a medium or high match
        if (score >= 45) {
          // Notify lost item owner
          await pool.query(
            `INSERT INTO notifications (user_id, title, message, is_read)
             VALUES (?, ?, ?, FALSE)`,
            [
              lostItem.user_id,
              `${matchLevel} Match Found for "${lostItem.item_name}"`,
              `A found item "${foundItem.item_name}" at ${foundItem.location} has a ${score}% match with your lost report. Please review it!`
            ]
          );

          // Notify found item owner
          await pool.query(
            `INSERT INTO notifications (user_id, title, message, is_read)
             VALUES (?, ?, ?, FALSE)`,
            [
              foundItem.user_id,
              `Potential Owner Found for "${foundItem.item_name}"`,
              `A lost item report "${lostItem.item_name}" has a ${score}% match with the item you found at ${foundItem.location}.`
            ]
          );
        }
      }
    }

    return { matchesCreated };
  } catch (error) {
    console.error('Error during matchItem:', error.message);
    return { error: error.message };
  }
}

// Global batch matching across all active items
async function runGlobalMatching() {
  try {
    const [lostItems] = await pool.query("SELECT * FROM items WHERE type = 'LOST' AND status IN ('ACTIVE', 'MATCHED')");
    const [foundItems] = await pool.query("SELECT * FROM items WHERE type = 'FOUND' AND status IN ('ACTIVE', 'MATCHED')");

    let count = 0;
    for (const lost of lostItems) {
      for (const found of foundItems) {
        const { score, matchLevel } = computeItemSimilarity(lost, found);
        if (score >= 25) {
          await pool.query(
            `INSERT INTO matches (lost_item_id, found_item_id, similarity_score, match_level, status)
             VALUES (?, ?, ?, ?, 'PENDING')
             ON DUPLICATE KEY UPDATE
               similarity_score = VALUES(similarity_score),
               match_level = VALUES(match_level)`,
            [lost.id, found.id, score, matchLevel]
          );
          count++;
        }
      }
    }
    return { totalMatchesEvaluated: count };
  } catch (error) {
    console.error('Error in runGlobalMatching:', error.message);
    throw error;
  }
}

module.exports = {
  computeItemSimilarity,
  matchItem,
  runGlobalMatching
};
