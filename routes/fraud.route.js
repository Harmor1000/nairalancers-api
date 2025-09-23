import express from "express";
import { verifyToken } from "../middleware/jwt.js";
import {
  detectSuspiciousOrders,
  getUserRiskAssessment,
  bulkRiskAnalysis,
  updateTrustScore,
  flagUserForReview
} from "../controllers/fraud.controller.js";

const router = express.Router();

// FRAUD DETECTION & MONITORING ROUTES (Admin only unless specified)

// Risk Assessment Routes
router.get("/risk-assessment/:userId", verifyToken, getUserRiskAssessment); // Get user risk assessment
router.get("/bulk-analysis", verifyToken, bulkRiskAnalysis); // Analyze all active users (Admin)

// Suspicious Activity Detection
router.get("/suspicious-orders", verifyToken, detectSuspiciousOrders); // Detect suspicious order patterns (Admin)

// Trust Score Management
router.post("/trust-score/:userId", verifyToken, updateTrustScore); // Update user trust score (Admin)
router.post("/flag-user/:userId", verifyToken, flagUserForReview); // Flag user for manual review (Admin)

// Real-time Monitoring (could be called by system/webhooks)
// router.post("/monitor-transaction/:orderId", monitorTransaction); // Real-time transaction monitoring

export default router;
