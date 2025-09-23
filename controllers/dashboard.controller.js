import User from "../models/user.model.js";
import Order from "../models/order.model.js";
import Gig from "../models/gig.model.js";
import Message from "../models/message.model.js";
import Review from "../models/review.model.js";
import Conversation from "../models/conversation.model.js";
import createError from "../utils/createError.js";
import notificationService from "../services/notificationService.js";

// Get dashboard stats for the current user
export const getDashboardStats = async (req, res, next) => {
  try {
    const userId = req.userId;
    const isSeller = req.isSeller;

    // Base stats object
    let stats = {};

    if (isSeller) {
      // Seller-specific stats
      const [
        activeOrders,
        completedOrders,
        totalEarnings,
        activeGigs,
        unreadMessages,
        profileViews,
        totalReviews,
        averageRating
      ] = await Promise.all([
        // Active orders (orders where user is seller)
        Order.countDocuments({ 
          sellerId: userId, 
          isCompleted: true,
          status: { $in: ['pending', 'in progress'] }
        }),
        // Completed orders
        Order.countDocuments({ 
          sellerId: userId, 
          isCompleted: true,
          status: 'completed'
        }),
        // Total earnings - sum of completed order prices
        Order.aggregate([
          { 
            $match: { 
              sellerId: userId, 
              isCompleted: true, 
              status: 'completed',
              paymentStatus: 'paid'
            } 
          },
          { $group: { _id: null, total: { $sum: "$price" } } }
        ]),
        // Active gigs count (all gigs for now since there's no isActive field)
        Gig.countDocuments({ userId }),
        // Unread messages count
        Message.countDocuments({ 
          userId: { $ne: userId },
          conversationId: { $in: await getConversationIds(userId) },
          isRead: false
        }),
        // Get profile views from user model
        User.findById(userId).select('profileViews'),
        // Total reviews received
        Review.countDocuments({ sellerId: userId }),
        // Average rating
        Review.aggregate([
          { $match: { sellerId: userId } },
          { $group: { _id: null, avgRating: { $avg: "$star" } } }
        ])
      ]);

      stats = {
        activeOrders: activeOrders || 0,
        completedOrders: completedOrders || 0,
        totalEarnings: totalEarnings[0]?.total || 0,
        activeGigs: activeGigs || 0,
        unreadMessages: unreadMessages || 0,
        profileViews: profileViews?.profileViews || 0,
        totalReviews: totalReviews || 0,
        averageRating: averageRating[0]?.avgRating || 0
      };
    } else {
      // Buyer-specific stats
      const [
        activeOrders,
        completedOrders,
        unreadMessages,
        savedServices
      ] = await Promise.all([
        // Active orders (orders where user is buyer)
        Order.countDocuments({ 
          buyerId: userId, 
          isCompleted: true,
          status: { $in: ['pending', 'in progress'] }
        }),
        // Completed orders
        Order.countDocuments({ 
          buyerId: userId, 
          isCompleted: true,
          status: 'completed'
        }),
        // Unread messages count
        Message.countDocuments({ 
          userId: { $ne: userId },
          conversationId: { $in: await getConversationIds(userId) },
          isRead: false
        }),
        // For now, we'll mock saved services since there's no model for it
        Promise.resolve(12)
      ]);

      stats = {
        activeOrders: activeOrders || 0,
        completedOrders: completedOrders || 0,
        unreadMessages: unreadMessages || 0,
        savedServices: savedServices || 0
      };
    }

    res.status(200).json(stats);
  } catch (err) {
    next(err);
  }
};

// Get recent activities for the dashboard
export const getRecentActivities = async (req, res, next) => {
  try {
    const userId = req.userId;
    const isSeller = req.isSeller;
    const limit = parseInt(req.query.limit) || 10;

    let activities = [];

    // Get recent orders
    const recentOrders = await Order.find({
      $or: [
        { buyerId: userId },
        { sellerId: userId }
      ],
      isCompleted: true
    })
    .sort({ createdAt: -1 })
    .limit(limit)
    .populate('buyerId', 'username')
    .populate('sellerId', 'username');

    // Convert orders to activity format
    const orderActivities = recentOrders.map(order => ({
      id: order._id,
      type: 'order',
      title: order.buyerId.toString() === userId ? 'Order placed' : 'New order received',
      description: order.title,
      time: formatTimeAgo(order.createdAt),
      status: order.status,
      amount: order.price,
      createdAt: order.createdAt
    }));

    activities.push(...orderActivities);

    // Get recent messages (only preview, not full content for privacy)
    const conversations = await Conversation.find({
      $or: [{ buyerId: userId }, { sellerId: userId }]
    });

    // Use custom conversation.id string to match Message.conversationId
    const conversationIds = conversations.map(conv => conv.id);
    
    const recentMessages = await Message.find({
      conversationId: { $in: conversationIds },
      userId: { $ne: userId } // Only messages from others
    })
    .sort({ createdAt: -1 })
    .limit(5)
    .populate('userId', 'username');

    // Convert messages to activity format
    const messageActivities = recentMessages.map(message => ({
      id: message._id,
      type: 'message',
      title: 'New message',
      description: `Message from ${message.userId.username}`,
      time: formatTimeAgo(message.createdAt),
      status: message.isRead ? 'read' : 'unread',
      createdAt: message.createdAt
    }));

    activities.push(...messageActivities);

    // Get recent reviews
    const recentReviews = await Review.find({
      sellerId: userId
    })
    .sort({ createdAt: -1 })
    .limit(5)
    .populate('gigId', 'title')
    .populate('userId', 'username'); // userId is the buyer in Review model

    const reviewActivities = recentReviews.map(review => ({
      id: review._id,
      type: 'review',
      title: `New ${review.star}-star review`,
      description: review.desc.substring(0, 100) + '...',
      time: formatTimeAgo(review.createdAt),
      status: 'completed',
      rating: review.star,
      createdAt: review.createdAt
    }));

    activities.push(...reviewActivities);

    // Sort all activities by date and limit
    activities.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    activities = activities.slice(0, limit);

    res.status(200).json(activities);
  } catch (err) {
    next(err);
  }
};

