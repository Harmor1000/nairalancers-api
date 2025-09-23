import express from 'express';
import { verifyAdmin, verifySuperAdmin } from '../middleware/adminAuth.js';
import User from '../models/user.model.js';
import Gig from '../models/gig.model.js';
import Order from '../models/order.model.js';
import AdminLog from '../models/adminLog.model.js';
import createError from '../utils/createError.js';
import {
  // Dashboard & Analytics
  getDashboardStats,
  
  // User Management
  getAllUsers,
  getUserDetails,
  updateUser,
  suspendUser,
  unsuspendUser,
  deleteUser,
  
  // Gig Management
  getAllGigs,
  getGigDetails,
  updateGig,
  deleteGig,
  
  // Order Management
  getAllOrders,
  getOrderDetails,
  updateOrderStatus,
  refundOrder,
  
  // Withdrawal Management
  getAllWithdrawals,
  updateWithdrawalStatus,
  
  // Refund Management
  getRefunds,
  getRefundStatistics,
  processRefund,
  
  // System Management
  getSystemLogs,
  getSystemHealth,
  getSystemPerformance,
  getSystemAlerts,
  acknowledgeSystemAlert,
  // Backup Management
  getBackups,
  getBackupStatistics,
  createBackup,
  restoreBackup,
  deleteBackup,
  downloadBackup,
  
  // Reports & Analytics
  getRevenueReport,
  getUsersReport,
  getFraudReport,
  
  // Gig Management Extensions
  getGigStatistics,
  approveGig,
  rejectGig,
  suspendGig,
  restoreGig,
  featureGig,
  bulkGigAction,
  
  // Analytics
  getAnalyticsOverview,
  getAnalyticsUsers,
  getAnalyticsRevenue,
  getAnalyticsOrders,
  getAnalyticsPerformance
} from '../controllers/admin.controller.js';

// Import existing admin controllers
import {
  getPendingDisputes,
  startDisputeReview,
  resolveWithRefund,
  resolveInFavorOfFreelancer,
  getDisputeStatistics
} from '../controllers/dispute.controller.js';

import {
  getUserRiskAssessment,
  detectSuspiciousOrders,
  bulkRiskAnalysis,
  flagUserForReview,
  updateTrustScore
} from '../controllers/fraud.controller.js';

import {
  reviewIdVerification,
  getPendingIdVerifications,
  getVerificationStatistics,
  getVerificationDetails
} from '../controllers/verification.controller.js';

// Import notification controller functions
import {
  createNotification,
  getAllNotifications,
  getNotificationDetails,
  sendTestNotification,
  cancelNotification,
  getNotificationTemplates,
  getNotificationAnalytics
} from '../controllers/adminNotifications.controller.js';

// Import settings controller functions
import {
  getPlatformSettings,
  updatePlatformSettings,
  updateFeeStructure,
  updateTransactionLimits,
  toggleMaintenanceMode,
  updateVerificationRequirements,
  updateFeatureFlags,
  getSettingsHistory,
  validateSettings,
  resetSettingsToDefault
} from '../controllers/adminSettings.controller.js';

// Import admin auth controller functions
import {
  adminLogin,
  adminLogout,
  getAdminSession,
  getAllAdmins,
  updateAdminRole
} from '../controllers/adminAuth.controller.js';

const router = express.Router();

// ===========================================
// DASHBOARD & ANALYTICS ROUTES
// ===========================================
router.get('/dashboard/stats', verifyAdmin, getDashboardStats);
router.get('/system/health', verifyAdmin, getSystemHealth);
router.get('/system/logs', verifyAdmin, getSystemLogs);
router.get('/system/performance', verifyAdmin, getSystemPerformance);
router.get('/system/alerts', verifyAdmin, getSystemAlerts);
router.post('/system/alerts/:alertId/acknowledge', verifyAdmin, acknowledgeSystemAlert);
// Alias routes to support AdminSystem.jsx expectations
router.get('/system/backups', verifyAdmin, getBackups);
router.post('/system/backup', verifyAdmin, createBackup);

// ===========================================
// USER MANAGEMENT ROUTES
// ===========================================
router.get('/users', verifyAdmin, getAllUsers);
router.get('/users/:userId', verifyAdmin, getUserDetails);
router.put('/users/:userId', verifyAdmin, updateUser);
router.post('/users/:userId/suspend', verifyAdmin, suspendUser);
router.post('/users/:userId/unsuspend', verifyAdmin, unsuspendUser);
router.delete('/users/:userId', verifySuperAdmin, deleteUser);

