import mongoose from 'mongoose';
const { Schema } = mongoose;

const userSchema = new Schema({
firstname: {
    type: String,
    required: true,
},
lastname: {
    type: String,
    required: true,
},
username:{
    type: String,
    required: true,
    unique: true,
},
email:{
    type: String,
    required: true,
    unique: true,
},
password:{
    type: String,
    required: true,
},
img:{
    type: String,
    required: false,
},
state:{
    type: String,
    required: false,
},
phone:{
    type: String,
    required: false,
},
desc:{
    type: String,
    required: false,
},
// Profile-specific fields
professionalTitle: {
    type: String,
    required: false,
},
skills: [{
    type: String,
    required: false,
}],
languages: [{
    language: {
        type: String,
        required: false,
    },
    level: {
        type: String,
        enum: ['Basic', 'Conversational', 'Fluent', 'Native'],
        required: false,
    }
}],
education: [{
    institution: {
        type: String,
        required: false,
    },
    degree: {
        type: String,
        required: false,
    },
    field: {
        type: String,
        required: false,
    },
    year: {
        type: Number,
        required: false,
    }
}],
certifications: [{
    name: {
        type: String,
        required: false,
    },
    issuer: {
        type: String,
        required: false,
    },
    year: {
        type: Number,
        required: false,
    },
    credentialId: {
        type: String,
        required: false,
    }
}],
portfolio: [{
    title: {
        type: String,
        required: false,
    },
    description: {
        type: String,
        required: false,
    },
    image: {
        type: String,
        required: false,
    },
    link: {
        type: String,
        required: false,
    },
    category: {
        type: String,
        required: false,
    }
}],
socialLinks: {
    website: {
        type: String,
        required: false,
    },
    linkedin: {
        type: String,
        required: false,
    },
    twitter: {
        type: String,
        required: false,
    },
    github: {
        type: String,
        required: false,
    },
    behance: {
        type: String,
        required: false,
    },
    dribbble: {
        type: String,
        required: false,
    }
},
// Seller-specific fields
hourlyRate: {
    type: Number,
    required: false,
},
responseTime: {
    type: String,
    enum: ['Within 1 hour', 'Within 6 hours', 'Within 24 hours', 'Within 3 days'],
    default: 'Within 24 hours',
    required: false,
},
availability: {
    type: String,
    enum: ['Available', 'Busy', 'Away', 'Unavailable'],
    default: 'Available',
    required: false,
},
// Statistics (calculated fields)
totalReviews: {
    type: Number,
    default: 0,
},
averageRating: {
    type: Number,
    default: 0,
},
totalOrders: {
    type: Number,
    default: 0,
},
completionRate: {
    type: Number,
    default: 0,
},

// FRAUD PREVENTION & TRUST SYSTEM
trustScore: {
    type: Number,
    default: 100, // Start with perfect trust score
    min: 0,
    max: 100,
},
disputesInitiated: {
    type: Number,
    default: 0,
},
disputesWon: {
    type: Number,
    default: 0,
},
disputesLost: {
    type: Number,
    default: 0,
},
disputesPartial: {
    type: Number,
    default: 0,
},
fraudFlags: {
    type: Number,
    default: 0,
},
verificationLevel: {
    type: String,
    enum: ['unverified', 'email_verified', 'phone_verified', 'id_verified', 'enhanced'],
    default: 'email_verified',
},
riskScore: {
    type: Number,
    default: 0, // Higher number = higher risk
    min: 0,
    max: 100,
},
isBlacklisted: {
    type: Boolean,
    default: false,
},
blacklistReason: {
    type: String,
    required: false,
},
successfulDeliveries: {
    type: Number,
    default: 0,
},
onTimeDeliveryRate: {
    type: Number,
    default: 0, // Percentage
},

// FRAUD MONITORING FIELDS
trustScoreHistory: [{
    previousScore: Number,
    newScore: Number,
    adjustment: Number,
    reason: String,
    adjustedBy: String,
    adjustedAt: {
        type: Date,
        default: Date.now
    }
}],
flagHistory: [{
    reason: String,
    severity: {
        type: String,
        enum: ['low', 'medium', 'high'],
        required: true
    },
    flaggedBy: String, // userId or 'system'
    flaggedAt: {
        type: Date,
        default: Date.now
    }
}],
transactionLimit: {
    type: Number,
    default: 100000, // Default ₦100K limit (₦1M was likely a typo)
},
unlimitedTransactions: {
    type: Boolean,
    default: false, // ID-verified users get unlimited transactions
},
requiresManualApproval: {
    type: Boolean,
    default: false,
},

// ENHANCED VERIFICATION FIELDS
phoneVerified: {
    type: Boolean,
    default: false,
},
phoneVerificationCode: String,
phoneVerificationExpires: Date,
pendingPhoneNumber: String,
phoneVerifiedAt: Date,

idVerification: {
    type: {
        type: String,
        enum: ['national_id', 'drivers_license', 'passport', 'voters_card']
    },
    number: String, // Should be encrypted in production
    frontImage: String,
    backImage: String,
    status: {
        type: String,
        enum: ['pending', 'approved', 'rejected'],
        default: 'pending'
    },
    submittedAt: Date,
    reviewedAt: Date,
    reviewedBy: String,
    rejectionReason: String,
    adminNotes: String
},
profileViews: {
    type: Number,
    default: 0,
},
lastSeen: {
    type: Date,
    default: Date.now,
},
profileCompletedAt: {
    type: Date,
    required: false,
},
isSeller:{
    type: Boolean,
    default: false,
},
isAdmin: {
    type: Boolean,
    default: false,
},
// New fields for Google authentication
    googleId: {
      type: String,
      required: false,
      unique: true,
      sparse: true, // Allows multiple null values
    },
    isGoogleUser: {
      type: Boolean,
      default: false,
    },
    emailVerified: {
      type: Boolean,
      default: false,
    },
    emailVerifiedAt: {
      type: Date,
      required: false,
    },
    
    // Notification preferences
    notificationSettings: {
      email: {
        type: Boolean,
        default: true,
      },
      push: {
        type: Boolean,
        default: true,
      },
      newMessages: {
        type: Boolean,
        default: true,
      },
      messageReactions: {
        type: Boolean,
        default: true,
      },
      typing: {
        type: Boolean,
        default: false,
      },
      userStatus: {
        type: Boolean,
        default: false,
      },
    },
    
    // User status tracking
    isOnline: {
      type: Boolean,
      default: false,
    },
    
    status: {
      type: String,
      enum: ['online', 'away', 'busy', 'offline'],
      default: 'offline',
    },
    
    // Admin management fields
    suspensionEnd: {
      type: Date,
      required: false
    },
    suspendedBy: {
      type: String,
      required: false
    },
    suspendedAt: {
      type: Date,
      required: false
    },
    deletedBy: {
      type: String,
      required: false
    },
    deletedAt: {
      type: Date,
      required: false
    },
    deletionReason: {
      type: String,
      required: false
    },
    isDeleted: {
      type: Boolean,
      default: false
    },
    isSuperAdmin: {
      type: Boolean,
      default: false
    },
    favorites: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Gig',
      required: false
    }],
    favoriteSellers: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: false
    }],
    
    // Content violation tracking
    contentViolations: [{
      timestamp: {
        type: Date,
        default: Date.now
      },
      content: String, // Original message content
      violations: [{
        type: String,
        match: String,
        severity: {
          type: String,
          enum: ['low', 'medium', 'high']
        },
        position: Number
      }],
      severity: {
        type: String,
        enum: ['low', 'medium', 'high']
      },
      action: {
        type: String,
        enum: ['none', 'filter', 'block', 'warn']
      },
      messageType: {
        type: String,
        enum: ['chat', 'gig_description', 'profile_description', 'review'],
        default: 'chat'
      }
    }],
    
    // Content filtering settings
    contentFilteringLevel: {
      type: String,
      enum: ['strict', 'standard', 'relaxed'],
      default: 'standard'
    }
},{
    timestamps:true
});

// Add index for Google ID
userSchema.index({ googleId: 1 }, { unique: true, sparse: true });

export default mongoose.model("User", userSchema)