// Get recent messages for dashboard
export const getRecentMessages = async (req, res, next) => {
  try {
    const userId = req.userId;
    const limit = parseInt(req.query.limit) || 5;

    // Get conversations for the user
    const conversations = await Conversation.find({
      $or: [{ buyerId: userId }, { sellerId: userId }]
    })
    .sort({ lastMessage: -1 })
    .limit(limit);

    const messagesData = await Promise.all(
      conversations.map(async (conv) => {
        // Get the other user in the conversation
        const otherUserId = conv.buyerId.toString() === userId ? conv.sellerId : conv.buyerId;
        const otherUser = await User.findById(otherUserId).select('username img');
        
        // Get the latest message
        // Match by custom conversation.id (string)
        const latestMessage = await Message.findOne({
          conversationId: conv.id
        }).sort({ createdAt: -1 });

        // Count unread messages from the other user
        const unreadCount = await Message.countDocuments({
          conversationId: conv.id,
          userId: otherUserId,
          isRead: false
        });

        return {
          conversationId: conv.id,
          otherUser: {
            id: otherUser._id,
            username: otherUser.username,
            img: otherUser.img || '/img/noavatar.jpg'
          },
          latestMessage: latestMessage ? {
            content: latestMessage.desc.substring(0, 50) + '...',
            time: formatTimeAgo(latestMessage.createdAt),
            isFromCurrentUser: latestMessage.userId.toString() === userId
          } : null,
          unreadCount,
          lastActivity: conv.lastMessage || conv.createdAt
        };
      })
    );

    res.status(200).json(messagesData);
  } catch (err) {
    next(err);
  }
};

// Get trending gigs for recommendations
export const getTrendingGigs = async (req, res, next) => {
  try {
    const userId = req.userId;
    const limit = parseInt(req.query.limit) || 8;

    // Get user's skills/interests for better recommendations
    const currentUser = await User.findById(userId).select('skills');
    
    let query = {};
    
    // If user has skills, try to match categories
    if (currentUser.skills && currentUser.skills.length > 0) {
      // Create a regex pattern that matches any of the user's skills
      const skillsRegex = currentUser.skills.map(skill => new RegExp(skill, 'i'));
      query = {
        $or: [
          { cat: { $in: skillsRegex } },
          { subcategory: { $in: skillsRegex } }
        ]
      };
    }

    const trendingGigs = await Gig.find(query)
      .sort({ sales: -1, createdAt: -1 }) // Sort by sales first, then newest
      .limit(limit)
      .populate('userId', 'username img averageRating totalReviews');

    res.status(200).json(trendingGigs);
  } catch (err) {
    next(err);
  }
};

// Helper function to get conversation IDs for a user
async function getConversationIds(userId) {
  const conversations = await Conversation.find({
    $or: [{ buyerId: userId }, { sellerId: userId }]
  }).select('id');
  
  // Return the custom conversation.id string to match Message.conversationId
  return conversations.map(conv => conv.id);
}

// Helper function to format time ago
function formatTimeAgo(date) {
  const now = new Date();
  const diffInSeconds = Math.floor((now - new Date(date)) / 1000);
  
  if (diffInSeconds < 60) return 'Just now';
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)} min ago`;
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)} hours ago`;
  if (diffInSeconds < 2592000) return `${Math.floor(diffInSeconds / 86400)} days ago`;
  
  return new Date(date).toLocaleDateString();
}

// Get notifications using the notification service
export const getNotifications = async (req, res, next) => {
  try {
    const userId = req.userId;
    const limit = parseInt(req.query.limit) || 10;
    const onlyUnread = req.query.onlyUnread === 'true';

    const notifications = await notificationService.getUserNotifications(userId, {
      limit,
      onlyUnread
    });

    res.status(200).json(notifications);
  } catch (err) {
    next(err);
  }
};

// Mark notification as read
export const markNotificationAsRead = async (req, res, next) => {
  try {
    const { notificationId } = req.params;
    const userId = req.userId;

    const result = await notificationService.markAsRead(notificationId);
    
    if (!result) {
      return next(createError(404, "Notification not found"));
    }

    res.status(200).json({ message: "Notification marked as read" });
  } catch (err) {
    next(err);
  }
};

// Clear all notifications
export const clearAllNotifications = async (req, res, next) => {
  try {
    const userId = req.userId;

    const result = await notificationService.clearAllNotifications(userId);
    
    if (!result) {
      return next(createError(500, "Failed to clear notifications"));
    }

    res.status(200).json({ message: "All notifications cleared" });
  } catch (err) {
    next(err);
  }
};

// Get unread notification count
export const getUnreadCount = async (req, res, next) => {
  try {
    const userId = req.userId;

    const count = await notificationService.getUnreadCount(userId);

    res.status(200).json({ count });
  } catch (err) {
    next(err);
  }
};