// ===========================================
// GIG MANAGEMENT ROUTES
// ===========================================
router.get('/gigs', verifyAdmin, getAllGigs);
router.get('/gigs/statistics', verifyAdmin, getGigStatistics);
router.get('/gigs/:gigId', verifyAdmin, getGigDetails);
router.put('/gigs/:gigId', verifyAdmin, updateGig);
router.put('/gigs/:gigId/approve', verifyAdmin, approveGig);
router.put('/gigs/:gigId/reject', verifyAdmin, rejectGig);
router.put('/gigs/:gigId/suspend', verifyAdmin, suspendGig);
router.put('/gigs/:gigId/restore', verifyAdmin, restoreGig);
router.put('/gigs/:gigId/feature', verifyAdmin, featureGig);
router.post('/gigs/bulk-action', verifyAdmin, bulkGigAction);
router.delete('/gigs/:gigId', verifyAdmin, deleteGig);

// ===========================================
// ORDER MANAGEMENT ROUTES
// ===========================================
router.get('/orders', verifyAdmin, getAllOrders);
router.get('/orders/:orderId', verifyAdmin, getOrderDetails);
router.put('/orders/:orderId/status', verifyAdmin, updateOrderStatus);
router.post('/orders/:orderId/refund', verifyAdmin, refundOrder);

// ===========================================
// DISPUTE MANAGEMENT ROUTES
// ===========================================
router.get('/disputes', verifyAdmin, getPendingDisputes);
router.get('/disputes/statistics', verifyAdmin, getDisputeStatistics);
router.post('/disputes/:orderId/start-review', verifyAdmin, startDisputeReview);
router.post('/disputes/:orderId/resolve-refund', verifyAdmin, resolveWithRefund);
router.post('/disputes/:orderId/resolve-freelancer', verifyAdmin, resolveInFavorOfFreelancer);

// ===========================================
// WITHDRAWAL MANAGEMENT ROUTES
// ===========================================
router.get('/withdrawals', verifyAdmin, getAllWithdrawals);
router.put('/withdrawals/:withdrawalId/status', verifyAdmin, updateWithdrawalStatus);

// ===========================================
// REFUND MANAGEMENT ROUTES
// ===========================================
router.get('/refunds', verifyAdmin, getRefunds);
router.get('/refunds/statistics', verifyAdmin, getRefundStatistics);
router.put('/refunds/:refundId/process', verifyAdmin, processRefund);

// ===========================================
// VERIFICATION MANAGEMENT ROUTES
// ===========================================
router.get('/verification/pending', verifyAdmin, getPendingIdVerifications);
router.get('/verification/statistics', verifyAdmin, getVerificationStatistics);
router.get('/verification/:userId', verifyAdmin, getVerificationDetails);
router.post('/verification/:userId/review', verifyAdmin, reviewIdVerification);

// ===========================================
// FRAUD & SECURITY ROUTES
// ===========================================
router.get('/fraud/report', verifyAdmin, getFraudReport);
router.get('/fraud/risk-assessment/:userId', verifyAdmin, getUserRiskAssessment);
router.get('/fraud/suspicious-orders', verifyAdmin, detectSuspiciousOrders);
router.get('/fraud/bulk-analysis', verifyAdmin, bulkRiskAnalysis);
router.post('/fraud/flag-user/:userId', verifyAdmin, flagUserForReview);
router.post('/fraud/trust-score/:userId', verifyAdmin, updateTrustScore);

// ===========================================
// NOTIFICATION SYSTEM ROUTES
// ===========================================
router.post('/notifications', verifyAdmin, createNotification);
router.get('/notifications', verifyAdmin, getAllNotifications);
router.get('/notifications/:notificationId', verifyAdmin, getNotificationDetails);
router.post('/notifications/test', verifyAdmin, sendTestNotification);
router.put('/notifications/:notificationId/cancel', verifyAdmin, cancelNotification);
router.get('/notifications/templates', verifyAdmin, getNotificationTemplates);
router.get('/notifications/analytics', verifyAdmin, getNotificationAnalytics);

