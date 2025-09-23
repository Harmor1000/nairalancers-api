import { Notification, UserNotification } from '../models/notification.model.js';
import User from '../models/user.model.js';

class NotificationService {
  constructor() {
    // In-memory queue for transient socket notifications when users are offline
    this.notificationQueue = new Map();
  }
  
  // Queue a transient notification for delivery when the user next connects via WebSocket
  queueNotification(userId, payload) {
    try {
      const key = String(userId);
      const list = this.notificationQueue.get(key) || [];
      // Normalize minimal shape for client display if possible
      const normalized = {
        ...payload,
        createdAt: new Date()
      };
      list.push(normalized);
      this.notificationQueue.set(key, list);
    } catch (err) {
      // Non-fatal – logging only
      console.error('queueNotification error:', err);
    }
  }

  // Retrieve and clear queued notifications for a user
  getQueuedNotifications(userId) {
    const key = String(userId);
    const list = this.notificationQueue.get(key) || [];
    this.notificationQueue.delete(key);
    return list;
  }
  // Create a notification for a specific user
  async createUserNotification(userId, type, title, message, options = {}) {
    try {
      // Create the main notification
      const notification = new Notification({
        title,
        message,
        type: type || 'custom',
        priority: options.priority || 'medium',
        targetType: 'specific_users',
        targetUsers: [userId],
        deliveryMethods: {
          inApp: true,
          email: options.email || false,
          sms: options.sms || false,
          push: options.push || false
        },
        status: 'sent',
        createdBy: options.createdBy || userId,
        createdByName: options.createdByName || 'System',
        actionButton: options.actionButton || null,
        imageUrl: options.imageUrl || null,
        ...options.extraFields
      });

      const savedNotification = await notification.save();

      // Create user notification tracking
      const userNotification = new UserNotification({
        notificationId: savedNotification._id,
        userId: userId,
        deliveryStatus: {
          inApp: {
            delivered: true,
            deliveredAt: new Date()
          }
        }
      });

      await userNotification.save();

      // Update notification stats
      await Notification.findByIdAndUpdate(savedNotification._id, {
        'stats.totalTargeted': 1,
        'stats.delivered': 1
      });

      return savedNotification;
    } catch (error) {
      console.error('Error creating user notification:', error);
      throw error;
    }
  }

  // Get notifications for a specific user
  async getUserNotifications(userId, options = {}) {
    try {
      const limit = options.limit || 10;
      const offset = options.offset || 0;
      const onlyUnread = options.onlyUnread || false;

      let matchConditions = { userId };
      
      if (onlyUnread) {
        matchConditions['deliveryStatus.inApp.read'] = false;
      }

      const userNotifications = await UserNotification.find(matchConditions)
        .populate({
          path: 'notificationId',
          select: 'title message type priority actionButton imageUrl createdAt'
        })
        .sort({ createdAt: -1 })
        .limit(limit)
        .skip(offset);

      return userNotifications.filter(un => un.notificationId).map(un => ({
        id: un._id,
        notificationId: un.notificationId._id,
        title: un.notificationId.title,
        message: un.notificationId.message,
        type: un.notificationId.type,
        priority: un.notificationId.priority,
        isRead: un.deliveryStatus.inApp.read,
        readAt: un.deliveryStatus.inApp.readAt,
        actionButton: un.notificationId.actionButton,
        imageUrl: un.notificationId.imageUrl,
        createdAt: un.createdAt,
        icon: this.getIconForType(un.notificationId.type),
        time: this.formatTimeAgo(un.createdAt)
      }));
    } catch (error) {
      console.error('Error getting user notifications:', error);
      throw error;
    }
  }

  // Mark notification as read
  async markAsRead(userNotificationId) {
    try {
      const result = await UserNotification.findByIdAndUpdate(
        userNotificationId,
        {
          'deliveryStatus.inApp.read': true,
          'deliveryStatus.inApp.readAt': new Date(),
          lastInteraction: new Date(),
          $inc: { interactionCount: 1 }
        },
        { new: true }
      );

      if (result) {
        // Update notification stats
        await Notification.findByIdAndUpdate(result.notificationId, {
          $inc: { 'stats.read': 1 }
        });
      }

      return result;
    } catch (error) {
      console.error('Error marking notification as read:', error);
      throw error;
    }
  }

  // Generate notification for new order
  async notifyNewOrder(order, seller, buyer) {
    try {
      // Notify seller about new order
      await this.createUserNotification(
        seller._id,
        'order',
        'New Order Received!',
        `You received a new order for "${order.title}" from ${buyer.username}`,
        {
          priority: 'high',
          actionButton: {
            text: 'View Order',
            url: `/orders/${order._id}`,
            style: 'primary'
          }
        }
      );

      // Notify buyer about order confirmation
      await this.createUserNotification(
        buyer._id,
        'order',
        'Order Confirmed',
        `Your order "${order.title}" has been confirmed and is being processed`,
        {
          priority: 'medium',
          actionButton: {
            text: 'Track Order',
            url: `/orders/${order._id}`,
            style: 'primary'
          }
        }
      );
    } catch (error) {
      console.error('Error notifying new order:', error);
    }
  }

  // Generate notification for order completion
  async notifyOrderCompletion(order, seller, buyer) {
    try {
      // Notify buyer about order completion
      await this.createUserNotification(
        buyer._id,
        'order',
        'Order Delivered!',
        `Your order "${order.title}" has been completed by ${seller.username}`,
        {
          priority: 'high',
          actionButton: {
            text: 'Leave Review',
            url: `/orders/${order._id}`,
            style: 'success'
          }
        }
      );

      // Notify seller about successful delivery
      await this.createUserNotification(
        seller._id,
        'order',
        'Order Delivered',
        `Successfully delivered "${order.title}" to ${buyer.username}`,
        {
          priority: 'medium',
          actionButton: {
            text: 'View Order',
            url: `/orders/${order._id}`,
            style: 'success'
          }
        }
      );
    } catch (error) {
      console.error('Error notifying order completion:', error);
    }
  }

