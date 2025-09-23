import express from 'express';
import { verifyToken } from '../middleware/jwt.js';
import { 
  addToFavorites, 
  removeFromFavorites, 
  getFavorites, 
  checkFavorite, 
  toggleFavorite 
} from '../controllers/favorites.controller.js';

const router = express.Router();

// Get user's favorites (supports ?type=gig|seller|all)
router.get('/', verifyToken, getFavorites);

// Check if item is in favorites (requires ?type=gig|seller)
router.get('/check/:itemId', verifyToken, checkFavorite);

// Add item to favorites (requires ?type=gig|seller)
router.post('/:itemId', verifyToken, addToFavorites);

// Remove item from favorites (requires ?type=gig|seller)
router.delete('/:itemId', verifyToken, removeFromFavorites);

// Toggle favorite status (requires ?type=gig|seller)
router.put('/toggle/:itemId', verifyToken, toggleFavorite);

export default router;
