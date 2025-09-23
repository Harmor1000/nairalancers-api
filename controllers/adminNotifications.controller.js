import createError from "../utils/createError.js";
import User from "../models/user.model.js";
import { Notification, UserNotification } from "../models/notification.model.js";
import AdminLog from "../models/adminLog.model.js";

// Helper function to determine target users based on criteria
const getTargetUsers = async (targetType, targetUsers, targetCriteria) => {
  let users = [];

  switch (targetType) {
    case 'all':
      users = await User.find({ isAdmin: false }).select('_id');
      break;
    
    case 'sellers':
      users = await User.find({ isAdmin: false, isSeller: true }).select('_id');
      break;
    
    case 'buyers':
      users = await User.find({ isAdmin: false, isSeller: false }).select('_id');
      break;
    
    case 'admins':
      users = await User.find({ isAdmin: true }).select('_id');
      break;
    
    case 'specific_users':
      users = targetUsers.map(id => ({ _id: id }));
      break;
    
    case 'user_segment':
      const query = { isAdmin: false };
      
      if (targetCriteria.verificationLevel) {
        query.verificationLevel = targetCriteria.verificationLevel;
      }
      
      if (targetCriteria.country) {
        query.country = targetCriteria.country;
      }
      
      if (targetCriteria.registrationDateRange) {
        query.createdAt = {};
        if (targetCriteria.registrationDateRange.start) {
          query.createdAt.$gte = new Date(targetCriteria.registrationDateRange.start);
        }
        if (targetCriteria.registrationDateRange.end) {
          query.createdAt.$lte = new Date(targetCriteria.registrationDateRange.end);
        }
      }
      
      if (targetCriteria.orderCount) {
        if (targetCriteria.orderCount.min !== undefined) {
          query.totalOrders = { ...query.totalOrders, $gte: targetCriteria.orderCount.min };
        }
        if (targetCriteria.orderCount.max !== undefined) {
          query.totalOrders = { ...query.totalOrders, $lte: targetCriteria.orderCount.max };
        }
      }
      
      if (targetCriteria.trustScore) {
        if (targetCriteria.trustScore.min !== undefined) {
          query.trustScore = { ...query.trustScore, $gte: targetCriteria.trustScore.min };
        }
        if (targetCriteria.trustScore.max !== undefined) {
          query.trustScore = { ...query.trustScore, $lte: targetCriteria.trustScore.max };
        }
      }
      
      users = await User.find(query).select('_id');
      break;
    
    default:
      throw new Error('Invalid target type');
  }

  return users.map(u => u._id);
};

// Create and send notification
export const createNotification = async (req, res, next) => {
  try {
    const {
      title,
      message,
      type,
      priority,
      targetType,
      targetUsers,
      targetCriteria,
      deliveryMethods,
      scheduledFor,
      expiresAt,
      actionButton,
      imageUrl,
      category,
      tags
    } = req.body;

    const admin = await User.findById(req.userId);

    // Normalize delivery methods from either an object (email/sms/push booleans)
    // or an array of enabled method keys coming from the frontend
    const normalizedDelivery = Array.isArray(deliveryMethods)
      ? {
          inApp: true,
          email: deliveryMethods.includes('email'),
          sms: deliveryMethods.includes('sms'),
          push: deliveryMethods.includes('push')
        }
      : {
          inApp: true,
          email: !!deliveryMethods?.email,
          sms: !!deliveryMethods?.sms,
          push: !!deliveryMethods?.push
        };

    // Create notification document
    const notification = new Notification({
      title,
      message,
      type,
      priority: priority || 'medium',
      targetType,
      targetUsers: targetUsers || [],
      targetCriteria: targetCriteria || {},
      deliveryMethods: normalizedDelivery,
      scheduledFor: scheduledFor ? new Date(scheduledFor) : null,
      expiresAt: expiresAt ? new Date(expiresAt) : null,
      status: scheduledFor ? 'scheduled' : 'sending',
      createdBy: req.userId,
      createdByName: `${admin.firstname} ${admin.lastname}`,
      actionButton,
      imageUrl,
      category,
      tags: tags || []
    });

    // Get target user IDs
    const targetUserIds = await getTargetUsers(targetType, targetUsers, targetCriteria);
    notification.stats.totalTargeted = targetUserIds.length;

    await notification.save();

    // If not scheduled, send immediately
    if (!scheduledFor) {
      await sendNotificationToUsers(notification._id, targetUserIds);
      notification.status = 'sent';
      await notification.save();
    }

    // Log the action
    await AdminLog.create({
      adminId: req.userId,
      adminUsername: admin.username,
      action: 'notification_created',
      targetType: 'notification',
      targetId: notification._id,
      targetName: notification.title,
      details: {
        type: notification.type,
        targetType: notification.targetType,
        targetCount: targetUserIds.length,
        scheduled: !!scheduledFor,
        severity: 'medium'
      },
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    });

    res.status(201).json({
      message: scheduledFor ? 'Notification scheduled successfully' : 'Notification sent successfully',
      notification: {
        id: notification._id,
        title: notification.title,
        status: notification.status,
        targetCount: targetUserIds.length,
        scheduledFor: notification.scheduledFor
      }
    });

  } catch (err) {
    next(err);
  }
};

