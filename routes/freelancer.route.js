import express from "express";
import { verifyToken } from "../middleware/jwt.js";
import {
  getFreelancerStats,
  createWithdrawal,
  getWithdrawals,
  updateWithdrawalStatus
} from "../controllers/freelancer.controller.js";

const router = express.Router();

// Get freelancer statistics (earnings, projects, ratings, etc.)
router.get("/:freelancerId/stats", verifyToken, getFreelancerStats);

// Create withdrawal request
router.post("/:freelancerId/withdrawals", verifyToken, createWithdrawal);

// Get withdrawal history
router.get("/:freelancerId/withdrawals", verifyToken, getWithdrawals);

// Update withdrawal status (admin only)
router.patch("/withdrawals/:withdrawalId/status", verifyToken, updateWithdrawalStatus);

export default router;

