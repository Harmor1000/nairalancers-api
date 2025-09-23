import express from "express";
import { verifyToken } from "../middleware/jwt.js";
import {
  requestPhoneVerification,
  verifyPhoneNumber,
  submitIdVerification,
  reviewIdVerification,
  getVerificationStatus,
  getPendingIdVerifications,
  getVerificationStatistics,
  manualEmailVerification
} from "../controllers/verification.controller.js";

const router = express.Router();

// USER VERIFICATION ROUTES
router.post("/phone/request", verifyToken, requestPhoneVerification); // Request phone verification SMS
router.post("/phone/verify", verifyToken, verifyPhoneNumber); // Verify phone number with code
router.post("/id/submit", verifyToken, submitIdVerification); // Submit ID documents
router.get("/status", verifyToken, getVerificationStatus); // Get user verification status
router.post("/email/verify", verifyToken, manualEmailVerification); // Manual email verification for existing users

// ADMIN VERIFICATION MANAGEMENT ROUTES
router.get("/pending", verifyToken, getPendingIdVerifications); // Get pending ID verifications (Admin)
router.post("/id/review/:userId", verifyToken, reviewIdVerification); // Approve/reject ID verification (Admin)
router.get("/statistics", verifyToken, getVerificationStatistics); // Get verification statistics (Admin)

export default router;
