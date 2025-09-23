import express from "express";
import { verifyToken } from "../middleware/jwt.js";
import {
  requestEmailVerification,
  verifyEmailChange,
  getVerificationStatus,
  resendVerificationCode,
  cancelEmailVerification,
  checkEmailAvailability,
} from "../controllers/emailVerification.controller.js";

const router = express.Router();

// All routes require authentication
router.use(verifyToken);

// Request email verification
router.post("/request", requestEmailVerification);

// Verify email change
router.post("/verify", verifyEmailChange);

// Get verification status
router.get("/status", getVerificationStatus);

// Resend verification code
router.post("/resend", resendVerificationCode);

// Cancel verification
router.delete("/cancel", cancelEmailVerification);

// Check email availability
router.post("/check", checkEmailAvailability);

export default router;