// Send notification to specific users
const sendNotificationToUsers = async (notificationId, userIds) => {
  const notification = await Notification.findById(notificationId);
  
  // Create UserNotification records for each target user
  const userNotifications = userIds.map(userId => ({
    notificationId,
    userId,
    deliveryStatus: {
      inApp: {
        delivered: true,
        deliveredAt: new Date()
      }
    }
  }));

  try {
    await UserNotification.insertMany(userNotifications, { ordered: false });
    
    // Update delivery stats
    await Notification.findByIdAndUpdate(notificationId, {
      $inc: { 'stats.delivered': userIds.length }
    });

    // TODO: Implement email/SMS/push delivery here
    // This would integrate with your email service, SMS provider, etc.

  } catch (error) {
    console.error('Error delivering notifications:', error);
    
    // Update failed delivery stats
    await Notification.findByIdAndUpdate(notificationId, {
      $inc: { 'stats.failed': userIds.length }
    });
  }
};

// Get all notifications with pagination and filtering
export const getAllNotifications = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const status = req.query.status || 'all';
    const type = req.query.type || 'all';
    const priority = req.query.priority || 'all';
    const sortBy = req.query.sortBy || 'createdAt';
    const sortOrder = req.query.sortOrder || 'desc';

    let filter = {};
    if (status !== 'all') filter.status = status;
    if (type !== 'all') filter.type = type;
    if (priority !== 'all') filter.priority = priority;

    const skip = (page - 1) * limit;
    const sort = { [sortBy]: sortOrder === 'desc' ? -1 : 1 };

    const [notifications, totalNotifications] = await Promise.all([
      Notification.find(filter)
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .populate('createdBy', 'firstname lastname username'),
      Notification.countDocuments(filter)
    ]);

    const totalPages = Math.ceil(totalNotifications / limit);

    res.status(200).json({
      notifications,
      pagination: {
        currentPage: page,
        totalPages,
        totalNotifications,
        limit,
        hasNext: page < totalPages,
        hasPrev: page > 1
      }
    });

  } catch (err) {
    next(err);
  }
};

