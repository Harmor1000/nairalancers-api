import express from "express";
import {
  getSettings,
  updateSettings,
  updateProfile,
  updateAccount,
  updateSecurity,
  updateNotifications,
  updateSeller,
  updateBankDetails,
  deleteSettings,
  addSkill,
  removeSkill
} from "../controllers/settings.controller.js";
import { verifyToken } from "../middleware/jwt.js";

const router = express.Router();

// Get user settings
router.get("/", verifyToken, getSettings);

// Update entire settings
router.put("/", verifyToken, updateSettings);

// Update specific sections
router.put("/profile", verifyToken, updateProfile);
router.put("/account", verifyToken, updateAccount);
router.put("/security", verifyToken, updateSecurity);
router.put("/notifications", verifyToken, updateNotifications);
router.put("/seller", verifyToken, updateSeller);
router.put("/bankDetails", verifyToken, updateBankDetails);

// Skill management
router.post("/skills", verifyToken, addSkill);
router.delete("/skills", verifyToken, removeSkill);

// Delete settings
router.delete("/", verifyToken, deleteSettings);

export default router;






