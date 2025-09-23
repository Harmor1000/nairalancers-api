import express from "express";
import { verifyToken } from "../middleware/jwt.js";
import {
  getPendingDisputes,
  startDisputeReview,
  resolveWithRefund,
  resolveInFavorOfFreelancer,
  getDisputeStatistics,
  addDisputeEvidence,
  detectFraudulentDisputes
} from "../controllers/dispute.controller.js";

const router = express.Router();

// ADMIN DISPUTE MANAGEMENT ROUTES
router.get("/pending", verifyToken, getPendingDisputes); // Get all pending disputes (Admin)
router.get("/statistics", verifyToken, getDisputeStatistics); // Get dispute statistics (Admin)
router.post("/fraud-detection", verifyToken, detectFraudulentDisputes); // Run fraud detection (Admin)

// DISPUTE RESOLUTION ROUTES (Admin)
router.post("/:orderId/start-review", verifyToken, startDisputeReview); // Start reviewing dispute
router.post("/:orderId/resolve-refund", verifyToken, resolveWithRefund); // Resolve with refund
router.post("/:orderId/resolve-freelancer", verifyToken, resolveInFavorOfFreelancer); // Resolve in favor of freelancer

// EVIDENCE SUBMISSION ROUTES (Both parties)
router.post("/:orderId/evidence", verifyToken, addDisputeEvidence); // Add evidence to dispute

export default router;
