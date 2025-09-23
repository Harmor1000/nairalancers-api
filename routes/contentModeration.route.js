import express from "express";
import { 
  getViolationStats,
  getUserViolationHistory,
  getFilteredMessagesStats,
  updateUserFilteringLevel,
  clearUserViolations,
  getFilteringConfig,
  testContentFilter
} from "../controllers/contentModeration.controller.js";
import { verifyToken } from "../middleware/jwt.js";
import { verifyAdmin } from "../middleware/adminAuth.js";

const router = express.Router();

// All routes require admin authentication
router.use(verifyToken);
router.use(verifyAdmin);

// Get overall violation statistics
router.get("/stats/violations", getViolationStats);

// Get filtered messages statistics  
router.get("/stats/filtered-messages", getFilteredMessagesStats);

// Get filtering configuration
router.get("/config", getFilteringConfig);

// Test content filter
router.post("/test", testContentFilter);

// Get specific user's violation history
router.get("/users/:userId/violations", getUserViolationHistory);

// Update user's content filtering level
router.put("/users/:userId/filtering-level", updateUserFilteringLevel);

// Clear user's violation history
router.delete("/users/:userId/violations", clearUserViolations);

export default router;

