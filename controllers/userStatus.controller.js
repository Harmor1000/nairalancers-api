import User from "../models/user.model.js";
import createError from "../utils/createError.js";
import notificationService from "../services/notificationService.js";
import socketService from "../services/socketService.js";

// Update user status (online, away, busy, offline)
export const updateUserStatus = async (req, res, next) => {
  try {
    const { status } = req.body;
    const userId = req.userId;

    if (!['online', 'away', 'busy', 'offline'].includes(status)) {
      return next(createError(400, "Invalid status"));
    }

    const user = await User.findByIdAndUpdate(
      userId,
      {
        status: status,
        isOnline: status === 'online',
        lastSeen: status === 'offline' ? new Date() : undefined
      },
      { new: true }
    );

    if (!user) {
      return next(createError(404, "User not found"));
    }

    // Broadcast status update
    try {
      socketService.broadcastUserStatus(userId, status === 'online');
    } catch (error) {
      console.log('Status broadcast failed:', error.message);
    }

    res.status(200).json({
      success: true,
      status: user.status,
      isOnline: user.isOnline,
      lastSeen: user.lastSeen
    });
  } catch (err) {
    next(err);
  }
};

// Get user status
export const getUserStatus = async (req, res, next) => {
  try {
    const { userId } = req.params;

    const user = await User.findById(userId, 'status isOnline lastSeen username img');
    if (!user) {
      return next(createError(404, "User not found"));
    }

    res.status(200).json({
      userId: user._id,
      username: user.username,
      img: user.img,
      status: user.status,
      isOnline: user.isOnline,
      lastSeen: user.lastSeen
    });
  } catch (err) {
    next(err);
  }
};

// Get multiple users status
export const getMultipleUsersStatus = async (req, res, next) => {
  try {
    const { userIds } = req.body;

    if (!Array.isArray(userIds) || userIds.length === 0) {
      return next(createError(400, "Valid user IDs array required"));
    }

    const users = await User.find(
      { _id: { $in: userIds } },
      'status isOnline lastSeen username img'
    );

    const userStatuses = users.map(user => ({
      userId: user._id,
      username: user.username,
      img: user.img,
      status: user.status,
      isOnline: user.isOnline,
      lastSeen: user.lastSeen
    }));

    res.status(200).json(userStatuses);
  } catch (err) {
    next(err);
  }
};

// Update notification settings
export const updateNotificationSettings = async (req, res, next) => {
  try {
    const userId = req.userId;
    const { notificationSettings } = req.body;

    if (!notificationSettings || typeof notificationSettings !== 'object') {
      return next(createError(400, "Valid notification settings required"));
    }

    const user = await User.findByIdAndUpdate(
      userId,
      { notificationSettings },
      { new: true, runValidators: true }
    );

    if (!user) {
      return next(createError(404, "User not found"));
    }

    res.status(200).json({
      success: true,
      notificationSettings: user.notificationSettings
    });
  } catch (err) {
    next(err);
  }
};

// Get notification settings
export const getNotificationSettings = async (req, res, next) => {
  try {
    const userId = req.userId;

    const user = await User.findById(userId, 'notificationSettings');
    if (!user) {
      return next(createError(404, "User not found"));
    }

    res.status(200).json(user.notificationSettings || {
      email: true,
      push: true,
      newMessages: true,
      messageReactions: true,
      typing: false,
      userStatus: false
    });
  } catch (err) {
    next(err);
  }
};

// Get online users (for contacts/friends)
export const getOnlineUsers = async (req, res, next) => {
  try {
    const onlineUsers = await User.find(
      { isOnline: true },
      'username img status lastSeen'
    ).limit(100); // Limit for performance

    res.status(200).json(onlineUsers);
  } catch (err) {
    next(err);
  }
};

// Mark user as seen (heartbeat endpoint)
export const heartbeat = async (req, res, next) => {
  try {
    const userId = req.userId;

    await User.findByIdAndUpdate(userId, {
      lastSeen: new Date(),
      isOnline: true
    });

    res.status(200).json({ success: true });
  } catch (err) {
    next(err);
  }
};

// Get queued notifications for user
export const getQueuedNotifications = async (req, res, next) => {
  try {
    const userId = req.userId;
    
    const notifications = notificationService.getQueuedNotifications(userId);
    
    res.status(200).json({
      notifications,
      count: notifications.length
    });
  } catch (err) {
    next(err);
  }
};