// Get notification details and delivery stats
export const getNotificationDetails = async (req, res, next) => {
  try {
    const { notificationId } = req.params;

    const notification = await Notification.findById(notificationId)
      .populate('createdBy', 'firstname lastname username');

    if (!notification) {
      return next(createError(404, "Notification not found"));
    }

    // Get delivery details
    const deliveryDetails = await UserNotification.aggregate([
      { $match: { notificationId: notification._id } },
      {
        $group: {
          _id: null,
          totalDelivered: { $sum: { $cond: ['$deliveryStatus.inApp.delivered', 1, 0] } },
          totalRead: { $sum: { $cond: ['$deliveryStatus.inApp.read', 1, 0] } },
          totalEmailDelivered: { $sum: { $cond: ['$deliveryStatus.email.delivered', 1, 0] } },
          totalEmailOpened: { $sum: { $cond: ['$deliveryStatus.email.opened', 1, 0] } },
          totalEmailClicked: { $sum: { $cond: ['$deliveryStatus.email.clicked', 1, 0] } },
          totalDismissed: { $sum: { $cond: ['$dismissed', 1, 0] } }
        }
      }
    ]);

    const stats = deliveryDetails[0] || {
      totalDelivered: 0,
      totalRead: 0,
      totalEmailDelivered: 0,
      totalEmailOpened: 0,
      totalEmailClicked: 0,
      totalDismissed: 0
    };

    // Get recent delivery status samples
    const sampleDeliveries = await UserNotification.find({ notificationId })
      .populate('userId', 'firstname lastname username email')
      .sort({ createdAt: -1 })
      .limit(10);

    res.status(200).json({
      notification,
      stats,
      sampleDeliveries,
      performance: {
        deliveryRate: notification.stats.totalTargeted > 0 
          ? ((stats.totalDelivered / notification.stats.totalTargeted) * 100).toFixed(2)
          : 0,
        readRate: stats.totalDelivered > 0 
          ? ((stats.totalRead / stats.totalDelivered) * 100).toFixed(2)
          : 0,
        emailOpenRate: stats.totalEmailDelivered > 0 
          ? ((stats.totalEmailOpened / stats.totalEmailDelivered) * 100).toFixed(2)
          : 0,
        clickThroughRate: stats.totalEmailOpened > 0 
          ? ((stats.totalEmailClicked / stats.totalEmailOpened) * 100).toFixed(2)
          : 0
      }
    });

  } catch (err) {
    next(err);
  }
};

// Cancel scheduled notification
export const cancelNotification = async (req, res, next) => {
  try {
    const { notificationId } = req.params;

    const notification = await Notification.findById(notificationId);
    if (!notification) {
      return next(createError(404, "Notification not found"));
    }

    if (notification.status !== 'scheduled') {
      return next(createError(400, "Only scheduled notifications can be cancelled"));
    }

    await Notification.findByIdAndUpdate(notificationId, {
      status: 'cancelled'
    });

    const admin = await User.findById(req.userId);
    await AdminLog.create({
      adminId: req.userId,
      adminUsername: admin.username,
      action: 'notification_cancelled',
      targetType: 'notification',
      targetId: notificationId,
      targetName: notification.title,
      details: { severity: 'medium' },
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    });

    res.status(200).json({
      message: "Notification cancelled successfully"
    });

  } catch (err) {
    next(err);
  }
};

// Get notification templates and suggestions
export const getNotificationTemplates = async (req, res, next) => {
  try {
    const templates = {
      system_announcement: {
        title: "Important System Update",
        message: "We've made important updates to improve your experience on Nairalancers.",
        type: "system_announcement",
        priority: "medium"
      },
      maintenance_notice: {
        title: "Scheduled Maintenance",
        message: "Nairalancers will be undergoing scheduled maintenance on [DATE] from [TIME] to [TIME]. During this time, the platform may be temporarily unavailable.",
        type: "maintenance_notice",
        priority: "high"
      },
      security_alert: {
        title: "Security Notice",
        message: "We've detected unusual activity and have implemented additional security measures to protect your account.",
        type: "security_alert",
        priority: "urgent"
      },
      welcome: {
        title: "Welcome to Nairalancers!",
        message: "Thank you for joining Nigeria's premier freelancing platform. Complete your profile to start connecting with clients and freelancers.",
        type: "welcome",
        priority: "medium"
      },
      policy_update: {
        title: "Terms of Service Update",
        message: "We've updated our Terms of Service and Privacy Policy. Please review the changes that take effect on [DATE].",
        type: "policy_update",
        priority: "medium"
      }
    };

    res.status(200).json({ templates });

  } catch (err) {
    next(err);
  }
};

