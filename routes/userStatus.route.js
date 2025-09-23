import express from "express";
import {
  updateUserStatus,
  getUserStatus,
  getMultipleUsersStatus,
  updateNotificationSettings,
  getNotificationSettings,
  getOnlineUsers,
  heartbeat,
  getQueuedNotifications
} from "../controllers/userStatus.controller.js";
import { verifyToken } from "../middleware/jwt.js";

const router = express.Router();

// Update user status (online, away, busy, offline)
router.put("/status", verifyToken, updateUserStatus);

// Get user status
router.get("/status/:userId", verifyToken, getUserStatus);

// Get multiple users status
router.post("/status/multiple", verifyToken, getMultipleUsersStatus);

// Update notification settings
router.put("/notifications", verifyToken, updateNotificationSettings);

// Get notification settings
router.get("/notifications", verifyToken, getNotificationSettings);

// Get online users
router.get("/online", verifyToken, getOnlineUsers);

// Heartbeat - keep user online
router.post("/heartbeat", verifyToken, heartbeat);

// Get queued notifications
router.get("/notifications/queued", verifyToken, getQueuedNotifications);

export default router;
