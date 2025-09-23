import createError from "../utils/createError.js";
import User from "../models/user.model.js";
import Gig from "../models/gig.model.js";
import Order from "../models/order.model.js";
import Review from "../models/review.model.js";
import Withdrawal from "../models/withdrawal.model.js";
import Conversation from "../models/conversation.model.js";
import Message from "../models/message.model.js";
import Settings from "../models/settings.model.js";
import AdminLog from "../models/adminLog.model.js";
import Refund from "../models/refund.model.js";
import mongoose from "mongoose";
import os from "os";
import metricsService from "../services/metricsService.js";

// Helper function to log admin actions
const logAdminAction = async (adminId, adminUsername, action, targetType, targetId = null, details = {}, oldValues = null, newValues = null, req = null) => {
  try {
    await AdminLog.create({
      adminId,
      adminUsername,
      action,
      targetType,
      targetId,
      targetName: details.targetName || null,
      details,
      oldValues,
      newValues,
      ipAddress: req?.ip || req?.connection?.remoteAddress,
      userAgent: req?.get('User-Agent'),
      severity: details.severity || 'medium'
    });
  } catch (error) {
    console.error('Failed to log admin action:', error);
  }
};

// ===========================================
// REFUND MANAGEMENT (Stubbed endpoints)
// ===========================================

export const getRefunds = async (req, res, next) => {
  try {
    const { status = 'all', dateRange = '30days', minAmount, maxAmount, search } = req.query;

    // Build Mongo filter
    const filter = {};
    if (status !== 'all') filter.status = status;
    if (minAmount) filter.amount = { ...(filter.amount || {}), $gte: Number(minAmount) };
    if (maxAmount) filter.amount = { ...(filter.amount || {}), $lte: Number(maxAmount) };

    // Date range filter (requestedAt)
    const mapRangeToDays = (range) => {
      switch (range) {
        case '7days': return 7;
        case '30days': return 30;
        case '90days': return 90;
        case '1year': return 365;
        default: return null;
      }
    };
    const days = mapRangeToDays(dateRange);
    if (days) {
      const start = new Date();
      start.setDate(start.getDate() - days);
      filter.requestedAt = { $gte: start };
    }

    let refunds = await Refund.find(filter)
      .sort({ requestedAt: -1 })
      .populate({
        path: 'orderId',
        select: '_id gigId buyerId sellerId price createdAt',
        populate: [
          { path: 'gigId', select: 'title cover' },
          { path: 'buyerId', select: 'firstname lastname email img username' },
          { path: 'sellerId', select: 'firstname lastname email img username' }
        ]
      });

    // Optional text search across populated fields
    if (search) {
      const q = String(search).toLowerCase();
      refunds = refunds.filter((r) => {
        const gigTitle = r.orderId?.gigId?.title || '';
        const buyer = `${r.orderId?.buyerId?.firstname || ''} ${r.orderId?.buyerId?.lastname || ''} ${r.orderId?.buyerId?.email || ''} ${r.orderId?.buyerId?.username || ''}`;
        const seller = `${r.orderId?.sellerId?.firstname || ''} ${r.orderId?.sellerId?.lastname || ''} ${r.orderId?.sellerId?.email || ''} ${r.orderId?.sellerId?.username || ''}`;
        return (
          gigTitle.toLowerCase().includes(q) ||
          buyer.toLowerCase().includes(q) ||
          seller.toLowerCase().includes(q)
        );
      });
    }

    // Enrich processedBy with admin firstname/lastname for export display
    const adminIds = Array.from(new Set(
      refunds
        .filter(r => r.processedBy)
        .map(r => String(r.processedBy))
    ));

    let adminMap = {};
    if (adminIds.length) {
      const admins = await User.find({ _id: { $in: adminIds } }).select('firstname lastname');
      adminMap = Object.fromEntries(
        admins.map(a => [a._id.toString(), { _id: a._id.toString(), firstname: a.firstname, lastname: a.lastname }])
      );
    }

    const enrichedRefunds = refunds.map(r => {
      const obj = r.toObject();
      if (obj.processedBy) {
        const key = String(obj.processedBy);
        obj.processedBy = adminMap[key] || { _id: key };
      }
      return obj;
    });

    res.status(200).json({ refunds: enrichedRefunds });
  } catch (err) {
    next(err);
  }
};

export const getRefundStatistics = async (req, res, next) => {
  try {
    const [
      totalRefunds,
      pendingRefunds,
      processingRefunds,
      completedRefunds,
      totalsAgg,
      reasonsAgg,
      avgTimeAgg,
      totalOrders
    ] = await Promise.all([
      Refund.countDocuments({}),
      Refund.countDocuments({ status: 'pending' }),
      Refund.countDocuments({ status: 'processing' }),
      Refund.countDocuments({ status: 'completed' }),
      Refund.aggregate([
        { $match: { status: 'completed' } },
        { $group: { _id: null, totalAmount: { $sum: '$amount' }, avgAmount: { $avg: '$amount' } } }
      ]),
      Refund.aggregate([
        { $group: { _id: '$reason', count: { $sum: 1 } } },
        { $sort: { count: -1 } }
      ]),
      Refund.aggregate([
        { $match: { status: 'completed', processedAt: { $ne: null }, requestedAt: { $ne: null } } },
        { $project: { diffHours: { $divide: [{ $subtract: ['$processedAt', '$requestedAt'] }, 1000 * 60 * 60] } } },
        { $group: { _id: null, avgHours: { $avg: '$diffHours' } } }
      ]),
      Order.countDocuments({})
    ]);

    const totalRefundAmount = totalsAgg[0]?.totalAmount || 0;
    const averageRefundAmount = totalsAgg[0]?.avgAmount || 0;
    const averageProcessingTime = avgTimeAgg[0]?.avgHours ? Number((avgTimeAgg[0].avgHours / 24).toFixed(1)) : 0; // days
    const refundsByReason = reasonsAgg.map(r => ({ reason: r._id || 'Other', count: r.count }));
    const refundRate = totalOrders > 0 ? Number(((completedRefunds / totalOrders) * 100).toFixed(1)) : 0;

    res.status(200).json({
      totalRefunds,
      pendingRefunds,
      processingRefunds,
      completedRefunds,
      totalRefundAmount,
      averageRefundAmount,
      refundRate,
      averageProcessingTime,
      refundsByReason
    });
  } catch (err) {
    next(err);
  }
};

export const processRefund = async (req, res, next) => {
  try {
    const { refundId } = req.params;
    const { action, adminNotes } = req.body;

    if (!['approve', 'reject'].includes(action)) {
      return next(createError(400, 'Invalid refund action'));
    }

    // Validate ObjectId format strictly
    if (!/^[0-9a-fA-F]{24}$/.test(refundId)) {
      return next(createError(400, 'Invalid refund ID format'));
    }

    const refund = await Refund.findById(refundId);
    if (!refund) return next(createError(404, 'Refund not found'));

    let updatedRefund;
    let updatedOrder = null;
    const now = new Date();

    if (action === 'approve') {
      // Mark refund as completed
      updatedRefund = await Refund.findByIdAndUpdate(
        refundId,
        { $set: { status: 'completed', processedAt: now, processedBy: req.userId, adminNotes } },
        { new: true }
      );

      // Update the related order to cancelled/refunded
      if (refund.orderId) {
        updatedOrder = await Order.findByIdAndUpdate(
          refund.orderId,
          {
            $set: {
              status: 'cancelled',
              escrowStatus: 'refunded',
              refundAmount: refund.amount,
              adminNotes,
              refundedAt: now,
              refundedBy: req.userId
            }
          },
          { new: true }
        );
      }

      await logAdminAction(
        req.userId,
        req.adminUser.username,
        'order_refunded',
        'order',
        updatedOrder?._id?.toString() || (refund.orderId?.toString?.() || null),
        {
          targetName: `Order #${String(refund.orderId).slice(-8)}`,
          refundId,
          refundAmount: refund.amount,
          reason: adminNotes,
          severity: 'high'
        },
        null,
        { status: 'cancelled', escrowStatus: 'refunded' },
        req
      );
    } else {
      // Reject refund
      updatedRefund = await Refund.findByIdAndUpdate(
        refundId,
        { $set: { status: 'rejected', processedAt: now, processedBy: req.userId, adminNotes } },
        { new: true }
      );

      await logAdminAction(
        req.userId,
        req.adminUser.username,
        'order_updated',
        'order',
        refund.orderId?.toString?.() || null,
        {
          targetName: `Refund ${refundId}`,
          action: 'reject',
          reason: adminNotes,
          severity: 'medium'
        },
        null,
        { refundStatus: 'rejected' },
        req
      );
    }

    res.status(200).json({
      message: `Refund ${action}d successfully`,
      refund: {
        _id: updatedRefund._id,
        status: updatedRefund.status,
        processedAt: updatedRefund.processedAt,
        processedBy: {
          _id: req.userId,
          firstname: req.adminUser?.firstname || 'Admin',
          lastname: req.adminUser?.lastname || 'User'
        },
        adminNotes: updatedRefund.adminNotes || ''
      }
    });
  } catch (err) {
    next(err);
  }
};

export const getSystemPerformance = async (req, res, next) => {
  try {
    // Use in-memory metrics captured by middleware
    const apiEndpoints = metricsService.getEndpointStats(24 * 60 * 60 * 1000);

    res.status(200).json({
      apiEndpoints,
      slowQueries: [],
      resourceUsage: { cpu: [], memory: [], disk: [] }
    });
  } catch (err) {
    next(err);
  }
};

export const getSystemAlerts = async (req, res, next) => {
  try {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const logs = await AdminLog.find({ createdAt: { $gte: since } })
      .sort({ createdAt: -1 })
      .limit(100);

    const alerts = logs
      .filter(l => l.success === false || ['high', 'critical'].includes(l.severity))
      .map(l => ({
        id: l._id.toString(),
        type: l.severity || (l.success === false ? 'critical' : 'info'),
        title: String(l.action || 'system_event').replace(/_/g, ' '),
        message: l.errorMessage || (l.details?.message || 'System event requires attention'),
        timestamp: l.createdAt,
        service: 'API Server',
        status: 'active',
        acknowledgedBy: null
      }));

    res.status(200).json({ alerts });
  } catch (err) {
    next(err);
  }
};