// ===========================================
// PLATFORM SETTINGS ROUTES
// ===========================================
router.get('/settings/platform', verifyAdmin, getPlatformSettings);
router.put('/settings/platform', verifyAdmin, updatePlatformSettings);
router.put('/settings/fees', verifyAdmin, updateFeeStructure);
router.put('/settings/limits', verifyAdmin, updateTransactionLimits);
router.put('/settings/maintenance', verifyAdmin, toggleMaintenanceMode);
router.put('/settings/verification', verifyAdmin, updateVerificationRequirements);
router.put('/settings/features', verifyAdmin, updateFeatureFlags);
router.get('/settings/history', verifyAdmin, getSettingsHistory);
router.post('/settings/validate', verifyAdmin, validateSettings);
router.post('/settings/reset', verifyAdmin, resetSettingsToDefault);

// ===========================================
// ADMIN AUTHENTICATION ROUTES
// ===========================================
router.post('/auth/login', adminLogin);
router.post('/auth/logout', verifyAdmin, adminLogout);
router.get('/auth/session', verifyAdmin, getAdminSession);
router.get('/auth/admins', verifyAdmin, getAllAdmins);
router.put('/auth/role/:userId', verifyAdmin, updateAdminRole);

// ===========================================
// REPORTS & ANALYTICS ROUTES
// ===========================================
router.get('/reports/revenue', verifyAdmin, getRevenueReport);
router.get('/reports/users', verifyAdmin, getUsersReport);

// Analytics routes
router.get('/analytics/overview', verifyAdmin, getAnalyticsOverview);
router.get('/analytics/users', verifyAdmin, getAnalyticsUsers);
router.get('/analytics/revenue', verifyAdmin, getAnalyticsRevenue);
router.get('/analytics/orders', verifyAdmin, getAnalyticsOrders);
router.get('/analytics/performance', verifyAdmin, getAnalyticsPerformance);

// ===========================================
// HEALTH CHECK & TESTING
// ===========================================
router.get('/health-check', verifyAdmin, (req, res) => {
  res.status(200).json({
    status: 'healthy',
    message: 'Admin panel API is working correctly',
    timestamp: new Date(),
    admin: req.adminUser.username,
    endpoints: {
      users: '/admin/users',
      gigs: '/admin/gigs',
      orders: '/admin/orders',
      disputes: '/admin/disputes',
      withdrawals: '/admin/withdrawals',
      analytics: '/admin/analytics/*',
      settings: '/admin/settings/*',
      notifications: '/admin/notifications'
    }
  });
});

// Bulk delete users (soft delete)
router.post('/bulk/delete-users', verifySuperAdmin, async (req, res, next) => {
  try {
    const { userIds, reason } = req.body;

    if (!Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({ message: 'User IDs array is required' });
    }
    if (!reason || String(reason).trim().length < 10) {
      return res.status(400).json({ message: 'Deletion reason must be at least 10 characters long' });
    }

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const results = await Promise.allSettled(
      userIds.map(async (userId) => {
        const user = await User.findById(userId);
        if (!user) throw new Error('User not found');
        // Prevent deleting other admins unless super admin (we are in super admin route)
        // Prevent deleting recently active users without force flag
        if (user.lastSeen && user.lastSeen > thirtyDaysAgo && !req.body.force) {
          throw new Error('User recently active; set force=true to delete');
        }
        // Check active orders
        const activeOrders = await Order.countDocuments({
          $or: [{ buyerId: userId }, { sellerId: userId }],
          status: { $in: ['pending', 'in progress'] }
        });
        if (activeOrders > 0) {
          throw new Error('User has active orders');
        }
        await User.findByIdAndUpdate(
          userId,
          {
            $set: {
              isDeleted: true,
              deletedAt: new Date(),
              deletedBy: req.userId,
              deletionReason: reason,
              email: `deleted_${userId}@deleted.com`,
              username: `deleted_${userId}`
            }
          }
        );
        return true;
      })
    );

    const successful = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;

    await AdminLog.create({
      adminId: req.userId,
      adminUsername: req.adminUser.username,
      action: 'bulk_action_performed',
      targetType: 'user',
      details: {
        targetName: 'Bulk User Deletion',
        operation: 'delete',
        totalUsers: userIds.length,
        successful,
        failed,
        reason,
        severity: 'critical'
      }
    });

    res.status(200).json({
      message: `Bulk deletion completed. ${successful} successful, ${failed} failed.`,
      results: { successful, failed, total: userIds.length }
    });
  } catch (err) {
    next(err);
  }
});