  // Generate notification for new review
  async notifyNewReview(review, seller, buyer, gig) {
    try {
      await this.createUserNotification(
        seller._id,
        'review',
        `New ${review.star}-Star Review!`,
        `${buyer.username} left you a ${review.star}-star review for "${gig.title}"`,
        {
          priority: review.star >= 4 ? 'medium' : 'high',
          actionButton: {
            text: 'View Review',
            url: `/gig/${gig._id}#reviews`,
            style: review.star >= 4 ? 'success' : 'warning'
          }
        }
      );
    } catch (error) {
      console.error('Error notifying new review:', error);
    }
  }

  // Generate notification for payment
  async notifyPayment(amount, userId, type = 'received') {
    try {
      const title = type === 'received' ? 'Payment Received!' : 'Payment Processed';
      const message = type === 'received' 
        ? `₦${amount.toLocaleString()} has been added to your balance`
        : `₦${amount.toLocaleString()} payment has been processed`;

      await this.createUserNotification(
        userId,
        'payment',
        title,
        message,
        {
          priority: 'medium',
          actionButton: {
            text: 'View Balance',
            url: '/freelancer-dashboard',
            style: 'success'
          }
        }
      );
    } catch (error) {
      console.error('Error notifying payment:', error);
    }
  }

  // Generate notification for new message
  async notifyNewMessage(...args) {
    try {
      if (args.length >= 5) {
        const [recipientId, senderId, senderUsername, messagePreview, conversationId] = args;
        const preview = messagePreview ? `: "${messagePreview}"` : '';
        await this.createUserNotification(
          recipientId,
          'message',
          'New Message',
          `${senderUsername} sent you a message${preview}`,
          {
            priority: 'medium',
            actionButton: {
              text: 'View Message',
              url: `/message/${conversationId}`,
              style: 'primary'
            }
          }
        );
      } else {
        const [message, sender, recipient] = args;
        await this.createUserNotification(
          recipient._id,
          'message',
          'New Message',
          `${sender.username} sent you a message`,
          {
            priority: 'medium',
            actionButton: {
              text: 'View Message',
              url: `/message/${message.conversationId}`,
              style: 'primary'
            }
          }
        );
      }
    } catch (error) {
      console.error('Error notifying new message:', error);
    }
  }

  // Generate notification when someone reacts to a message
  async notifyMessageReaction(recipientId, reactorId, reactorUsername, emoji, messagePreview, conversationId) {
    try {
      const previewText = messagePreview ? `: "${messagePreview}"` : '';
      await this.createUserNotification(
        recipientId,
        'message',
        'New Reaction',
        `${reactorUsername} reacted ${emoji} to your message${previewText}`,
        {
          priority: 'medium',
          actionButton: {
            text: 'Open Conversation',
            url: `/message/${conversationId}`,
            style: 'primary'
          }
        }
      );
    } catch (error) {
      console.error('Error notifying message reaction:', error);
    }
  }

  // Generate welcome notification for new users
  async notifyWelcome(user) {
    try {
      const title = user.isSeller ? 'Welcome to Nairalancers!' : 'Welcome to Nairalancers!';
      const message = user.isSeller 
        ? 'Start showcasing your skills and building your freelance career'
        : 'Find talented freelancers and get your projects done';

      await this.createUserNotification(
        user._id,
        'welcome',
        title,
        message,
        {
          priority: 'medium',
          actionButton: {
            text: user.isSeller ? 'Create Your First Gig' : 'Browse Services',
            url: user.isSeller ? '/add' : '/gigs',
            style: 'primary'
          }
        }
      );
    } catch (error) {
      console.error('Error notifying welcome:', error);
    }
  }

  // Helper method to get icon for notification type
  getIconForType(type) {
    const icons = {
      'order': '📦',
      'payment': '💰',
      'review': '⭐',
      'message': '💬',
      'welcome': '🎉',
      'system_announcement': '📢',
      'security_alert': '🔒',
      'feature_update': '🚀',
      'warning': '⚠️',
      'promotional': '🎯',
      'dispute_update': '⚖️',
      'custom': '🔔'
    };
    return icons[type] || '🔔';
  }

  // Helper method to format time ago
  formatTimeAgo(date) {
    const now = new Date();
    const diffInSeconds = Math.floor((now - new Date(date)) / 1000);
    
    if (diffInSeconds < 60) return 'Just now';
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)} min ago`;
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)} hours ago`;
    if (diffInSeconds < 2592000) return `${Math.floor(diffInSeconds / 86400)} days ago`;
    
    return new Date(date).toLocaleDateString();
  }

  // Get unread count for user
  async getUnreadCount(userId) {
    try {
      return await UserNotification.countDocuments({
        userId,
        'deliveryStatus.inApp.read': false
      });
    } catch (error) {
      console.error('Error getting unread count:', error);
      return 0;
    }
  }

  // Clear all notifications for user
  async clearAllNotifications(userId) {
    try {
      await UserNotification.updateMany(
        { userId },
        { 
          'deliveryStatus.inApp.read': true,
          'deliveryStatus.inApp.readAt': new Date(),
          lastInteraction: new Date()
        }
      );
      return true;
    } catch (error) {
      console.error('Error clearing notifications:', error);
      return false;
    }
  }
}

export default new NotificationService();