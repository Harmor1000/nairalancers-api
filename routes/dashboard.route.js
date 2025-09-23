import express from "express";
import { 
  getDashboardStats, 
  getRecentActivities, 
  getRecentMessages, 
  getTrendingGigs,
  getNotifications,
  markNotificationAsRead,
  clearAllNotifications,
  getUnreadCount
} from "../controllers/dashboard.controller.js";
import { verifyToken } from "../middleware/jwt.js";

const router = express.Router();

// All dashboard routes require authentication
router.use(verifyToken);

// Get dashboard statistics
router.get("/stats", getDashboardStats);

// Get recent activities
router.get("/activities", getRecentActivities);

// Get recent messages for dashboard
router.get("/messages", getRecentMessages);

// Get trending/recommended gigs
router.get("/trending-gigs", getTrendingGigs);

// Get notifications
router.get("/notifications", getNotifications);

// Get unread notification count
router.get("/notifications/unread-count", getUnreadCount);

// Mark notification as read
router.put("/notifications/:notificationId/read", markNotificationAsRead);

// Clear all notifications
router.put("/notifications/clear-all", clearAllNotifications);

export default router;