export const acknowledgeSystemAlert = async (req, res, next) => {
  try {
    const { alertId } = req.params;
    // In a real implementation, persist acknowledgement in DB. Here we simply return success.
    await logAdminAction(
      req.userId,
      req.adminUser.username,
      'system_settings_changed',
      'system',
      `alert_${alertId}`,
      { targetName: 'Acknowledge Alert', operation: 'acknowledge_alert' },
      {},
      {},
      req
    );
    res.status(200).json({ message: `Alert ${alertId} acknowledged` });
  } catch (err) {
    next(err);
  }
};
// ===========================================
// BACKUP MANAGEMENT (Stubbed endpoints)
// ===========================================

export const getBackups = async (req, res, next) => {
  try {
    // Derive backups from admin logs (create_backup/restore_backup/delete_backup)
    const logs = await AdminLog.find({ 'details.operation': { $in: ['create_backup', 'restore_backup', 'delete_backup'] } })
      .sort({ createdAt: -1 })
      .limit(100);

    const backups = logs
      .filter(l => l.details?.operation === 'create_backup')
      .map(l => ({
        _id: l._id.toString(),
        name: l.details?.targetName || 'Manual Backup',
        type: l.newValues?.type || l.details?.type || 'full',
        status: l.success === false ? 'failed' : 'completed',
        size: 0,
        createdAt: l.createdAt,
        completedAt: l.createdAt,
        duration: 0,
        location: null,
        includes: [],
        createdBy: { _id: l.adminId, firstname: req.adminUser?.firstname || 'System', lastname: req.adminUser?.lastname || 'Admin' },
        compressed: false,
        encrypted: false,
        checksum: null,
        notes: l.details?.note || null
      }));

    res.status(200).json({ backups });
  } catch (err) {
    next(err);
  }
};

export const getBackupStatistics = async (req, res, next) => {
  try {
    const logs = await AdminLog.find({ 'details.operation': 'create_backup' })
      .sort({ createdAt: -1 })
      .limit(100);

    const totalBackups = logs.length;
    const successfulBackups = logs.filter(l => l.success !== false).length;
    const failedBackups = logs.filter(l => l.success === false).length;
    const lastBackup = logs[0]?.createdAt || null;

    res.status(200).json({
      totalBackups,
      successfulBackups,
      failedBackups,
      totalSize: 0,
      averageSize: 0,
      lastBackup,
      nextScheduled: null,
      retentionDays: 0,
      storageUsed: 0,
      autoBackupEnabled: false,
      backupFrequency: 'manual'
    });
  } catch (err) {
    next(err);
  }
};

export const createBackup = async (req, res, next) => {
  try {
    const { name = 'Manual Backup', type = 'full' } = req.body || {};

    // Log backup creation request
    await logAdminAction(
      req.userId,
      req.adminUser.username,
      'system_settings_changed',
      'system',
      'backup_create',
      { targetName: name, operation: 'create_backup', type },
      {},
      req.body || {},
      req
    );

    res.status(200).json({ message: 'Backup creation started', backupId: `bkp_${Date.now()}` });
  } catch (err) {
    next(err);
  }
};

export const restoreBackup = async (req, res, next) => {
  try {
    const { backupId } = req.params;

    await logAdminAction(
      req.userId,
      req.adminUser.username,
      'system_settings_changed',
      'system',
      backupId,
      { targetName: 'Restore Backup', operation: 'restore_backup' },
      {},
      {},
      req
    );

    res.status(200).json({ message: 'Backup restore initiated', restoreId: `rst_${Date.now()}` });
  } catch (err) {
    next(err);
  }
};

export const deleteBackup = async (req, res, next) => {
  try {
    const { backupId } = req.params;

    await logAdminAction(
      req.userId,
      req.adminUser.username,
      'system_settings_changed',
      'system',
      backupId,
      { targetName: 'Delete Backup', operation: 'delete_backup' },
      {},
      {},
      req
    );

    res.status(200).json({ message: 'Backup deleted successfully' });
  } catch (err) {
    next(err);
  }
};

export const downloadBackup = async (req, res, next) => {
  try {
    const { backupId } = req.params;
    res.status(200).json({ downloadUrl: null, message: `Download link for ${backupId} will be emailed to you` });
  } catch (err) {
    next(err);
  }
};

// ===========================================
// DASHBOARD & ANALYTICS
// ===========================================

export const getDashboardStats = async (req, res, next) => {
  try {
    const [
      totalUsers,
      totalSellers,
      totalBuyers,
      totalGigs,
      activeGigs,
      totalOrders,
      activeOrders,
      completedOrders,
      totalDisputes,
      pendingDisputes,
      totalWithdrawals,
      pendingWithdrawals,
      totalRevenue,
      monthlyRevenue,
      newUsersThisMonth,
      newGigsThisMonth
    ] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ isSeller: true }),
      User.countDocuments({ isSeller: false }),
      Gig.countDocuments(),
      Gig.countDocuments({ status: 'active' }),
      Order.countDocuments(),
      Order.countDocuments({ status: { $in: ['pending', 'in progress'] } }),
      Order.countDocuments({ status: 'completed' }),
      Order.countDocuments({ disputeStatus: { $ne: 'none' } }),
      Order.countDocuments({ disputeStatus: { $in: ['pending', 'under_review'] } }),
      Withdrawal.countDocuments(),
      Withdrawal.countDocuments({ status: 'pending' }),
      Order.aggregate([
        { $match: { paymentStatus: 'paid' } },
        { $group: { _id: null, total: { $sum: '$price' } } }
      ]),
      Order.aggregate([
        { 
          $match: { 
            paymentStatus: 'paid',
            createdAt: { $gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) }
          }
        },
        { $group: { _id: null, total: { $sum: '$price' } } }
      ]),
      User.countDocuments({
        // isAdmin: false,
        createdAt: { $gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) }
      }),
      Gig.countDocuments({
        createdAt: { $gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) }
      })
    ]);

    // Get recent activities
    const recentOrders = await Order.find()
      .sort({ createdAt: -1 })
      .limit(5)
      .populate('buyerId', 'username firstname lastname')
      .populate('sellerId', 'username firstname lastname');

    const recentUsers = await User.find()
      .sort({ createdAt: -1 })
      .limit(5)
      .select('username firstname lastname email createdAt isSeller');

    // Get platform growth data (last 12 months)
    const growthData = await User.aggregate([
      {
        $match: {
          // isAdmin: false,
          createdAt: { $gte: new Date(new Date().setFullYear(new Date().getFullYear() - 1)) }
        }
      },
      {
        $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' }
          },
          users: { $sum: 1 }
        }
      },
      { $sort: { '_id.year': 1, '_id.month': 1 } }
    ]);

    const stats = {
      overview: {
        totalUsers,
        totalSellers,
        totalBuyers,
        totalGigs,
        activeGigs,
        totalOrders,
        activeOrders,
        completedOrders,
        totalDisputes,
        pendingDisputes,
        totalWithdrawals,
        pendingWithdrawals,
        totalRevenue: totalRevenue[0]?.total || 0,
        monthlyRevenue: monthlyRevenue[0]?.total || 0,
        newUsersThisMonth,
        newGigsThisMonth
      },
      recentActivities: {
        orders: recentOrders,
        users: recentUsers
      },
      growthData
    };

    await logAdminAction(
      req.userId,
      req.adminUser.username,
      'dashboard_accessed',
      'system',
      null,
      { targetName: 'Admin Dashboard' },
      null,
      null,
      req
    );

    res.status(200).json(stats);
  } catch (err) {
    next(err);
  }
};

// ===========================================
// USER MANAGEMENT
// ===========================================

export const getAllUsers = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const search = req.query.search || '';
    const role = req.query.role || 'all'; // all, seller, buyer, admin
    const status = req.query.status || 'all'; // all, active, suspended, flagged
    const verification = req.query.verification || 'all'; // all, verified, unverified
    const sortBy = req.query.sortBy || 'createdAt';
    const sortOrder = req.query.sortOrder || 'desc';

    // Build filter query
    let filter = {};
    
    if (search) {
      filter.$or = [
        { username: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { firstname: { $regex: search, $options: 'i' } },
        { lastname: { $regex: search, $options: 'i' } }
      ];
    }

    if (role === 'seller') filter.isSeller = true;
    else if (role === 'buyer') filter.isSeller = false;
    else if (role === 'admin') filter.isAdmin = true;
    else if (role === 'regular') filter.isAdmin = false;

    if (status === 'suspended') filter.isBlacklisted = true;
    else if (status === 'active') filter.isBlacklisted = false;
    else if (status === 'flagged') filter.fraudFlags = { $gt: 0 };

    if (verification === 'verified') filter.emailVerified = true;
    else if (verification === 'unverified') filter.emailVerified = false;

    const skip = (page - 1) * limit;
    const sort = { [sortBy]: sortOrder === 'desc' ? -1 : 1 };

    const [users, totalUsers] = await Promise.all([
      User.find(filter)
        .select('-password')
        .sort(sort)
        .skip(skip)
        .limit(limit),
      User.countDocuments(filter)
    ]);

    const totalPages = Math.ceil(totalUsers / limit);

    res.status(200).json({
      users,
      pagination: {
        currentPage: page,
        totalPages,
        totalUsers,
        limit,
        hasNext: page < totalPages,
        hasPrev: page > 1
      }
    });
  } catch (err) {
    next(err);
  }
};

