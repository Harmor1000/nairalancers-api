import mongoose from 'mongoose';
const { Schema } = mongoose;

const settingsSchema = new Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true,
  },
  // Profile Settings
  profile: {
    displayName: {
      type: String,
      default: '',
    },
    bio: {
      type: String,
      default: '',
      maxLength: 600,
    },
    skills: [{
      type: String,
    }],
    languages: [{
      language: String,
      proficiency: {
        type: String,
        enum: ['Basic', 'Conversational', 'Fluent', 'Native'],
        default: 'Basic'
      }
    }],
    education: [{
      institution: String,
      degree: String,
      field: String,
      year: Number,
    }],
    certifications: [{
      name: String,
      issuer: String,
      year: Number,
    }],
    portfolio: [{
      title: String,
      description: String,
      image: String,
      url: String,
    }],
    timezone: {
      type: String,
      default: 'Africa/Lagos',
    },
  },
  // Account Settings
  account: {
    emailNotifications: {
      type: Boolean,
      default: true,
    },
    marketingEmails: {
      type: Boolean,
      default: false,
    },
    twoFactorAuth: {
      type: Boolean,
      default: false,
    },
    profileVisibility: {
      type: String,
      enum: ['public', 'private'],
      default: 'public',
    },
    onlineStatus: {
      type: Boolean,
      default: true,
    },
  },
  // Security Settings
  security: {
    lastPasswordChange: {
      type: Date,
      default: Date.now,
    },
    loginNotifications: {
      type: Boolean,
      default: true,
    },
    sessionTimeout: {
      type: Number,
      default: 30, // minutes
    },
  },
  // Notification Preferences
  notifications: {
    orderUpdates: {
      type: Boolean,
      default: true,
    },
    messageNotifications: {
      type: Boolean,
      default: true,
    },
    reviewNotifications: {
      type: Boolean,
      default: true,
    },
    promotionalOffers: {
      type: Boolean,
      default: false,
    },
    weeklyDigest: {
      type: Boolean,
      default: true,
    },
    push: {
      enabled: {
        type: Boolean,
        default: false,
      },
      orders: {
        type: Boolean,
        default: true,
      },
      messages: {
        type: Boolean,
        default: true,
      },
    },
  },
  // Seller-specific settings
  seller: {
    isEnabled: {
      type: Boolean,
      default: false,
    },
    responseTime: {
      type: String,
      enum: ['within_1_hour', 'within_6_hours', 'within_24_hours'],
      default: 'within_24_hours',
    },
    autoAcceptOrders: {
      type: Boolean,
      default: false,
    },
    vacationMode: {
      enabled: {
        type: Boolean,
        default: false,
      },
      message: {
        type: String,
        default: '',
      },
      startDate: Date,
      endDate: Date,
    },
  },
  // Bank Details for Withdrawals (Freelancers only)
  bankDetails: {
    accountNumber: {
      type: String,
      required: false,
      validate: {
        validator: function(v) {
          return !v || /^\d{10}$/.test(v); // Nigerian account numbers are 10 digits
        },
        message: 'Account number must be 10 digits'
      }
    },
    bankName: {
      type: String,
      required: false,
      enum: [
        '', // Allow empty string
        'Access Bank', 'GTBank', 'First Bank', 'UBA', 'Zenith Bank',
        'Fidelity Bank', 'FCMB', 'Sterling Bank', 'Union Bank', 
        'Keystone Bank', 'Wema Bank', 'Polaris Bank', 'Stanbic IBTC',
        'Ecobank', 'Heritage Bank', 'Standard Chartered'
      ]
    },
    accountName: {
      type: String,
      required: false,
      trim: true
    }
  },
}, {
  timestamps: true,
});

// Ensure one settings document per user
settingsSchema.index({ userId: 1 }, { unique: true });

export default mongoose.model("Settings", settingsSchema);
