import express from "express";
import {register, login, logout, googleAuth, changePassword, requestPasswordReset, verifyResetToken, resetPassword} from "../controllers/auth.controller.js";
import { verifyToken } from "../middleware/jwt.js";

const router = express.Router();

router.post("/register", register );
router.post("/login", login );
router.post("/logout", logout );
router.post("/google", googleAuth); // New Google auth route
router.put("/change-password", verifyToken, changePassword); // Change password route

// Password reset routes
router.post("/forgot-password", requestPasswordReset); // Request password reset
router.get("/verify-reset-token", verifyResetToken); // Verify reset token
router.post("/reset-password", resetPassword); // Reset password with token

export default router;