export const getUserDetails = async (req, res, next) => {
  try {
    const { userId } = req.params;
    
    const [user, userGigs, userOrders, userReviews, userWithdrawals] = await Promise.all([
      User.findById(userId).select('-password'),
      Gig.find({ userId }).sort({ createdAt: -1 }),
      Order.find({ $or: [{ buyerId: userId }, { sellerId: userId }] })
        .sort({ createdAt: -1 })
        .populate('buyerId', 'username firstname lastname')
        .populate('sellerId', 'username firstname lastname'),
      Review.find({ $or: [{ userId }, { freelancerId: userId }] })
        .sort({ createdAt: -1 })
        .populate('userId', 'username firstname lastname'),
      Withdrawal.find({ freelancerId: userId }).sort({ createdAt: -1 })
    ]);

    if (!user) return next(createError(404, "User not found"));

    // Calculate user statistics
    const stats = {
      totalGigs: userGigs.length,
      totalOrders: userOrders.length,
      ordersAsBuyer: userOrders.filter(o => o.buyerId._id.toString() === userId).length,
      ordersAsSeller: userOrders.filter(o => o.sellerId._id.toString() === userId).length,
      completedOrders: userOrders.filter(o => o.status === 'completed').length,
      totalReviews: userReviews.length,
      averageRating: user.averageRating,
      totalEarnings: userOrders
        .filter(o => o.sellerId._id.toString() === userId && o.status === 'completed')
        .reduce((sum, o) => sum + o.price, 0),
      totalSpent: userOrders
        .filter(o => o.buyerId._id.toString() === userId && o.status === 'completed')
        .reduce((sum, o) => sum + o.price, 0),
      totalWithdrawals: userWithdrawals.reduce((sum, w) => sum + w.amount, 0),
      pendingWithdrawals: userWithdrawals
        .filter(w => w.status === 'pending')
        .reduce((sum, w) => sum + w.amount, 0)
    };

    res.status(200).json({
      user,
      stats,
      gigs: userGigs,
      orders: userOrders,
      reviews: userReviews,
      withdrawals: userWithdrawals
    });
  } catch (err) {
    next(err);
  }
};

export const updateUser = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const updates = req.body;
    
    const oldUser = await User.findById(userId);
    if (!oldUser) return next(createError(404, "User not found"));

    // Prevent updating sensitive fields
    delete updates.password;
    delete updates._id;
    delete updates.__v;

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { $set: updates },
      { new: true, runValidators: true }
    ).select('-password');

    await logAdminAction(
      req.userId,
      req.adminUser.username,
      'user_updated',
      'user',
      userId,
      { targetName: `${updatedUser.firstname} ${updatedUser.lastname}` },
      oldUser.toObject(),
      updatedUser.toObject(),
      req
    );

    res.status(200).json({
      message: "User updated successfully",
      user: updatedUser
    });
  } catch (err) {
    next(err);
  }
};

export const suspendUser = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const { reason, duration } = req.body; // duration in days, null for permanent
    
    // Input validation
    if (!reason || reason.trim().length < 5) {
      return next(createError(400, "Suspension reason must be at least 5 characters long"));
    }
    
    if (duration && (isNaN(duration) || duration < 1 || duration > 365)) {
      return next(createError(400, "Duration must be between 1 and 365 days"));
    }
    
    const user = await User.findById(userId);
    if (!user) return next(createError(404, "User not found"));
    
    // Prevent suspending other admins (only super admins can suspend admins)
    if (user.isAdmin && !req.adminUser?.isSuperAdmin) {
      return next(createError(403, "Only super admins can suspend other admins"));
    }
    
    // Prevent self-suspension
    if (userId === req.userId) {
      return next(createError(400, "You cannot suspend yourself"));
    }

    const suspensionEnd = duration ? new Date(Date.now() + duration * 24 * 60 * 60 * 1000) : null;
    
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      {
        $set: {
          isBlacklisted: true,
          blacklistReason: reason,
          suspensionEnd,
          suspendedBy: req.userId,
          suspendedAt: new Date()
        }
      },
      { new: true }
    ).select('-password');

    await logAdminAction(
      req.userId,
      req.adminUser.username,
      'user_suspended',
      'user',
      userId,
      { 
        targetName: `${user.firstname} ${user.lastname}`,
        reason,
        duration: duration || 'permanent',
        severity: 'high'
      },
      null,
      { suspended: true, reason },
      req
    );

    res.status(200).json({
      message: "User suspended successfully",
      user: updatedUser
    });
  } catch (err) {
    next(err);
  }
};

export const unsuspendUser = async (req, res, next) => {
  try {
    const { userId } = req.params;
    
    const user = await User.findById(userId);
    if (!user) return next(createError(404, "User not found"));

    // Prevent unsuspending other admins (only super admins can unsuspend admins)
    if (user.isAdmin && !req.adminUser?.isSuperAdmin) {
      return next(createError(403, "Only super admins can unsuspend other admins"));
    }

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      {
        $unset: {
          blacklistReason: "",
          suspensionEnd: "",
          suspendedBy: "",
          suspendedAt: ""
        },
        $set: { isBlacklisted: false }
      },
      { new: true }
    ).select('-password');

    await logAdminAction(
      req.userId,
      req.adminUser.username,
      'user_unsuspended',
      'user',
      userId,
      { 
        targetName: `${user.firstname} ${user.lastname}`,
        severity: 'medium'
      },
      null,
      { suspended: false },
      req
    );

    res.status(200).json({
      message: "User unsuspended successfully",
      user: updatedUser
    });
  } catch (err) {
    next(err);
  }
};

export const deleteUser = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const { reason } = req.body;
    
    // Input validation
    if (!reason || reason.trim().length < 10) {
      return next(createError(400, "Deletion reason must be at least 10 characters long"));
    }
    
    const user = await User.findById(userId);
    if (!user) return next(createError(404, "User not found"));
    
    // Prevent deleting other admins (super admin only)
    if (user.isAdmin && !req.isSuperAdmin) {
      return next(createError(403, "Only super admins can delete admin accounts"));
    }
    
    // Prevent self-deletion
    if (userId === req.userId) {
      return next(createError(400, "You cannot delete your own account"));
    }
    
    // Prevent deleting users with recent activity (within 30 days) unless forced
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    if (user.lastSeen && user.lastSeen > thirtyDaysAgo && !req.body.force) {
      return next(createError(400, "Cannot delete recently active users without force=true"));
    }

    // Check if user has active orders
    const activeOrders = await Order.countDocuments({
      $or: [{ buyerId: userId }, { sellerId: userId }],
      status: { $in: ['pending', 'in progress'] }
    });

    if (activeOrders > 0) {
      return next(createError(400, "Cannot delete user with active orders"));
    }

    // Soft delete - mark as deleted instead of actually deleting
    const deletedUser = await User.findByIdAndUpdate(
      userId,
      {
        $set: {
          isDeleted: true,
          deletedAt: new Date(),
          deletedBy: req.userId,
          deletionReason: reason,
          email: `deleted_${userId}@deleted.com`, // Prevent email conflicts
          username: `deleted_${userId}`
        }
      },
      { new: true }
    ).select('-password');

    await logAdminAction(
      req.userId,
      req.adminUser.username,
      'user_deleted',
      'user',
      userId,
      { 
        targetName: `${user.firstname} ${user.lastname}`,
        reason,
        severity: 'critical'
      },
      null,
      { deleted: true, reason },
      req
    );

    res.status(200).json({
      message: "User deleted successfully",
      user: deletedUser
    });
  } catch (err) {
    next(err);
  }
};

// ===========================================
// GIG MANAGEMENT
// ===========================================

export const getAllGigs = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const search = req.query.search || '';
    const category = req.query.category || '';
    const status = req.query.status || 'all'; // all, active, paused, pending_review
    const sortBy = req.query.sortBy || 'createdAt';
    const sortOrder = req.query.sortOrder || 'desc';

    let filter = {};
    
    if (search) {
      filter.$or = [
        { title: { $regex: search, $options: 'i' } },
        { desc: { $regex: search, $options: 'i' } },
        { shortTitle: { $regex: search, $options: 'i' } }
      ];
    }

    if (category) filter.cat = category;
    // Apply status filter when provided
    if (status && status !== 'all') {
      // Normalize potential alias from legacy frontend
      const normalized = status === 'pending_review' ? 'pending' : status;
      const allowedStatuses = ['active', 'paused', 'pending', 'rejected', 'suspended', 'draft'];
      if (allowedStatuses.includes(normalized)) {
        filter.status = normalized;
      }
    }

    const skip = (page - 1) * limit;
    const sort = { [sortBy]: sortOrder === 'desc' ? -1 : 1 };

    const [gigs, totalGigs] = await Promise.all([
      Gig.find(filter)
        .populate('userId', 'username firstname lastname email img')
        .sort(sort)
        .skip(skip)
        .limit(limit),
      Gig.countDocuments(filter)
    ]);

    const totalPages = Math.ceil(totalGigs / limit);

    res.status(200).json({
      gigs,
      pagination: {
        currentPage: page,
        totalPages,
        totalGigs,
        limit,
        hasNext: page < totalPages,
        hasPrev: page > 1
      }
    });
  } catch (err) {
    next(err);
  }
};

export const getGigDetails = async (req, res, next) => {
  try {
    const { gigId } = req.params;
    
    const [gig, gigOrders, gigReviews] = await Promise.all([
      Gig.findById(gigId).populate('userId', 'username firstname lastname email img'),
      Order.find({ gigId }).populate('buyerId', 'username firstname lastname'),
      Review.find({ gigId }).populate('userId', 'username firstname lastname')
    ]);

    if (!gig) return next(createError(404, "Gig not found"));

    const stats = {
      totalOrders: gigOrders.length,
      completedOrders: gigOrders.filter(o => o.status === 'completed').length,
      totalRevenue: gigOrders
        .filter(o => o.status === 'completed')
        .reduce((sum, o) => sum + o.price, 0),
      averageRating: gig.totalStars > 0 ? gig.totalStars / gig.starNumber : 0,
      totalReviews: gigReviews.length
    };

    res.status(200).json({
      gig,
      stats,
      orders: gigOrders,
      reviews: gigReviews
    });
  } catch (err) {
    next(err);
  }
};