// ===========================================
// BACKUP MANAGEMENT ROUTES
// ===========================================
router.get('/backups', verifyAdmin, getBackups);
router.get('/backups/statistics', verifyAdmin, getBackupStatistics);
router.post('/backups/create', verifyAdmin, createBackup);
router.post('/backups/:backupId/restore', verifyAdmin, restoreBackup);
router.delete('/backups/:backupId', verifyAdmin, deleteBackup);
router.get('/backups/:backupId/download', verifyAdmin, downloadBackup);

// ===========================================
// ADVANCED ADMIN FEATURES
// ===========================================

// Bulk Actions
router.post('/bulk/suspend-users', verifySuperAdmin, async (req, res, next) => {
  try {
    const { userIds, reason } = req.body;
    
    if (!Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({ message: 'User IDs array is required' });
    }

    const results = await Promise.allSettled(
      userIds.map(userId => 
        User.findByIdAndUpdate(userId, {
          $set: {
            isBlacklisted: true,
            blacklistReason: reason,
            suspendedBy: req.userId,
            suspendedAt: new Date()
          }
        })
      )
    );

    const successful = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;

    // Log bulk action
    await AdminLog.create({
      adminId: req.userId,
      adminUsername: req.adminUser.username,
      action: 'bulk_action_performed',
      targetType: 'user',
      details: {
        targetName: 'Bulk User Suspension',
        operation: 'suspend',
        totalUsers: userIds.length,
        successful,
        failed,
        reason,
        severity: 'high'
      }
    });

    res.status(200).json({
      message: `Bulk suspension completed. ${successful} successful, ${failed} failed.`,
      results: { successful, failed, total: userIds.length }
    });
  } catch (err) {
    next(err);
  }
});

router.post('/bulk/delete-gigs', verifySuperAdmin, async (req, res, next) => {
  try {
    const { gigIds, reason } = req.body;
    
    if (!Array.isArray(gigIds) || gigIds.length === 0) {
      return res.status(400).json({ message: 'Gig IDs array is required' });
    }

    // Check for active orders first
    const activeOrdersCount = await Order.countDocuments({
      gigId: { $in: gigIds },
      status: { $in: ['pending', 'in progress'] }
    });

    if (activeOrdersCount > 0) {
      return res.status(400).json({ 
        message: `Cannot delete gigs with ${activeOrdersCount} active orders` 
      });
    }

    const results = await Promise.allSettled(
      gigIds.map(gigId => Gig.findByIdAndDelete(gigId))
    );

    const successful = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;

    // Log bulk action
    await AdminLog.create({
      adminId: req.userId,
      adminUsername: req.adminUser.username,
      action: 'bulk_action_performed',
      targetType: 'gig',
      details: {
        targetName: 'Bulk Gig Deletion',
        operation: 'delete',
        totalGigs: gigIds.length,
        successful,
        failed,
        reason,
        severity: 'critical'
      }
    });

    res.status(200).json({
      message: `Bulk deletion completed. ${successful} successful, ${failed} failed.`,
      results: { successful, failed, total: gigIds.length }
    });
  } catch (err) {
    next(err);
  }
});

