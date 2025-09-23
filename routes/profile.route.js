import express from "express";
import {
  getProfile,
  updateProfile,
  getProfileCompletion,
  searchProfiles
} from "../controllers/profile.controller.js";
import { verifyToken } from "../middleware/jwt.js";

const router = express.Router();

// Public routes
router.get("/search", searchProfiles);
router.get("/:id", getProfile);

// Protected routes
router.put("/", verifyToken, updateProfile);
router.get("/completion/me", verifyToken, getProfileCompletion);

export default router;