export const updateGig = async (req, res, next) => {
  try {
    const { gigId } = req.params;
    const updates = req.body;
    
    const oldGig = await Gig.findById(gigId);
    if (!oldGig) return next(createError(404, "Gig not found"));

    delete updates._id;
    delete updates.__v;
    delete updates.userId; // Prevent changing gig owner

    const updatedGig = await Gig.findByIdAndUpdate(
      gigId,
      { $set: updates },
      { new: true, runValidators: true }
    ).populate('userId', 'username firstname lastname');

    await logAdminAction(
      req.userId,
      req.adminUser.username,
      'gig_updated',
      'gig',
      gigId,
      { targetName: updatedGig.title },
      oldGig.toObject(),
      updatedGig.toObject(),
      req
    );

    res.status(200).json({
      message: "Gig updated successfully",
      gig: updatedGig
    });
  } catch (err) {
    next(err);
  }
};

export const deleteGig = async (req, res, next) => {
  try {
    const { gigId } = req.params;
    const { reason } = req.body;
    
    const gig = await Gig.findById(gigId);
    if (!gig) return next(createError(404, "Gig not found"));

    // Check for active orders
    const activeOrders = await Order.countDocuments({
      gigId,
      status: { $in: ['pending', 'in progress'] }
    });

    if (activeOrders > 0) {
      return next(createError(400, "Cannot delete gig with active orders"));
    }

    await Gig.findByIdAndDelete(gigId);

    await logAdminAction(
      req.userId,
      req.adminUser.username,
      'gig_deleted',
      'gig',
      gigId,
      { 
        targetName: gig.title,
        reason,
        severity: 'high'
      },
      gig.toObject(),
      null,
      req
    );

    res.status(200).json({
      message: "Gig deleted successfully"
    });
  } catch (err) {
    next(err);
  }
};

// ===========================================
// ORDER MANAGEMENT
// ===========================================

export const getAllOrders = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const status = req.query.status || 'all';
    const escrowStatus = req.query.escrowStatus || 'all';
    const disputeStatus = req.query.disputeStatus || 'all';
    const sortBy = req.query.sortBy || 'createdAt';
    const sortOrder = req.query.sortOrder || 'desc';
    const search = req.query.search || '';

    let filter = {};
    
    // Normalize status aliases from the frontend
    // - "active" => "in progress"
    // - "refunded" => status "cancelled" with escrowStatus "refunded"
    const normalizedStatus = status === 'active'
      ? 'in progress'
      : (status === 'refunded' ? 'cancelled' : status);

    if (normalizedStatus !== 'all') filter.status = normalizedStatus;
    if (escrowStatus !== 'all') {
      filter.escrowStatus = escrowStatus;
    } else if (status === 'refunded') {
      filter.escrowStatus = 'refunded';
    }

    // Text search on order title (gig title snapshot)
    if (search) {
      filter.title = { $regex: new RegExp(search, 'i') };
    }

    if (disputeStatus === 'disputed') filter.disputeStatus = { $ne: 'none' };
    else if (disputeStatus !== 'all') filter.disputeStatus = disputeStatus;

    const skip = (page - 1) * limit;
    const sort = { [sortBy]: sortOrder === 'desc' ? -1 : 1 };

    const [orders, totalOrders] = await Promise.all([
      Order.find(filter)
        .populate('buyerId', 'username firstname lastname email img')
        .populate('sellerId', 'username firstname lastname email img')
        .populate('gigId', 'title')
        .sort(sort)
        .skip(skip)
        .limit(limit),
      Order.countDocuments(filter)
    ]);

    const totalPages = Math.ceil(totalOrders / limit);

    res.status(200).json({
      orders,
      pagination: {
        currentPage: page,
        totalPages,
        totalOrders,
        limit,
        hasNext: page < totalPages,
        hasPrev: page > 1
      }
    });
  } catch (err) {
    next(err);
  }
};

export const getOrderDetails = async (req, res, next) => {
  try {
    const { orderId } = req.params;
    
    const order = await Order.findById(orderId)
      .populate('buyerId', 'username firstname lastname email img')
      .populate('sellerId', 'username firstname lastname email img')
      .populate('gigId', 'title cover price');

    if (!order) return next(createError(404, "Order not found"));

    // Get conversation for this order
    const conversation = await Conversation.findOne({
      $or: [
        { id: `${order.buyerId._id}${order.sellerId._id}` },
        { id: `${order.sellerId._id}${order.buyerId._id}` }
      ]
    });

    let messages = [];
    if (conversation) {
      messages = await Message.find({ conversationId: conversation._id })
        .sort({ createdAt: 1 })
        .limit(50);
    }

    res.status(200).json({
      order,
      conversation,
      messages
    });
  } catch (err) {
    next(err);
  }
};

export const updateOrderStatus = async (req, res, next) => {
  try {
    const { orderId } = req.params;
    const { status, escrowStatus, reason } = req.body;
    
    const oldOrder = await Order.findById(orderId);
    if (!oldOrder) return next(createError(404, "Order not found"));

    const updates = {};
    if (status) updates.status = status;
    if (escrowStatus) updates.escrowStatus = escrowStatus;
    if (reason) updates.adminNotes = reason;

    const updatedOrder = await Order.findByIdAndUpdate(
      orderId,
      { $set: updates },
      { new: true }
    ).populate('buyerId', 'username firstname lastname')
     .populate('sellerId', 'username firstname lastname');

    await logAdminAction(
      req.userId,
      req.adminUser.username,
      'order_updated',
      'order',
      orderId,
      { 
        targetName: `Order #${orderId.slice(-8)}`,
        reason,
        oldStatus: oldOrder.status,
        newStatus: status,
        severity: 'medium'
      },
      { status: oldOrder.status, escrowStatus: oldOrder.escrowStatus },
      updates,
      req
    );

    res.status(200).json({
      message: "Order updated successfully",
      order: updatedOrder
    });
  } catch (err) {
    next(err);
  }
};

export const refundOrder = async (req, res, next) => {
  try {
    const { orderId } = req.params;
    const { amount, reason } = req.body;
    
    // Dev fallback: handle mock IDs gracefully so AdminOrders mock data can trigger success
    const isMockId = !/^[0-9a-fA-F]{24}$/.test(orderId) || String(orderId).startsWith('mock');
    if (isMockId) {
      const refundAmount = amount || 0;
      await logAdminAction(
        req.userId,
        req.adminUser.username,
        'order_refunded',
        'order',
        orderId,
        {
          targetName: `Order #${String(orderId).slice(-8)}`,
          reason,
          refundAmount,
          severity: 'high'
        },
        null,
        { status: 'cancelled', refundAmount },
        req
      );
      return res.status(200).json({
        message: "Order refunded successfully (mock)",
        order: {
          _id: orderId,
          status: 'cancelled',
          escrowStatus: 'refunded',
          refundAmount,
          adminNotes: reason,
          refundedAt: new Date(),
          refundedBy: req.userId
        },
        refundId: null
      });
    }

    const order = await Order.findById(orderId);
    if (!order) return next(createError(404, "Order not found"));

    // Prevent double refund
    if (order.escrowStatus === 'refunded') {
      return next(createError(400, 'Order has already been refunded'));
    }

    const refundAmount = amount || order.price;
    
    const updatedOrder = await Order.findByIdAndUpdate(
      orderId,
      {
        $set: {
          status: 'cancelled',
          escrowStatus: 'refunded',
          refundAmount,
          adminNotes: reason,
          refundedAt: new Date(),
          refundedBy: req.userId
        }
      },
      { new: true }
    ).populate('buyerId', 'username firstname lastname')
     .populate('sellerId', 'username firstname lastname');

    // Create a Refund record for AdminRefunds page visibility
    let createdRefund = null;
    try {
      createdRefund = await Refund.create({
        orderId: updatedOrder._id,
        buyerId: String(updatedOrder.buyerId?._id || updatedOrder.buyerId),
        sellerId: String(updatedOrder.sellerId?._id || updatedOrder.sellerId),
        amount: refundAmount,
        reason: reason || 'Admin refund',
        description: reason || 'Refund initiated from Admin Orders',
        status: 'completed',
        requestedAt: new Date(),
        processedAt: new Date(),
        processedBy: req.userId,
        adminNotes: reason || '',
        priority: 'medium',
        refundMethod: 'original_payment'
      });
    } catch (e) {
      // Do not fail the main flow if refund record creation fails
      console.error('Failed to create Refund record:', e?.message);
    }

    await logAdminAction(
      req.userId,
      req.adminUser.username,
      'order_refunded',
      'order',
      orderId,
      { 
        targetName: `Order #${orderId.slice(-8)}`,
        reason,
        refundAmount,
        severity: 'high'
      },
      { status: order.status, refundAmount: order.refundAmount },
      { status: 'cancelled', refundAmount },
      req
    );

    res.status(200).json({
      message: "Order refunded successfully",
      order: updatedOrder,
      refundId: createdRefund?._id || null
    });
  } catch (err) {
    next(err);
  }
};

// ===========================================
// WITHDRAWAL MANAGEMENT
// ===========================================

export const getAllWithdrawals = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const status = req.query.status || 'all';
    const sortBy = req.query.sortBy || 'createdAt';
    const sortOrder = req.query.sortOrder || 'desc';

    let filter = {};
    if (status !== 'all') filter.status = status;

    const skip = (page - 1) * limit;
    const sort = { [sortBy]: sortOrder === 'desc' ? -1 : 1 };

    const [withdrawals, totalWithdrawals] = await Promise.all([
      Withdrawal.find(filter)
        .populate('freelancerId', 'username firstname lastname email')
        .sort(sort)
        .skip(skip)
        .limit(limit),
      Withdrawal.countDocuments(filter)
    ]);

    const totalPages = Math.ceil(totalWithdrawals / limit);

    res.status(200).json({
      withdrawals,
      pagination: {
        currentPage: page,
        totalPages,
        totalWithdrawals,
        limit,
        hasNext: page < totalPages,
        hasPrev: page > 1
      }
    });
  } catch (err) {
    next(err);
  }
};

