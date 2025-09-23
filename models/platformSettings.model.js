import mongoose from 'mongoose';
const { Schema } = mongoose;

const PlatformSettingsSchema = new Schema({
  // Fee Structure
  fees: {
    serviceFee: {
      percentage: {
        type: Number,
        default: 5, // 5% platform fee
        min: 0,
        max: 50
      },
      minimum: {
        type: Number,
        default: 100 // Minimum ₦100 fee
      },
      maximum: {
        type: Number,
        default: 50000 // Maximum ₦50,000 fee
      }
    },
    paymentProcessingFee: {
      percentage: {
        type: Number,
        default: 2.9, // 2.9% + fixed fee
        min: 0,
        max: 10
      },
      fixed: {
        type: Number,
        default: 30 // ₦30 fixed fee
      }
    },
    withdrawalFee: {
      percentage: {
        type: Number,
        default: 0, // 2% withdrawal fee
        min: 0,
        max: 10
      },
      minimum: {
        type: Number,
        default: 50 // Minimum ₦50 fee
      },
      maximum: {
        type: Number,
        default: 5000 // Maximum ₦5,000 fee
      }
    }
  },

  // Transaction Limits
  limits: {
    minimumOrder: {
      type: Number,
      default: 1000 // ₦1,000 minimum order
    },
    maximumOrder: {
      type: Number,
      default: 5000000 // ₦5M maximum order
    },
    minimumWithdrawal: {
      type: Number,
      default: 2000 // ₦2,000 minimum withdrawal
    },
    maximumWithdrawal: {
      type: Number,
      default: 1000000 // ₦1M maximum withdrawal per transaction
    },
    dailyWithdrawalLimit: {
      type: Number,
      default: 2000000 // ₦2M daily withdrawal limit
    },
    monthlyWithdrawalLimit: {
      type: Number,
      default: 10000000 // ₦10M monthly withdrawal limit
    }
  },

  // Verification Requirements
  verification: {
    emailRequired: {
      type: Boolean,
      default: true
    },
    phoneRequired: {
      type: Boolean,
      default: false
    },
    idRequired: {
      type: Boolean,
      default: false
    },
    addressRequired: {
      type: Boolean,
      default: false
    },
    verificationLimits: {
      unverified: {
        orderLimit: {
          type: Number,
          default: 10000 // ₦10,000 order limit
        },
        withdrawalLimit: {
          type: Number,
          default: 0 // Cannot withdraw
        }
      },
      emailVerified: {
        orderLimit: {
          type: Number,
          default: 100000 // ₦100,000 order limit
        },
        withdrawalLimit: {
          type: Number,
          default: 50000 // ₦50,000 withdrawal limit
        }
      },
      phoneVerified: {
        orderLimit: {
          type: Number,
          default: 500000 // ₦500,000 order limit
        },
        withdrawalLimit: {
          type: Number,
          default: 200000 // ₦200,000 withdrawal limit
        }
      },
      idVerified: {
        orderLimit: {
          type: Number,
          default: 5000000 // ₦5M order limit
        },
        withdrawalLimit: {
          type: Number,
          default: 1000000 // ₦1M withdrawal limit
        }
      },
      enhanced: {
        orderLimit: {
          type: Number,
          default: -1 // Unlimited
        },
        withdrawalLimit: {
          type: Number,
          default: -1 // Unlimited (subject to daily/monthly limits)
        }
      }
    }
  },

  // Dispute & Escrow Settings
  disputes: {
    autoReleaseAfterDays: {
      type: Number,
      default: 14 // Auto-release after 14 days
    },
    disputeTimeoutDays: {
      type: Number,
      default: 30 // Must initiate dispute within 30 days
    },
    escrowHoldDays: {
      type: Number,
      default: 3 // Hold payment for 3 days after delivery
    },
    adminReviewTimeoutDays: {
      type: Number,
      default: 7 // Admin must review dispute within 7 days
    }
  },

  // Content Moderation
  moderation: {
    autoModerationEnabled: {
      type: Boolean,
      default: true
    },
    profanityFilterEnabled: {
      type: Boolean,
      default: true
    },
    imageModeration: {
      type: Boolean,
      default: true
    },
    requireGigApproval: {
      type: Boolean,
      default: false
    },
    requireProfileApproval: {
      type: Boolean,
      default: false
    },
    flaggedContentAction: {
      type: String,
      enum: ['hide', 'review', 'auto_remove'],
      default: 'review'
    }
  },

  // Subscription & Membership
  subscriptions: {
    sellerSubscription: {
      enabled: {
        type: Boolean,
        default: false
      },
      monthlyPrice: {
        type: Number,
        default: 5000 // ₦5,000/month
      },
      features: [String],
      discountedFee: {
        type: Number,
        default: 3 // 3% instead of 5%
      }
    },
    buyerSubscription: {
      enabled: {
        type: Boolean,
        default: false
      },
      monthlyPrice: {
        type: Number,
        default: 2000 // ₦2,000/month
      },
      features: [String],
      benefits: [String]
    }
  },

  // Communication Settings
  communication: {
    allowDirectContact: {
      type: Boolean,
      default: false
    },
    messageRetentionDays: {
      type: Number,
      default: 365 // Keep messages for 1 year
    },
    maxFileSize: {
      type: Number,
      default: 10485760 // 10MB
    },
    allowedFileTypes: {
      type: [String],
      default: ['jpg', 'jpeg', 'png', 'pdf', 'doc', 'docx', 'txt']
    }
  },

  // Security Settings
  security: {
    maxLoginAttempts: {
      type: Number,
      default: 5
    },
    lockoutDurationMinutes: {
      type: Number,
      default: 30
    },
    sessionTimeoutHours: {
      type: Number,
      default: 24
    },
    passwordComplexityRequired: {
      type: Boolean,
      default: true
    },
    twoFactorRequired: {
      type: Boolean,
      default: false
    }
  },

  // SEO & Marketing
  seo: {
    siteName: {
      type: String,
      default: 'Nairalancers'
    },
    siteDescription: {
      type: String,
      default: 'Nigeria\'s Premier Freelancing Platform'
    },
    keywords: {
      type: [String],
      default: ['freelancing', 'nigeria', 'jobs', 'services']
    },
    metaTitle: String,
    metaDescription: String,
    socialMedia: {
      facebook: String,
      twitter: String,
      instagram: String,
      linkedin: String
    }
  },

  // System Maintenance
  maintenance: {
    maintenanceMode: {
      type: Boolean,
      default: false
    },
    maintenanceMessage: {
      type: String,
      default: 'Site under maintenance. Please check back soon.'
    },
    allowedIPs: [String], // IPs that can access during maintenance
    estimatedDuration: String
  },

  // Analytics & Tracking
  analytics: {
    googleAnalyticsId: String,
    facebookPixelId: String,
    trackingEnabled: {
      type: Boolean,
      default: true
    },
    dataRetentionDays: {
      type: Number,
      default: 730 // 2 years
    }
  },

  // API Settings
  api: {
    rateLimitPerMinute: {
      type: Number,
      default: 100
    },
    apiKeyRequired: {
      type: Boolean,
      default: false
    },
    webhooksEnabled: {
      type: Boolean,
      default: true
    }
  },

  // Feature Flags
  features: {
    chatSystem: {
      type: Boolean,
      default: true
    },
    videoMeetings: {
      type: Boolean,
      default: false
    },
    portfolioSystem: {
      type: Boolean,
      default: true
    },
    reviewSystem: {
      type: Boolean,
      default: true
    },
    disputeSystem: {
      type: Boolean,
      default: true
    },
    affiliateProgram: {
      type: Boolean,
      default: false
    }
  },

  // Last updated info
  lastUpdatedBy: {
    type: Schema.Types.ObjectId,
    ref: 'User'
  },
  lastUpdatedByName: String,
  updateReason: String
}, {
  timestamps: true
});

// Only allow one settings document
PlatformSettingsSchema.index({}, { unique: true });

export default mongoose.model("PlatformSettings", PlatformSettingsSchema);