// Send test notification
export const sendTestNotification = async (req, res, next) => {
  try {
    const { title, message, type } = req.body;

    const admin = await User.findById(req.userId);

    // Create test notification targeting only the admin
    const notification = new Notification({
      title: `[TEST] ${title}`,
      message,
      type: type || 'custom',
      priority: 'low',
      targetType: 'specific_users',
      targetUsers: [req.userId],
      deliveryMethods: { inApp: true, email: false, sms: false, push: false },
      status: 'sending',
      createdBy: req.userId,
      createdByName: `${admin.firstname} ${admin.lastname}`,
      stats: { totalTargeted: 1 }
    });

    await notification.save();
    await sendNotificationToUsers(notification._id, [req.userId]);
    
    notification.status = 'sent';
    await notification.save();

    res.status(200).json({
      message: "Test notification sent successfully",
      notificationId: notification._id
    });

  } catch (err) {
    next(err);
  }
};

// Get notification analytics
export const getNotificationAnalytics = async (req, res, next) => {
  try {
    const { period = 'month' } = req.query;
    
    let dateFilter = {};
    const now = new Date();
    
    switch (period) {
      case 'week':
        dateFilter = { $gte: new Date(now.setDate(now.getDate() - 7)) };
        break;
      case 'month':
        dateFilter = { $gte: new Date(now.setMonth(now.getMonth() - 1)) };
        break;
      case 'quarter':
        dateFilter = { $gte: new Date(now.setMonth(now.getMonth() - 3)) };
        break;
      case 'year':
        dateFilter = { $gte: new Date(now.setFullYear(now.getFullYear() - 1)) };
        break;
    }

    const [notificationStats, typeBreakdown, performanceMetrics] = await Promise.all([
      // Overall notification statistics
      Notification.aggregate([
        { $match: { createdAt: dateFilter } },
        {
          $group: {
            _id: null,
            totalNotifications: { $sum: 1 },
            totalTargeted: { $sum: '$stats.totalTargeted' },
            totalDelivered: { $sum: '$stats.delivered' },
            totalRead: { $sum: '$stats.read' },
            avgTargetedPerNotification: { $avg: '$stats.totalTargeted' }
          }
        }
      ]),

      // Breakdown by notification type
      Notification.aggregate([
        { $match: { createdAt: dateFilter } },
        {
          $group: {
            _id: '$type',
            count: { $sum: 1 },
            totalTargeted: { $sum: '$stats.totalTargeted' },
            totalDelivered: { $sum: '$stats.delivered' }
          }
        },
        { $sort: { count: -1 } }
      ]),

      // Performance metrics over time
      Notification.aggregate([
        { $match: { createdAt: dateFilter } },
        {
          $group: {
            _id: {
              year: { $year: '$createdAt' },
              month: { $month: '$createdAt' },
              day: { $dayOfMonth: '$createdAt' }
            },
            notificationsSent: { $sum: 1 },
            totalTargeted: { $sum: '$stats.totalTargeted' },
            totalDelivered: { $sum: '$stats.delivered' }
          }
        },
        { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 } }
      ])
    ]);

    const analytics = {
      overview: notificationStats[0] || {
        totalNotifications: 0,
        totalTargeted: 0,
        totalDelivered: 0,
        totalRead: 0,
        avgTargetedPerNotification: 0
      },
      typeBreakdown,
      performanceMetrics,
      period
    };

    // Calculate rates
    if (analytics.overview.totalTargeted > 0) {
      analytics.overview.deliveryRate = ((analytics.overview.totalDelivered / analytics.overview.totalTargeted) * 100).toFixed(2);
    }
    if (analytics.overview.totalDelivered > 0) {
      analytics.overview.readRate = ((analytics.overview.totalRead / analytics.overview.totalDelivered) * 100).toFixed(2);
    }

    res.status(200).json(analytics);

  } catch (err) {
    next(err);
  }
};