export const updateWithdrawalStatus = async (req, res, next) => {
  try {
    const { withdrawalId } = req.params;
    const { status, failureReason, transactionReference, notes } = req.body;
    
    const oldWithdrawal = await Withdrawal.findById(withdrawalId);
    if (!oldWithdrawal) return next(createError(404, "Withdrawal not found"));

    const updates = {
      status,
      processedBy: req.userId,
      processedAt: new Date()
    };

    if (failureReason) updates.failureReason = failureReason;
    if (transactionReference) updates.transactionReference = transactionReference;
    if (notes) updates.notes = notes;

    const updatedWithdrawal = await Withdrawal.findByIdAndUpdate(
      withdrawalId,
      { $set: updates },
      { new: true }
    ).populate('freelancerId', 'username firstname lastname');

    await logAdminAction(
      req.userId,
      req.adminUser.username,
      status === 'completed' ? 'withdrawal_approved' : 'withdrawal_rejected',
      'withdrawal',
      withdrawalId,
      { 
        targetName: `₦${oldWithdrawal.amount.toLocaleString()} to ${updatedWithdrawal.freelancerId.username}`,
        reason: failureReason || notes,
        amount: oldWithdrawal.amount,
        severity: 'high'
      },
      { status: oldWithdrawal.status },
      { status, failureReason, notes },
      req
    );

    res.status(200).json({
      message: `Withdrawal ${status} successfully`,
      withdrawal: updatedWithdrawal
    });
  } catch (err) {
    next(err);
  }
};

// ===========================================
// SYSTEM MANAGEMENT
// ===========================================

export const getSystemLogs = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const action = req.query.action || '';
    const targetType = req.query.targetType || '';
    const severity = req.query.severity || '';
    const adminId = req.query.adminId || '';
    const search = req.query.search || '';
    const startDate = req.query.startDate;
    const endDate = req.query.endDate;

    let filter = {};
    
    if (action) filter.action = action;
    if (targetType) filter.targetType = targetType;
    if (severity) filter.severity = severity;
    if (adminId) filter.adminId = adminId;
    
    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = new Date(startDate);
      if (endDate) filter.createdAt.$lte = new Date(endDate);
    }

    // Text search across common fields
    if (search) {
      const regex = new RegExp(search, 'i');
      filter.$or = [
        { adminUsername: regex },
        { targetName: regex },
        { action: regex },
        { targetType: regex },
        { ipAddress: regex },
        { errorMessage: regex },
      ];
    }

    const skip = (page - 1) * limit;

    const [logs, totalLogs] = await Promise.all([
      AdminLog.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      AdminLog.countDocuments(filter)
    ]);

    const totalPages = Math.ceil(totalLogs / limit);

    // Get log statistics
    const logStats = await AdminLog.aggregate([
      { $match: filter },
      {
        $group: {
          _id: '$severity',
          count: { $sum: 1 }
        }
      }
    ]);

    res.status(200).json({
      logs,
      statistics: logStats,
      pagination: {
        currentPage: page,
        totalPages,
        totalLogs,
        limit,
        hasNext: page < totalPages,
        hasPrev: page > 1
      }
    });
  } catch (err) {
    next(err);
  }
};

export const getSystemHealth = async (req, res, next) => {
  try {
    // Database connection status
    const dbStatus = mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';
    
    // Get various system metrics
    const now = Date.now();
    const oneMinuteAgo = new Date(now - 60 * 1000);
    const tenMinutesAgo = new Date(now - 10 * 60 * 1000);
    const oneHourAgo = new Date(now - 60 * 60 * 1000);
    const oneDayAgo = new Date(now - 24 * 60 * 60 * 1000);

    const [
      userCount,
      gigCount,
      orderCount,
      activeOrders,
      pendingDisputes,
      pendingWithdrawals,
      systemErrors,
      activeUsers,
      errorLogsLastHour,
      totalLogsLastHour,
      diskUsageSnapshot
    ] = await Promise.all([
      User.countDocuments({ isAdmin: false }),
      Gig.countDocuments(),
      Order.countDocuments(),
      Order.countDocuments({ status: { $in: ['pending', 'in progress'] } }),
      Order.countDocuments({ disputeStatus: { $in: ['pending', 'under_review'] } }),
      Withdrawal.countDocuments({ status: 'pending' }),
      AdminLog.countDocuments({ success: false, createdAt: { $gte: oneDayAgo } }),
      User.countDocuments({ lastSeen: { $gte: tenMinutesAgo } }),
      AdminLog.countDocuments({ success: false, createdAt: { $gte: oneHourAgo } }),
      AdminLog.countDocuments({ createdAt: { $gte: oneHourAgo } }),
      metricsService.getDiskUsage()
    ]);

    // Calculate system health score
    let healthScore = 100;
    if (dbStatus !== 'connected') healthScore -= 50;
    if (systemErrors > 10) healthScore -= 20;
    if (pendingDisputes > 50) healthScore -= 10;
    if (pendingWithdrawals > 100) healthScore -= 10;
    
    const totalMem = os.totalmem?.() || 0;
    const usedMem = process.memoryUsage().rss;
    const memoryUsagePercent = totalMem ? Number(((usedMem / totalMem) * 100).toFixed(1)) : 0;
    const uptimePercent = Math.min(100, Number(((process.uptime() / (60 * 60 * 24)) * 100).toFixed(2))); // relative to 24h window

    // Live metrics from middleware
    const avgResponseMs = metricsService.getAverageResponseTime();
    const rpm = metricsService.getRequestsPerMinute();
    const cpuPercent = metricsService.getCpuUsage();

    // Error rate over last hour derived from endpoint stats
    const endpointHour = metricsService.getEndpointStats(60 * 60 * 1000);
    const totReq = endpointHour.reduce((s, e) => s + e.requestCount, 0);
    const totErr = endpointHour.reduce((s, e) => s + Math.round(e.errorRate * e.requestCount), 0);
    const errorRate = totReq > 0 ? Number(((totErr / totReq) * 100).toFixed(2)) : (totalLogsLastHour > 0 ? Number(((errorLogsLastHour / totalLogsLastHour) * 100).toFixed(2)) : 0);

    // Last 24-hour response time points for chart
    const last24 = metricsService.getLast24ResponseTimePoints();
    // Rolling-window response stats
    const resp5m = metricsService.getResponseStats(5 * 60 * 1000);
    const resp1h = metricsService.getResponseStats(60 * 60 * 1000);

    const health = {
      overall: healthScore >= 80 ? 'healthy' : healthScore >= 60 ? 'warning' : 'critical',
      score: healthScore,
      // Cards-compatible fields
      uptime: uptimePercent,
      responseTime: avgResponseMs,
      errorRate,
      cpuUsage: cpuPercent,
      memoryUsage: memoryUsagePercent,
      diskUsage: diskUsageSnapshot?.percent || 0,
      activeUsers,
      requestsPerMinute: rpm,
      dbConnections: 1,
      maxDbConnections: 100,
      // Detailed sections
      database: {
        status: dbStatus,
        connectionState: mongoose.connection.readyState
      },
      services: [
        { name: 'API Server', status: errorRate < 1 ? 'healthy' : errorRate < 5 ? 'warning' : 'critical', responseTime: avgResponseMs, uptime: uptimePercent },
        { name: 'Database', status: dbStatus === 'connected' ? 'healthy' : 'critical', responseTime: 0, uptime: 100 }
      ],
      metrics: {
        totalUsers: userCount,
        totalGigs: gigCount,
        totalOrders: orderCount,
        activeOrders,
        pendingDisputes,
        pendingWithdrawals,
        systemErrors,
        last24Hours: last24,
        responseStats: {
          last5m: resp5m,
          last1h: resp1h
        }
      },
      timestamp: new Date()
    };

    res.status(200).json(health);
  } catch (err) {
    next(err);
  }
};

// ===========================================
// REPORTS & ANALYTICS
// ===========================================

export const getRevenueReport = async (req, res, next) => {
  try {
    const { period = 'month', startDate, endDate } = req.query;
    
    let matchStage = { paymentStatus: 'paid' };
    
    if (startDate && endDate) {
      matchStage.createdAt = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    } else {
      // Default to last 12 months
      const date = new Date();
      date.setMonth(date.getMonth() - 12);
      matchStage.createdAt = { $gte: date };
    }

    let groupStage;
    if (period === 'day') {
      groupStage = {
        $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' },
            day: { $dayOfMonth: '$createdAt' }
          },
          revenue: { $sum: '$price' },
          orders: { $sum: 1 }
        }
      };
    } else if (period === 'week') {
      groupStage = {
        $group: {
          _id: {
            year: { $year: '$createdAt' },
            week: { $week: '$createdAt' }
          },
          revenue: { $sum: '$price' },
          orders: { $sum: 1 }
        }
      };
    } else {
      groupStage = {
        $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' }
          },
          revenue: { $sum: '$price' },
          orders: { $sum: 1 }
        }
      };
    }

    const revenueData = await Order.aggregate([
      { $match: matchStage },
      groupStage,
      { $sort: { '_id.year': 1, '_id.month': 1, '_id.week': 1, '_id.day': 1 } }
    ]);

    // Get total revenue
    const totalRevenue = await Order.aggregate([
      { $match: matchStage },
      { $group: { _id: null, total: { $sum: '$price' }, orders: { $sum: 1 } } }
    ]);

    res.status(200).json({
      revenueData,
      summary: {
        totalRevenue: totalRevenue[0]?.total || 0,
        totalOrders: totalRevenue[0]?.orders || 0,
        period,
        dateRange: { startDate, endDate }
      }
    });
  } catch (err) {
    next(err);
  }
};

