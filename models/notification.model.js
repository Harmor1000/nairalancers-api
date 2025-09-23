import mongoose from 'mongoose';
const { Schema } = mongoose;

const NotificationSchema = new Schema({
  title: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200
  },
  message: {
    type: String,
    required: true,
    trim: true,
    maxlength: 1000
  },
  type: {
    type: String,
    required: true,
    enum: [
      'system_announcement',
      'maintenance_notice', 
      'policy_update',
      'security_alert',
      'feature_update',
      'warning',
      'suspension_notice',
      'welcome',
      'promotional',
      'dispute_update',
      'payment_reminder',
      // App-specific types used across the platform
      'message',
      'order',
      'review',
      'payment',
      'custom'
    ]
  },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'urgent'],
    default: 'medium'
  },
  
  // Target audience
  targetType: {
    type: String,
    required: true,
    enum: ['all', 'sellers', 'buyers', 'admins', 'specific_users', 'user_segment']
  },
  targetUsers: [{
    type: Schema.Types.ObjectId,
    ref: 'User'
  }], // For specific_users type
  targetCriteria: {
    // For user_segment type
    verificationLevel: String,
    country: String,
    registrationDateRange: {
      start: Date,
      end: Date
    },
    orderCount: {
      min: Number,
      max: Number
    },
    trustScore: {
      min: Number,
      max: Number
    }
  },

  // Delivery settings
  deliveryMethods: {
    inApp: {
      type: Boolean,
      default: true
    },
    email: {
      type: Boolean,
      default: false
    },
    sms: {
      type: Boolean,
      default: false
    },
    push: {
      type: Boolean,
      default: false
    }
  },

  // Scheduling
  scheduledFor: {
    type: Date,
    default: null // null means send immediately
  },
  expiresAt: {
    type: Date,
    default: null // null means never expires
  },

  // Status tracking
  status: {
    type: String,
    enum: ['draft', 'scheduled', 'sending', 'sent', 'failed', 'cancelled'],
    default: 'draft'
  },
  
  // Delivery statistics
  stats: {
    totalTargeted: {
      type: Number,
      default: 0
    },
    delivered: {
      type: Number,
      default: 0
    },
    read: {
      type: Number,
      default: 0
    },
    clicked: {
      type: Number,
      default: 0
    },
    failed: {
      type: Number,
      default: 0
    }
  },

  // Creator info
  createdBy: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  createdByName: {
    type: String,
    required: true
  },

  // Content customization
  actionButton: {
    text: String,
    url: String,
    style: {
      type: String,
      enum: ['primary', 'secondary', 'success', 'warning', 'danger'],
      default: 'primary'
    }
  },
  
  // Rich content
  imageUrl: String,
  category: String,
  tags: [String],

  // Auto-archive
  autoArchive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Indexes for efficient querying
NotificationSchema.index({ targetType: 1, status: 1 });
NotificationSchema.index({ createdBy: 1, createdAt: -1 });
NotificationSchema.index({ scheduledFor: 1, status: 1 });
NotificationSchema.index({ type: 1, priority: 1 });
NotificationSchema.index({ 'stats.delivered': -1 });

// User notification delivery tracking
const UserNotificationSchema = new Schema({
  notificationId: {
    type: Schema.Types.ObjectId,
    ref: 'Notification',
    required: true
  },
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User', 
    required: true
  },
  
  // Delivery status
  deliveryStatus: {
    inApp: {
      delivered: { type: Boolean, default: false },
      deliveredAt: Date,
      read: { type: Boolean, default: false },
      readAt: Date
    },
    email: {
      delivered: { type: Boolean, default: false },
      deliveredAt: Date,
      opened: { type: Boolean, default: false },
      openedAt: Date,
      clicked: { type: Boolean, default: false },
      clickedAt: Date,
      bounced: { type: Boolean, default: false },
      failureReason: String
    },
    sms: {
      delivered: { type: Boolean, default: false },
      deliveredAt: Date,
      failed: { type: Boolean, default: false },
      failureReason: String
    },
    push: {
      delivered: { type: Boolean, default: false },
      deliveredAt: Date,
      clicked: { type: Boolean, default: false },
      clickedAt: Date
    }
  },
  
  // User actions
  dismissed: {
    type: Boolean,
    default: false
  },
  dismissedAt: Date,
  
  // Analytics
  interactionCount: {
    type: Number,
    default: 0
  },
  lastInteraction: Date
}, {
  timestamps: true
});

// Compound indexes for user notifications
UserNotificationSchema.index({ userId: 1, createdAt: -1 });
UserNotificationSchema.index({ notificationId: 1, userId: 1 }, { unique: true });
UserNotificationSchema.index({ 'deliveryStatus.inApp.read': 1, userId: 1 });

export const Notification = mongoose.model("Notification", NotificationSchema);
export const UserNotification = mongoose.model("UserNotification", UserNotificationSchema);