// Platform Statistics
router.get('/statistics/overview', verifyAdmin, async (req, res, next) => {
  try {
    const today = new Date();
    const thirtyDaysAgo = new Date(today.setDate(today.getDate() - 30));
    const sevenDaysAgo = new Date(today.setDate(today.getDate() - 23)); // Reset and go 7 days back

    const [
      todayStats,
      weeklyStats,
      monthlyStats,
      categoryStats,
      geographyStats
    ] = await Promise.all([
      // Today's activity
      Promise.all([
        User.countDocuments({ 
          createdAt: { $gte: new Date().setHours(0,0,0,0) },
          isAdmin: false 
        }),
        Order.countDocuments({ 
          createdAt: { $gte: new Date().setHours(0,0,0,0) } 
        }),
        Gig.countDocuments({ 
          createdAt: { $gte: new Date().setHours(0,0,0,0) } 
        })
      ]),
      
      // Weekly stats
      Promise.all([
        User.countDocuments({ 
          createdAt: { $gte: sevenDaysAgo },
          isAdmin: false 
        }),
        Order.countDocuments({ 
          createdAt: { $gte: sevenDaysAgo } 
        }),
        Order.aggregate([
          { $match: { 
            createdAt: { $gte: sevenDaysAgo },
            paymentStatus: 'paid'
          }},
          { $group: { _id: null, total: { $sum: '$price' } } }
        ])
      ]),
      
      // Monthly stats
      Promise.all([
        User.countDocuments({ 
          createdAt: { $gte: thirtyDaysAgo },
          isAdmin: false 
        }),
        Order.countDocuments({ 
          createdAt: { $gte: thirtyDaysAgo } 
        }),
        Order.aggregate([
          { $match: { 
            createdAt: { $gte: thirtyDaysAgo },
            paymentStatus: 'paid'
          }},
          { $group: { _id: null, total: { $sum: '$price' } } }
        ])
      ]),
      
      // Category performance
      Gig.aggregate([
        { $group: { 
          _id: '$cat', 
          gigCount: { $sum: 1 },
          avgPrice: { $avg: '$price' }
        }},
        { $sort: { gigCount: -1 } },
        { $limit: 10 }
      ]),
      
      // Geography stats (based on user state)
      User.aggregate([
        { $match: { isAdmin: false, state: { $exists: true, $ne: '' } } },
        { $group: { _id: '$state', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 }
      ])
    ]);

    res.status(200).json({
      today: {
        newUsers: todayStats[0],
        newOrders: todayStats[1],
        newGigs: todayStats[2]
      },
      weekly: {
        newUsers: weeklyStats[0],
        newOrders: weeklyStats[1],
        revenue: weeklyStats[2][0]?.total || 0
      },
      monthly: {
        newUsers: monthlyStats[0],
        newOrders: monthlyStats[1],
        revenue: monthlyStats[2][0]?.total || 0
      },
      categories: categoryStats,
      geography: geographyStats
    });
  } catch (err) {
    next(err);
  }
});

// Admin Management (Super Admin only)
router.get('/admins', verifySuperAdmin, async (req, res, next) => {
  try {
    const admins = await User.find({ isAdmin: true })
      .select('-password')
      .sort({ createdAt: -1 });

    res.status(200).json({ admins });
  } catch (err) {
    next(err);
  }
});

router.post('/admins', verifySuperAdmin, async (req, res, next) => {
  try {
    const { userId } = req.body;
    
    const user = await User.findById(userId);
    if (!user) return next(createError(404, "User not found"));
    
    if (user.isAdmin) {
      return res.status(400).json({ message: "User is already an admin" });
    }

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { $set: { isAdmin: true } },
      { new: true }
    ).select('-password');

    await AdminLog.create({
      adminId: req.userId,
      adminUsername: req.adminUser.username,
      action: 'admin_created',
      targetType: 'user',
      targetId: userId,
      targetName: `${user.firstname} ${user.lastname}`,
      details: { severity: 'critical' }
    });

    res.status(200).json({
      message: "User promoted to admin successfully",
      admin: updatedUser
    });
  } catch (err) {
    next(err);
  }
});

router.delete('/admins/:userId', verifySuperAdmin, async (req, res, next) => {
  try {
    const { userId } = req.params;
    
    const user = await User.findById(userId);
    if (!user) return next(createError(404, "User not found"));
    
    if (!user.isAdmin) {
      return res.status(400).json({ message: "User is not an admin" });
    }

    // Prevent removing the last admin
    const adminCount = await User.countDocuments({ isAdmin: true });
    if (adminCount <= 1) {
      return res.status(400).json({ message: "Cannot remove the last admin" });
    }

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { $set: { isAdmin: false } },
      { new: true }
    ).select('-password');

    await AdminLog.create({
      adminId: req.userId,
      adminUsername: req.adminUser.username,
      action: 'admin_removed',
      targetType: 'user',
      targetId: userId,
      targetName: `${user.firstname} ${user.lastname}`,
      details: { severity: 'critical' }
    });

    res.status(200).json({
      message: "Admin privileges removed successfully",
      user: updatedUser
    });
  } catch (err) {
    next(err);
  }
});

export default router;