export const getUsersReport = async (req, res, next) => {
  try {
    const [
      userGrowth,
      roleDistribution,
      verificationStats,
      topSellers,
      topBuyers
    ] = await Promise.all([
      // User growth over time
      User.aggregate([
        //  { $match: { isAdmin: false } },
        {
          $group: {
            _id: {
              year: { $year: '$createdAt' },
              month: { $month: '$createdAt' }
            },
            newUsers: { $sum: 1 }
          }
        },
        { $sort: { '_id.year': 1, '_id.month': 1 } }
      ]),
      
      // Role distribution
      User.aggregate([
        // { $match: { isAdmin: false } },
        {
          $group: {
            _id: '$isSeller',
            count: { $sum: 1 }
          }
        }
      ]),
      
      // Verification statistics
      User.aggregate([
        // { $match: { isAdmin: false } },
        {
          $group: {
            _id: '$verificationLevel',
            count: { $sum: 1 }
          }
        }
      ]),
      
      // Top sellers by earnings
      Order.aggregate([
        { $match: { status: 'completed' } },
        {
          $group: {
            _id: '$sellerId',
            totalEarnings: { $sum: '$price' },
            totalOrders: { $sum: 1 }
          }
        },
        { $sort: { totalEarnings: -1 } },
        { $limit: 10 },
        {
          $lookup: {
            from: 'users',
            localField: '_id',
            foreignField: '_id',
            as: 'seller'
          }
        },
        { $unwind: '$seller' }
      ]),
      
      // Top buyers by spending
      Order.aggregate([
        { $match: { status: 'completed' } },
        {
          $group: {
            _id: '$buyerId',
            totalSpent: { $sum: '$price' },
            totalOrders: { $sum: 1 }
          }
        },
        { $sort: { totalSpent: -1 } },
        { $limit: 10 },
        {
          $lookup: {
            from: 'users',
            localField: '_id',
            foreignField: '_id',
            as: 'buyer'
          }
        },
        { $unwind: '$buyer' }
      ])
    ]);

    res.status(200).json({
      userGrowth,
      roleDistribution,
      verificationStats,
      topSellers,
      topBuyers
    });
  } catch (err) {
    next(err);
  }
};

// ===========================================
// FRAUD & SECURITY
// ===========================================

export const getFraudReport = async (req, res, next) => {
  try {
    const [
      flaggedUsers,
      suspiciousOrders,
      fraudStats,
      riskDistribution
    ] = await Promise.all([
      // Users with fraud flags
      User.find({ 
        fraudFlags: { $gt: 0 },
        // isAdmin: false 
      }).select('username email fraudFlags trustScore riskScore flagHistory').limit(50),
      
      // Suspicious orders
      Order.find({
        $or: [
          { disputeStatus: { $ne: 'none' } },
          { requiresApproval: true }
        ]
      }).populate('buyerId', 'username email')
        .populate('sellerId', 'username email')
        .limit(50),
      
      // Fraud statistics
      User.aggregate([
        // { $match: { isAdmin: false } },
        {
          $group: {
            _id: null,
            totalUsers: { $sum: 1 },
            flaggedUsers: { $sum: { $cond: [{ $gt: ['$fraudFlags', 0] }, 1, 0] } },
            suspendedUsers: { $sum: { $cond: ['$isBlacklisted', 1, 0] } },
            averageTrustScore: { $avg: '$trustScore' },
            averageRiskScore: { $avg: '$riskScore' }
          }
        }
      ]),
      
      // Risk score distribution
      User.aggregate([
        // { $match: { isAdmin: false } },
        {
          $bucket: {
            groupBy: '$riskScore',
            boundaries: [0, 20, 40, 60, 80, 100],
            default: 100,
            output: {
              count: { $sum: 1 }
            }
          }
        }
      ])
    ]);

    res.status(200).json({
      flaggedUsers,
      suspiciousOrders,
      statistics: fraudStats[0] || {},
      riskDistribution
    });
  } catch (err) {
    next(err);
  }
};

// ===========================================
// EXTENDED GIG MANAGEMENT
// ===========================================

export const getGigStatistics = async (req, res, next) => {
  try {
    const [
      totalGigs,
      activeGigs,
      pendingGigs,
      suspendedGigs,
      featuredGigs,
      categoryStats,
      averagePrice,
      totalSales,
      topGigs
    ] = await Promise.all([
      Gig.countDocuments(),
      Gig.countDocuments({ status: 'active' }),
      Gig.countDocuments({ status: 'pending' }),
      Gig.countDocuments({ status: 'suspended' }),
      Gig.countDocuments({ featured: true }),
      
      // Category statistics
      Gig.aggregate([
        {
          $group: {
            _id: '$cat',
            count: { $sum: 1 },
            avgPrice: { $avg: '$price' },
            totalSales: { $sum: '$sales' }
          }
        },
        { $sort: { count: -1 } }
      ]),
      
      // Average price
      Gig.aggregate([
        { $group: { _id: null, avgPrice: { $avg: '$price' } } }
      ]),
      
      // Total sales
      Gig.aggregate([
        { $group: { _id: null, totalSales: { $sum: '$sales' } } }
      ]),
      
      // Top performing gigs
      Gig.find()
        .sort({ sales: -1, totalStars: -1 })
        .populate('userId', 'username firstname lastname')
        .limit(10)
    ]);

    res.status(200).json({
      overview: {
        totalGigs,
        activeGigs,
        pendingGigs,
        suspendedGigs,
        featuredGigs,
        averagePrice: averagePrice[0]?.avgPrice || 0,
        totalSales: totalSales[0]?.totalSales || 0
      },
      categoryStats,
      topGigs
    });
  } catch (err) {
    next(err);
  }
};

export const approveGig = async (req, res, next) => {
  try {
    const { gigId } = req.params;
    const { reason } = req.body;
    
    // Validate MongoDB ObjectId
    if (!gigId.match(/^[0-9a-fA-F]{24}$/)) {
      return next(createError(400, "Invalid gig ID format"));
    }
    
    const gig = await Gig.findById(gigId);
    if (!gig) return next(createError(404, "Gig not found"));
    
    // Check if gig is already approved
    if (gig.status === 'active') {
      return next(createError(400, "Gig is already approved"));
    }

    // Enforce maximum of 5 active gigs per seller
    const activeGigCount = await Gig.countDocuments({ userId: gig.userId, status: 'active' });
    if (activeGigCount >= 5) {
      return next(createError(400, "This seller already has 5 active gigs. Please pause an existing active gig before approving another."));
    }

    const updatedGig = await Gig.findByIdAndUpdate(
      gigId,
      { 
        $set: { 
          status: 'active',
          approvedBy: req.userId,
          approvedAt: new Date(),
          adminNotes: reason
        }
      },
      { new: true }
    ).populate('userId', 'username firstname lastname');

    await logAdminAction(
      req.userId,
      req.adminUser.username,
      'gig_approved',
      'gig',
      gigId,
      { targetName: gig.title, reason },
      { status: gig.status },
      { status: 'active' },
      req
    );

    res.status(200).json({
      message: "Gig approved successfully",
      gig: updatedGig
    });
  } catch (err) {
    next(err);
  }
};

export const rejectGig = async (req, res, next) => {
  try {
    const { gigId } = req.params;
    const { reason } = req.body;
    
    const gig = await Gig.findById(gigId);
    if (!gig) return next(createError(404, "Gig not found"));

    const updatedGig = await Gig.findByIdAndUpdate(
      gigId,
      { 
        $set: { 
          status: 'rejected',
          rejectedBy: req.userId,
          rejectedAt: new Date(),
          adminNotes: reason
        }
      },
      { new: true }
    ).populate('userId', 'username firstname lastname');

    await logAdminAction(
      req.userId,
      req.adminUser.username,
      'gig_rejected',
      'gig',
      gigId,
      { targetName: gig.title, reason, severity: 'medium' },
      { status: gig.status },
      { status: 'rejected' },
      req
    );

    res.status(200).json({
      message: "Gig rejected successfully",
      gig: updatedGig
    });
  } catch (err) {
    next(err);
  }
};

export const suspendGig = async (req, res, next) => {
  try {
    const { gigId } = req.params;
    const { reason } = req.body;
    
    const gig = await Gig.findById(gigId);
    if (!gig) return next(createError(404, "Gig not found"));

    const updatedGig = await Gig.findByIdAndUpdate(
      gigId,
      { 
        $set: { 
          status: 'suspended',
          suspendedBy: req.userId,
          suspendedAt: new Date(),
          adminNotes: reason
        }
      },
      { new: true }
    ).populate('userId', 'username firstname lastname');

    await logAdminAction(
      req.userId,
      req.adminUser.username,
      'gig_updated',
      'gig',
      gigId,
      { targetName: gig.title, reason, operation: 'suspend', severity: 'high' },
      { status: gig.status },
      { status: 'suspended' },
      req
    );

    res.status(200).json({
      message: "Gig suspended successfully",
      gig: updatedGig
    });
  } catch (err) {
    next(err);
  }
};

export const restoreGig = async (req, res, next) => {
  try {
    const { gigId } = req.params;
    const { reason } = req.body;
    
    const gig = await Gig.findById(gigId);
    if (!gig) return next(createError(404, "Gig not found"));

    // Enforce maximum of 5 active gigs per seller
    const activeGigCount = await Gig.countDocuments({ userId: gig.userId, status: 'active' });
    if (activeGigCount >= 5) {
      return next(createError(400, "This seller already has 5 active gigs. Please pause an existing active gig before restoring another to active."));
    }

    const updatedGig = await Gig.findByIdAndUpdate(
      gigId,
      { 
        $set: { 
          status: 'active',
          restoredBy: req.userId,
          restoredAt: new Date(),
          adminNotes: reason
        }
      },
      { new: true }
    ).populate('userId', 'username firstname lastname');

    await logAdminAction(
      req.userId,
      req.adminUser.username,
      'gig_updated',
      'gig',
      gigId,
      { targetName: gig.title, reason, operation: 'restore' },
      { status: gig.status },
      { status: 'active' },
      req
    );

    res.status(200).json({
      message: "Gig restored successfully",
      gig: updatedGig
    });
  } catch (err) {
    next(err);
  }
};

export const featureGig = async (req, res, next) => {
  try {
    const { gigId } = req.params;
    const { featured = true, reason } = req.body;
    
    const gig = await Gig.findById(gigId);
    if (!gig) return next(createError(404, "Gig not found"));

    const updatedGig = await Gig.findByIdAndUpdate(
      gigId,
      { 
        $set: { 
          featured,
          featuredBy: featured ? req.userId : null,
          featuredAt: featured ? new Date() : null,
          adminNotes: reason
        }
      },
      { new: true }
    ).populate('userId', 'username firstname lastname');

    await logAdminAction(
      req.userId,
      req.adminUser.username,
      featured ? 'gig_featured' : 'gig_updated',
      'gig',
      gigId,
      { targetName: gig.title, reason, operation: featured ? 'feature' : 'unfeature' },
      { featured: gig.featured },
      { featured },
      req
    );

    res.status(200).json({
      message: `Gig ${featured ? 'featured' : 'unfeatured'} successfully`,
      gig: updatedGig
    });
  } catch (err) {
    next(err);
  }
};

export const bulkGigAction = async (req, res, next) => {
  try {
    const { gigIds, action, reason } = req.body;
    
    // Input validation
    if (!Array.isArray(gigIds) || gigIds.length === 0) {
      return res.status(400).json({ message: 'Gig IDs array is required' });
    }
    
    if (gigIds.length > 100) {
      return res.status(400).json({ message: 'Cannot process more than 100 gigs at once' });
    }
    
    if (!action || !['approve', 'reject', 'suspend', 'feature', 'delete'].includes(action)) {
      return res.status(400).json({ message: 'Invalid action specified' });
    }
    
    if (!reason || reason.trim().length < 5) {
      return res.status(400).json({ message: 'Reason must be at least 5 characters long' });
    }
    
    // Validate all gig IDs
    const invalidIds = gigIds.filter(id => !id.match(/^[0-9a-fA-F]{24}$/));
    if (invalidIds.length > 0) {
      return res.status(400).json({ message: `Invalid gig IDs: ${invalidIds.join(', ')}` });
    }

    let updateData = {};
    let actionName = '';
    let targetIds = gigIds;
    let skippedGigIds = [];
    
    switch (action) {
      case 'approve':
        updateData = { 
          status: 'active',
          approvedBy: req.userId,
          approvedAt: new Date(),
          adminNotes: reason
        };
        actionName = 'approved';

        // Enforce 5 active gigs cap per seller when bulk-approving
        {
          // Fetch the gigs and group by seller
          const gigs = await Gig.find({ _id: { $in: gigIds } }).select('_id userId status');
          const gigsByUser = gigs.reduce((acc, g) => {
            acc[g.userId] = acc[g.userId] || [];
            acc[g.userId].push(g._id.toString());
            return acc;
          }, {});

          const allowedIds = [];
          const skipped = [];

          // For each seller, compute available slots and allow only up to the cap
          for (const [userId, ids] of Object.entries(gigsByUser)) {
            const activeCount = await Gig.countDocuments({ userId, status: 'active' });
            const available = Math.max(0, 5 - activeCount);
            if (available <= 0) {
              skipped.push(...ids);
              continue;
            }
            // Approve up to 'available' gigs for this seller
            allowedIds.push(...ids.slice(0, available));
            skipped.push(...ids.slice(available));
          }

          targetIds = allowedIds;
          skippedGigIds = skipped;

          if (targetIds.length === 0) {
            return res.status(400).json({
              message: 'No gigs approved. All targeted sellers already have 5 active gigs.',
              skippedGigIds
            });
          }
        }
        break;
      case 'reject':
        updateData = { 
          status: 'rejected',
          rejectedBy: req.userId,
          rejectedAt: new Date(),
          adminNotes: reason
        };
        actionName = 'rejected';
        break;
      case 'suspend':
        updateData = { 
          status: 'suspended',
          suspendedBy: req.userId,
          suspendedAt: new Date(),
          adminNotes: reason
        };
        actionName = 'suspended';
        break;
      case 'feature':
        updateData = { 
          featured: true,
          featuredBy: req.userId,
          featuredAt: new Date(),
          adminNotes: reason
        };
        actionName = 'featured';
        break;
      case 'delete':
        const result = await Gig.deleteMany({ _id: { $in: gigIds } });
        
        await logAdminAction(
          req.userId,
          req.adminUser.username,
          'bulk_action_performed',
          'gig',
          null,
          { 
            targetName: 'Bulk Gig Deletion',
            gigCount: gigIds.length,
            deletedCount: result.deletedCount,
            operation: 'delete',
            reason,
            severity: 'critical'
          },
          null,
          null,
          req
        );

        return res.status(200).json({
          message: `${result.deletedCount} gigs deleted successfully`,
          deletedCount: result.deletedCount,
          requestedCount: gigIds.length
        });
      default:
        return res.status(400).json({ message: 'Invalid action' });
    }

    const result = await Gig.updateMany(
      { _id: { $in: targetIds } },
      { $set: updateData }
    );

    await logAdminAction(
      req.userId,
      req.adminUser.username,
      'bulk_action_performed',
      'gig',
      null,
      { 
        targetName: `Bulk Gig ${actionName}`,
        gigCount: gigIds.length,
        updatedCount: result.modifiedCount,
        operation: `bulk_${action}`,
        reason,
        severity: action === 'suspend' ? 'high' : 'medium',
        skippedGigIds
      },
      null,
      null,
      req
    );

    res.status(200).json({
      message: `${result.modifiedCount} gigs ${actionName} successfully` + (skippedGigIds.length ? `, ${skippedGigIds.length} skipped due to active cap` : ''),
      updatedCount: result.modifiedCount,
      requestedCount: gigIds.length,
      skippedGigIds
    });
  } catch (err) {
    next(err);
  }
};

// ===========================================
// ANALYTICS ENDPOINTS
// ===========================================

export const getAnalyticsOverview = async (req, res, next) => {
  try {
    const { timeframe = '30days' } = req.query;
    
    let dateFilter = {};
    const now = new Date();
    
    switch (timeframe) {
      case '7days':
        dateFilter.createdAt = { $gte: new Date(now.setDate(now.getDate() - 7)) };
        break;
      case '30days':
        dateFilter.createdAt = { $gte: new Date(now.setDate(now.getDate() - 30)) };
        break;
      case '90days':
        dateFilter.createdAt = { $gte: new Date(now.setDate(now.getDate() - 90)) };
        break;
      case '1year':
        dateFilter.createdAt = { $gte: new Date(now.setFullYear(now.getFullYear() - 1)) };
        break;
    }

    const [userStats, gigStats, orderStats, revenueStats] = await Promise.all([
      User.aggregate([
        // { $match: { isAdmin: false, ...dateFilter } },
        {
          $group: {
            _id: null,
            totalUsers: { $sum: 1 },
            sellers: { $sum: { $cond: ['$isSeller', 1, 0] } },
            buyers: { $sum: { $cond: [{ $not: '$isSeller' }, 1, 0] } },
            verifiedUsers: { $sum: { $cond: ['$emailVerified', 1, 0] } }
          }
        }
      ]),
      
      Gig.aggregate([
        { $match: dateFilter },
        {
          $group: {
            _id: null,
            totalGigs: { $sum: 1 },
            totalSales: { $sum: '$sales' },
            avgPrice: { $avg: '$price' }
          }
        }
      ]),
      
      Order.aggregate([
        { $match: dateFilter },
        {
          $group: {
            _id: null,
            totalOrders: { $sum: 1 },
            completedOrders: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } },
            activeOrders: { $sum: { $cond: [{ $in: ['$status', ['pending', 'in progress']] }, 1, 0] } },
            disputedOrders: { $sum: { $cond: [{ $ne: ['$disputeStatus', 'none'] }, 1, 0] } }
          }
        }
      ]),
      
      Order.aggregate([
        { $match: { paymentStatus: 'paid', ...dateFilter } },
        {
          $group: {
            _id: null,
            totalRevenue: { $sum: '$price' },
            avgOrderValue: { $avg: '$price' }
          }
        }
      ])
    ]);

    res.status(200).json({
      users: userStats[0] || { totalUsers: 0, sellers: 0, buyers: 0, verifiedUsers: 0 },
      gigs: gigStats[0] || { totalGigs: 0, totalSales: 0, avgPrice: 0 },
      orders: orderStats[0] || { totalOrders: 0, completedOrders: 0, activeOrders: 0, disputedOrders: 0 },
      revenue: revenueStats[0] || { totalRevenue: 0, avgOrderValue: 0 },
      timeframe
    });
  } catch (err) {
    next(err);
  }
};

export const getAnalyticsUsers = async (req, res, next) => {
  try {
    const { timeframe = '30days' } = req.query;
    
    let dateFilter = {};
    const now = new Date();
    
    switch (timeframe) {
      case '7days':
        dateFilter.createdAt = { $gte: new Date(now.setDate(now.getDate() - 7)) };
        break;
      case '30days':
        dateFilter.createdAt = { $gte: new Date(now.setDate(now.getDate() - 30)) };
        break;
      case '90days':
        dateFilter.createdAt = { $gte: new Date(now.setDate(now.getDate() - 90)) };
        break;
      case '1year':
        dateFilter.createdAt = { $gte: new Date(now.setFullYear(now.getFullYear() - 1)) };
        break;
    }

    const [userGrowth, roleDistribution, verificationStats, stateDistribution] = await Promise.all([
      // User growth over time
      User.aggregate([
        { $match: { isAdmin: false, ...dateFilter } },
        {
          $group: {
            _id: {
              year: { $year: '$createdAt' },
              month: { $month: '$createdAt' },
              day: { $dayOfMonth: '$createdAt' }
            },
            newUsers: { $sum: 1 }
          }
        },
        { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 } }
      ]),
      
      // Role distribution
      User.aggregate([
        { $match: { isAdmin: false } },
        {
          $group: {
            _id: '$isSeller',
            count: { $sum: 1 }
          }
        }
      ]),
      
      // Verification stats
      User.aggregate([
        { $match: { isAdmin: false } },
        {
          $group: {
            _id: '$verificationLevel',
            count: { $sum: 1 }
          }
        }
      ]),
      
      // Geographic distribution
      User.aggregate([
        { $match: { isAdmin: false, state: { $exists: true, $ne: '' } } },
        { $group: { _id: '$state', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 }
      ])
    ]);

    res.status(200).json({
      userGrowth,
      roleDistribution,
      verificationStats,
      stateDistribution,
      timeframe
    });
  } catch (err) {
    next(err);
  }
};

export const getAnalyticsRevenue = async (req, res, next) => {
  try {
    const { timeframe = '30days' } = req.query;
    
    let dateFilter = {};
    const now = new Date();
    
    switch (timeframe) {
      case '7days':
        dateFilter.createdAt = { $gte: new Date(now.setDate(now.getDate() - 7)) };
        break;
      case '30days':
        dateFilter.createdAt = { $gte: new Date(now.setDate(now.getDate() - 30)) };
        break;
      case '90days':
        dateFilter.createdAt = { $gte: new Date(now.setDate(now.getDate() - 90)) };
        break;
      case '1year':
        dateFilter.createdAt = { $gte: new Date(now.setFullYear(now.getFullYear() - 1)) };
        break;
    }

    const [revenueOverTime, categoryRevenue, topEarners, revenueMetrics] = await Promise.all([
      // Revenue over time
      Order.aggregate([
        { $match: { paymentStatus: 'paid', ...dateFilter } },
        {
          $group: {
            _id: {
              year: { $year: '$createdAt' },
              month: { $month: '$createdAt' },
              day: { $dayOfMonth: '$createdAt' }
            },
            revenue: { $sum: '$price' },
            orders: { $sum: 1 }
          }
        },
        { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 } }
      ]),
      
      // Revenue by category
      Order.aggregate([
        { $match: { paymentStatus: 'paid', ...dateFilter } },
        {
          $lookup: {
            from: 'gigs',
            localField: 'gigId',
            foreignField: '_id',
            as: 'gig'
          }
        },
        { $unwind: '$gig' },
        {
          $group: {
            _id: '$gig.cat',
            revenue: { $sum: '$price' },
            orders: { $sum: 1 }
          }
        },
        { $sort: { revenue: -1 } }
      ]),
      
      // Top earning sellers
      Order.aggregate([
        { $match: { paymentStatus: 'paid', status: 'completed', ...dateFilter } },
        {
          $group: {
            _id: '$sellerId',
            earnings: { $sum: '$price' },
            orders: { $sum: 1 }
          }
        },
        { $sort: { earnings: -1 } },
        { $limit: 10 },
        {
          $lookup: {
            from: 'users',
            localField: '_id',
            foreignField: '_id',
            as: 'seller'
          }
        },
        { $unwind: '$seller' }
      ]),
      
      // Revenue metrics
      Order.aggregate([
        { $match: { paymentStatus: 'paid', ...dateFilter } },
        {
          $group: {
            _id: null,
            totalRevenue: { $sum: '$price' },
            avgOrderValue: { $avg: '$price' },
            totalOrders: { $sum: 1 },
            platformFees: { $sum: { $multiply: ['$price', 0.05] } } // Assuming 5% platform fee
          }
        }
      ])
    ]);

    res.status(200).json({
      revenueOverTime,
      categoryRevenue,
      topEarners,
      metrics: revenueMetrics[0] || { totalRevenue: 0, avgOrderValue: 0, totalOrders: 0, platformFees: 0 },
      timeframe
    });
  } catch (err) {
    next(err);
  }
};

export const getAnalyticsOrders = async (req, res, next) => {
  try {
    const { timeframe = '30days' } = req.query;
    
    let dateFilter = {};
    const now = new Date();
    
    switch (timeframe) {
      case '7days':
        dateFilter.createdAt = { $gte: new Date(now.setDate(now.getDate() - 7)) };
        break;
      case '30days':
        dateFilter.createdAt = { $gte: new Date(now.setDate(now.getDate() - 30)) };
        break;
      case '90days':
        dateFilter.createdAt = { $gte: new Date(now.setDate(now.getDate() - 90)) };
        break;
      case '1year':
        dateFilter.createdAt = { $gte: new Date(now.setFullYear(now.getFullYear() - 1)) };
        break;
    }

    const [orderTrends, statusDistribution, completionRates, averageValues] = await Promise.all([
      // Order trends over time
      Order.aggregate([
        { $match: dateFilter },
        {
          $group: {
            _id: {
              year: { $year: '$createdAt' },
              month: { $month: '$createdAt' },
              day: { $dayOfMonth: '$createdAt' }
            },
            orders: { $sum: 1 },
            revenue: { $sum: '$price' },
            completed: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } },
            disputed: { $sum: { $cond: [{ $ne: ['$disputeStatus', 'none'] }, 1, 0] } }
          }
        },
        { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 } }
      ]),
      
      // Order status distribution
      Order.aggregate([
        { $match: dateFilter },
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 }
          }
        }
      ]),
      
      // Completion rates by category
      Order.aggregate([
        { $match: dateFilter },
        {
          $lookup: {
            from: 'gigs',
            localField: 'gigId',
            foreignField: '_id',
            as: 'gig'
          }
        },
        { $unwind: '$gig' },
        {
          $group: {
            _id: '$gig.cat',
            totalOrders: { $sum: 1 },
            completedOrders: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } }
          }
        },
        {
          $project: {
            category: '$_id',
            totalOrders: 1,
            completedOrders: 1,
            completionRate: { $multiply: [{ $divide: ['$completedOrders', '$totalOrders'] }, 100] }
          }
        },
        { $sort: { completionRate: -1 } }
      ]),
      
      // Average order values
      Order.aggregate([
        { $match: dateFilter },
        {
          $group: {
            _id: null,
            avgOrderValue: { $avg: '$price' },
            medianOrderValue: { $median: { input: '$price', method: 'approximate' } },
            totalOrders: { $sum: 1 }
          }
        }
      ])
    ]);

    res.status(200).json({
      orderTrends,
      statusDistribution,
      completionRates,
      metrics: averageValues[0] || { avgOrderValue: 0, medianOrderValue: 0, totalOrders: 0 },
      timeframe
    });
  } catch (err) {
    next(err);
  }
};

export const getAnalyticsPerformance = async (req, res, next) => {
  try {
    const { timeframe = '30days' } = req.query;
    
    let dateFilter = {};
    const now = new Date();
    
    switch (timeframe) {
      case '7days':
        dateFilter.createdAt = { $gte: new Date(now.setDate(now.getDate() - 7)) };
        break;
      case '30days':
        dateFilter.createdAt = { $gte: new Date(now.setDate(now.getDate() - 30)) };
        break;
      case '90days':
        dateFilter.createdAt = { $gte: new Date(now.setDate(now.getDate() - 90)) };
        break;
      case '1year':
        dateFilter.createdAt = { $gte: new Date(now.setFullYear(now.getFullYear() - 1)) };
        break;
    }

    const [platformMetrics, qualityMetrics, engagementMetrics] = await Promise.all([
      // Platform performance metrics
      Promise.all([
        User.countDocuments({ isAdmin: false, ...dateFilter }),
        Gig.countDocuments(dateFilter),
        Order.countDocuments(dateFilter),
        Order.countDocuments({ status: 'completed', ...dateFilter }),
        Order.countDocuments({ disputeStatus: { $ne: 'none' }, ...dateFilter }),
        Withdrawal.countDocuments(dateFilter)
      ]),
      
      // Quality metrics
      Promise.all([
        Review.aggregate([
          { $match: dateFilter },
          { $group: { _id: null, avgRating: { $avg: '$star' }, totalReviews: { $sum: 1 } } }
        ]),
        Order.aggregate([
          { $match: dateFilter },
          {
            $group: {
              _id: null,
              avgCompletionTime: { $avg: { $subtract: ['$completedAt', '$createdAt'] } },
              onTimeDeliveries: {
                $sum: {
                  $cond: [
                    { $lte: ['$completedAt', '$autoReleaseDate'] },
                    1, 0
                  ]
                }
              }
            }
          }
        ])
      ]),
      
      // User engagement metrics
      Promise.all([
        User.aggregate([
          { $match: { isAdmin: false } },
          {
            $group: {
              _id: null,
              avgProfileViews: { $avg: '$profileViews' },
              totalActiveUsers: { $sum: { $cond: [{ $eq: ['$status', 'online'] }, 1, 0] } }
            }
          }
        ]),
        Conversation.countDocuments(dateFilter),
        Message.countDocuments(dateFilter)
      ])
    ]);

    const [
      totalUsers, totalGigs, totalOrders, completedOrders, disputedOrders, totalWithdrawals
    ] = platformMetrics;

    const completionRate = totalOrders > 0 ? (completedOrders / totalOrders) * 100 : 0;
    const disputeRate = totalOrders > 0 ? (disputedOrders / totalOrders) * 100 : 0;

    res.status(200).json({
      platform: {
        totalUsers,
        totalGigs,
        totalOrders,
        completedOrders,
        disputedOrders,
        totalWithdrawals,
        completionRate,
        disputeRate
      },
      quality: {
        averageRating: qualityMetrics[0][0]?.avgRating || 0,
        totalReviews: qualityMetrics[0][0]?.totalReviews || 0,
        avgCompletionTime: qualityMetrics[1][0]?.avgCompletionTime || 0,
        onTimeDeliveries: qualityMetrics[1][0]?.onTimeDeliveries || 0
      },
      engagement: {
        avgProfileViews: engagementMetrics[0][0]?.avgProfileViews || 0,
        totalActiveUsers: engagementMetrics[0][0]?.totalActiveUsers || 0,
        totalConversations: engagementMetrics[1],
        totalMessages: engagementMetrics[2]
      },
      timeframe
    });
  } catch (err) {
    next(err);
  }
};
