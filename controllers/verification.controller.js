import createError from "../utils/createError.js";
import User from "../models/user.model.js";
import Order from "../models/order.model.js";
import crypto from "crypto";

// ENHANCED FREELANCER VERIFICATION SYSTEM

// 1. Request Phone Verification
export const requestPhoneVerification = async (req, res, next) => {
  try {
    const { phoneNumber } = req.body;
    
    const user = await User.findById(req.userId);
    if (!user) return next(createError(404, "User not found"));

    // Check if email is verified first
    if (!user.emailVerified) {
      return next(createError(400, "Email must be verified before phone verification"));
    }

    // Generate 6-digit verification code
    const verificationCode = crypto.randomInt(100000, 999999).toString();
    
    // In production, send SMS here
    console.log(`SMS Verification Code for ${phoneNumber}: ${verificationCode}`);
    
    // Store verification code temporarily (you may want to use Redis for this)
    await User.findByIdAndUpdate(req.userId, {
      phoneVerificationCode: verificationCode,
      phoneVerificationExpires: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes
      pendingPhoneNumber: phoneNumber
    });

    res.status(200).json({
      message: "Verification code sent to your phone number",
      phoneNumber: phoneNumber.replace(/\d(?=\d{4})/g, "*"), // Mask phone number
      expiresIn: "10 minutes"
    });

  } catch (err) {
    next(err);
  }
};

// 8a. Get verification details for a specific user (Admin)
export const getVerificationDetails = async (req, res, next) => {
  try {
    // Verify admin privileges
    const adminUser = await User.findById(req.userId);
    if (!adminUser.isAdmin) {
      return next(createError(403, "Admin access required"));
    }

    const { userId } = req.params;
    const user = await User.findById(userId).select('firstname lastname username email img phone address idVerification createdAt');
    if (!user) return next(createError(404, "User not found"));

    const idv = user.idVerification || {};
    const verification = {
      _id: user._id, // Used by frontend as identifier in review endpoint
      userId: {
        _id: user._id,
        firstname: user.firstname,
        lastname: user.lastname,
        email: user.email,
        img: user.img,
        phone: user.phone,
        address: user.address,
      },
      type: idv.type || 'identity',
      status: idv.status || 'pending',
      documents: [
        idv.frontImage ? { type: 'front', url: idv.frontImage, uploadedAt: idv.submittedAt } : null,
        idv.backImage ? { type: 'back', url: idv.backImage, uploadedAt: idv.submittedAt } : null,
      ].filter(Boolean),
      submittedAt: idv.submittedAt || user.createdAt,
      notes: idv.adminNotes || '',
      priority: 'medium',
    };

    res.status(200).json({ verification });
  } catch (err) {
    next(err);
  }
};

// 2. Verify Phone Number
export const verifyPhoneNumber = async (req, res, next) => {
  try {
    const { verificationCode } = req.body;
    
    const user = await User.findById(req.userId);
    if (!user) return next(createError(404, "User not found"));

    // Check if email is verified first
    if (!user.emailVerified) {
      return next(createError(400, "Email must be verified before phone verification"));
    }

    // Check if code is valid and not expired
    if (!user.phoneVerificationCode || user.phoneVerificationCode !== verificationCode) {
      return next(createError(400, "Invalid verification code"));
    }

    if (new Date() > user.phoneVerificationExpires) {
      return next(createError(400, "Verification code has expired"));
    }

    // Update user verification status
    const updatedUser = await User.findByIdAndUpdate(
      req.userId,
      {
        phone: user.pendingPhoneNumber,
        // verificationLevel: user.verificationLevel === 'unverified' ? 'phone_verified' : 'enhanced',
        verificationLevel: 'phone_verified',
        phoneVerified: true,
        phoneVerifiedAt: new Date(),
        trustScore: Math.min(user.trustScore + 15, 100), // Increase trust score
        // Clear verification fields
        phoneVerificationCode: undefined,
        phoneVerificationExpires: undefined,
        pendingPhoneNumber: undefined,
        transactionLimit: 200000
      },
      { new: true }
    );

    res.status(200).json({
      message: "Phone number verified successfully!",
      verificationLevel: updatedUser.verificationLevel,
      trustScore: updatedUser.trustScore,
      benefits: [
        "Increased trust score (+15 points)",
        "Higher order value limits",
        "Priority in search results",
        "Reduced payment processing delays"
      ]
    });

  } catch (err) {
    next(err);
  }
};

// 3. Upload ID for Verification
export const submitIdVerification = async (req, res, next) => {
  try {
    const { idType, idNumber, frontImageUrl, backImageUrl } = req.body;
    
    const user = await User.findById(req.userId);
    if (!user) return next(createError(404, "User not found"));

    // Check if email is verified first
    if (!user.emailVerified) {
      return next(createError(400, "Email must be verified before ID verification"));
    }

    // Check if phone is verified first
    if (!user.phoneVerified) {
      return next(createError(400, "Phone must be verified before ID verification"));
    }

    // Store ID verification data for admin review
    await User.findByIdAndUpdate(req.userId, {
      idVerification: {
        type: idType,
        number: idNumber, // In production, encrypt this
        frontImage: frontImageUrl,
        backImage: backImageUrl,
        status: 'pending',
        submittedAt: new Date()
      },
      // verificationLevel: 'id_submitted'
    });

    res.status(200).json({
      message: "ID verification documents submitted successfully!",
      status: "pending_review",
      reviewTime: "2-5 business days",
      nextSteps: [
        "Our verification team will review your documents",
        "You'll receive an email notification once reviewed",
        "Approved verification unlocks premium benefits"
      ]
    });

  } catch (err) {
    next(err);
  }
};

// 4. Admin: Approve/Reject ID Verification
export const reviewIdVerification = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const { status, rejectionReason, adminNotes } = req.body; // status: 'approved' or 'rejected'
    
    // Verify admin privileges
    const adminUser = await User.findById(req.userId);
    if (!adminUser.isAdmin) {
      return next(createError(403, "Admin access required"));
    }

    const user = await User.findById(userId);
    if (!user) return next(createError(404, "User not found"));

    const updateData = {
      'idVerification.status': status,
      'idVerification.reviewedAt': new Date(),
      'idVerification.reviewedBy': req.userId,
      'idVerification.adminNotes': adminNotes
    };

    if (status === 'approved') {
      updateData.verificationLevel = 'id_verified';
      updateData.trustScore = Math.min(user.trustScore + 25, 100); // Significant trust boost
      updateData.transactionLimit = null; // Remove transaction limits for ID-verified users
      updateData.unlimitedTransactions = true; // Flag for unlimited transactions
    } else if (status === 'rejected') {
      updateData.verificationLevel = user.phoneVerified ? 'phone_verified' : 'email_verified';
      updateData['idVerification.rejectionReason'] = rejectionReason;
    }

    const updatedUser = await User.findByIdAndUpdate(userId, updateData, { new: true });

    res.status(200).json({
      message: `ID verification ${status} for user ${user.username}`,
      user: {
        username: user.username,
        verificationLevel: updatedUser.verificationLevel,
        trustScore: updatedUser.trustScore
      },
      reviewedBy: adminUser.username
    });

  } catch (err) {
    next(err);
  }
};

// 5. Get Verification Status and Benefits
export const getVerificationStatus = async (req, res, next) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) return next(createError(404, "User not found"));

    // Check if user should have email verified automatically
    await checkAndUpdateEmailVerificationStatus(user);
    
    // Refresh user data after potential update
    const updatedUser = await User.findById(req.userId);

    // Determine user type for enhanced verification info
    const userType = updatedUser.isSeller ? 'freelancer' : 'client';
    const currentLevel = updatedUser.verificationLevel || 'unverified';
    
    // Get current transaction limits with user type differentiation
    const { getDefaultTransactionLimit } = await import('../utils/transactionLimits.js');
    const transactionLimit = getDefaultTransactionLimit(currentLevel, userType === 'client');
    
    // Determine if user has unlimited transactions (different rules for clients vs freelancers)
    const hasUnlimitedTransactions = userType === 'client' 
      ? updatedUser.phoneVerified || updatedUser.unlimitedTransactions
      : updatedUser.verificationLevel === 'id_verified' || updatedUser.unlimitedTransactions;

    const verificationStatus = {
      // Basic verification info
      userType: userType,
      currentLevel: currentLevel,
      emailVerified: updatedUser.emailVerified,
      phoneVerified: updatedUser.phoneVerified || false,
      idVerified: updatedUser.verificationLevel === 'id_verified' || updatedUser.verificationLevel === 'enhanced',
      idVerification: updatedUser.idVerification || null,
      trustScore: updatedUser.trustScore,
      
      // Enhanced transaction limit info
      transactionLimit: hasUnlimitedTransactions ? null : transactionLimit,
      hasUnlimitedTransactions: hasUnlimitedTransactions,
      unlimitedTransactions: hasUnlimitedTransactions, // Backward compatibility
      
      // User type-specific benefits
      benefits: {
        current: getVerificationBenefits(currentLevel, userType),
        next: getNextLevelBenefits(currentLevel, userType)
      },
      
      // Enhanced next steps with user type awareness
      nextSteps: getVerificationNextSteps(updatedUser),
      
      // Progress tracking
      verificationProgress: {
        email: updatedUser.emailVerified,
        phone: updatedUser.phoneVerified,
        id: updatedUser.verificationLevel === 'id_verified' || updatedUser.verificationLevel === 'enhanced'
      }
    };

    // Add user-specific next steps for transaction limits
    const enhancedNextSteps = [];
    
    if (!updatedUser.emailVerified) {
      enhancedNextSteps.push({
        action: "Verify email address",
        urgency: "high",
        benefit: userType === 'client' 
          ? "Increase order limit to ₦200,000" 
          : "Enable gig creation and increase withdrawal limit"
      });
    }
    
    if (!updatedUser.phoneVerified) {
      enhancedNextSteps.push({
        action: "Verify phone number",
        urgency: userType === 'client' ? "high" : "medium",
        benefit: userType === 'client' 
          ? "🎉 Get UNLIMITED order amounts!" 
          : "Increase withdrawal limit to ₦200,000"
      });
    }
    
    if (userType === 'freelancer' && updatedUser.verificationLevel !== 'id_verified' && updatedUser.verificationLevel !== 'enhanced') {
      enhancedNextSteps.push({
        action: "Complete ID verification",
        urgency: "medium",
        benefit: "🎉 Get UNLIMITED withdrawal amounts and verified badge"
      });
    }

    // Merge original nextSteps with enhanced ones
    verificationStatus.enhancedNextSteps = enhancedNextSteps;

    res.status(200).json(verificationStatus);

  } catch (err) {
    console.error('Error getting verification status:', err);
    next(err);
  }
};

// Helper function to check and update email verification status for existing users
const checkAndUpdateEmailVerificationStatus = async (user) => {
  try {
    // Skip if already verified
    if (user.emailVerified) return;
    
    // Auto-verify email for users who meet certain criteria:
    // 1. Account is older than 24 hours (they've had time to verify)
    // 2. User has been active (has made orders, posted gigs, etc.)
    // 3. User has a valid email format
    
    const accountAge = Date.now() - new Date(user.createdAt).getTime();
    const dayInMs = 24 * 60 * 60 * 1000;
    
    // Check if account is older than 24 hours
    if (accountAge > dayInMs) {
      // Import Order model to check for activity
      try {
        const Order = (await import("../models/order.model.js")).default;
        
        // Check if user has any orders (as buyer or seller)
        const hasOrders = await Order.findOne({
          $or: [
            { buyerId: user._id },
            { sellerId: user._id }
          ]
        });
        
        // Auto-verify if user has been active OR account is older than 7 days
        const weekInMs = 7 * dayInMs;
        const shouldAutoVerify = hasOrders || (accountAge > weekInMs);
        
        if (shouldAutoVerify) {
          await User.findByIdAndUpdate(user._id, {
            emailVerified: true,
            emailVerifiedAt: new Date(),
            verificationLevel: user.verificationLevel === 'unverified' ? 'email_verified' : user.verificationLevel
          });
          
          console.log(`Auto-verified email for user ${user.username} (${user.email})`);
        }
      } catch (importError) {
        // If we can't import Order model, just auto-verify accounts older than 7 days
        if (accountAge > 7 * dayInMs) {
          await User.findByIdAndUpdate(user._id, {
            emailVerified: true,
            emailVerifiedAt: new Date(),
            verificationLevel: user.verificationLevel === 'unverified' ? 'email_verified' : user.verificationLevel
          });
          
          console.log(`Auto-verified email for old account ${user.username} (${user.email})`);
        }
      }
    }
  } catch (error) {
    console.error('Error in checkAndUpdateEmailVerificationStatus:', error);
  }
};

// Helper Functions
const getVerificationBenefits = (level, userType = 'client') => {
  const isClient = userType === 'client' || userType === 'buyer';
  const isFreelancer = userType === 'freelancer' || userType === 'seller';

  // CLIENT BENEFITS (More focused on spending/ordering)
  const clientBenefits = {
    unverified: [
      "Basic platform access",
      "₦50,000 order limit",
      "Standard support"
    ],
    email_verified: [
      "Email notifications enabled",
      "₦200,000 order limit",
      "Order tracking and updates",
      "Basic buyer protection"
    ],
    phone_verified: [
      "🎉 UNLIMITED order amounts",
      "Priority customer support",
      "Faster payment processing",
      "Enhanced buyer protection",
      "Premium order management"
    ],
    id_verified: [
      "All phone verification benefits",
      "VIP customer support",
      "Exclusive high-value services access",
      "Priority dispute resolution"
    ],
    enhanced: [
      "All premium benefits",
      "Dedicated account manager",
      "Custom enterprise solutions",
      "Priority platform features"
    ]
  };

  // FREELANCER BENEFITS (More focused on earning/selling)
  const freelancerBenefits = {
    unverified: [
      "Basic profile creation",
      "₦25,000 withdrawal limit",
      "Standard support"
    ],
    email_verified: [
      "Email notifications",
      "₦100,000 withdrawal limit",
      "Gig creation enabled",
      "Basic seller tools"
    ],
    phone_verified: [
      "Priority support",
      "₦200,000 withdrawal limit",
      "Enhanced profile visibility",
      "Faster payment processing",
      "Advanced seller analytics"
    ],
    id_verified: [
      "🎉 UNLIMITED withdrawals",
      "Verified badge on profile",
      "Premium seller features",
      "Higher search ranking",
      "Reduced escrow hold times",
      "Advanced dispute protection"
    ],
    enhanced: [
      "All premium benefits",
      "VIP seller support",
      "Priority in search results",
      "Custom seller solutions"
    ]
  };

  const benefits = isClient ? clientBenefits : freelancerBenefits;
  return benefits[level] || benefits.unverified;
};

const getNextLevelBenefits = (currentLevel, userType = 'client') => {
  const progression = {
    unverified: 'email_verified',
    email_verified: 'phone_verified', 
    phone_verified: 'id_verified',
    id_verified: 'enhanced'
  };
  
  const nextLevel = progression[currentLevel];
  return nextLevel ? getVerificationBenefits(nextLevel, userType) : null;
};

const getVerificationNextSteps = (user) => {
  const steps = [];
  
  if (!user.emailVerified) {
    steps.push({
      action: "Verify your email address",
      priority: "high",
      benefit: "Unlock basic platform features"
    });
  }
  
  if (!user.phoneVerified) {
    steps.push({
      action: "Add and verify phone number",
      priority: "medium",
      benefit: "Increase transaction limit to ₦200,000"
    });
  }
  
  if (user.verificationLevel !== 'id_verified' && user.verificationLevel !== 'enhanced') {
    steps.push({
      action: "Submit government ID for verification",
      priority: "low",
      benefit: "Unlock premium features and ₦5M limit"
    });
  }
  
  return steps;
};

// 6. Get Pending ID Verifications (Admin)
export const getPendingIdVerifications = async (req, res, next) => {
  try {
    // Verify admin privileges
    const adminUser = await User.findById(req.userId);
    if (!adminUser.isAdmin) {
      return next(createError(403, "Admin access required"));
    }

    const pendingVerifications = await User.find({
      'idVerification.status': 'pending'
    }).select('firstname lastname username email img idVerification createdAt');

    const enrichedVerifications = pendingVerifications.map(user => ({
      // Use userId as the verification identifier for admin actions
      _id: user._id,
      // Frontend expects a nested user object at userId
      userId: {
        _id: user._id,
        firstname: user.firstname,
        lastname: user.lastname,
        email: user.email,
        img: user.img,
      },
      username: user.username,
      email: user.email,
      type: user.idVerification?.type || 'identity',
      status: user.idVerification?.status || 'pending',
      priority: 'medium',
      notes: user.idVerification?.userNotes || user.idVerification?.adminNotes || '',
      accountAge: Math.floor((new Date() - new Date(user.createdAt)) / (1000 * 60 * 60 * 24)),
      submittedAt: user.idVerification?.submittedAt || user.createdAt,
      waitingDays: user.idVerification?.submittedAt
        ? Math.floor((new Date() - new Date(user.idVerification.submittedAt)) / (1000 * 60 * 60 * 24))
        : 0,
      // Provide a documents array compatible with the frontend expectations
      documents: [
        user.idVerification?.frontImage ? { type: 'front', url: user.idVerification.frontImage, uploadedAt: user.idVerification?.submittedAt } : null,
        user.idVerification?.backImage ? { type: 'back', url: user.idVerification.backImage, uploadedAt: user.idVerification?.submittedAt } : null,
      ].filter(Boolean)
    }));

    res.status(200).json({
      pendingVerifications: enrichedVerifications,
      totalPending: enrichedVerifications.length,
      oldestSubmission: enrichedVerifications.length > 0 ? 
        Math.max(...enrichedVerifications.map(v => v.waitingDays)) : 0
    });

  } catch (err) {
    next(err);
  }
};

// 7. Enhanced Verification Statistics (Admin Dashboard)
export const getVerificationStatistics = async (req, res, next) => {
  try {
    // Verify admin privileges
    const adminUser = await User.findById(req.userId);
    if (!adminUser.isAdmin) {
      return next(createError(403, "Admin access required"));
    }

    const [totalUsers, verificationStats, avgTrustScore] = await Promise.all([
      User.countDocuments({ isAdmin: false }),
      User.aggregate([
        { $match: { isAdmin: false } },
        { $group: { _id: "$verificationLevel", count: { $sum: 1 } } }
      ]),
      User.aggregate([
        { $match: { isAdmin: false } },
        { $group: { _id: null, avgTrustScore: { $avg: "$trustScore" } } }
      ])
    ]);

    const verificationBreakdown = {
      unverified: 0,
      email_verified: 0,
      phone_verified: 0,
      id_verified: 0,
      enhanced: 0
    };

    verificationStats.forEach(stat => {
      verificationBreakdown[stat._id] = stat.count;
    });

    const statistics = {
      totalUsers,
      verificationBreakdown,
      percentages: Object.keys(verificationBreakdown).reduce((acc, level) => {
        acc[level] = ((verificationBreakdown[level] / totalUsers) * 100).toFixed(1);
        return acc;
      }, {}),
      averageTrustScore: avgTrustScore[0]?.avgTrustScore.toFixed(1) || 0,
      fullyVerifiedRate: ((verificationBreakdown.id_verified + verificationBreakdown.enhanced) / totalUsers * 100).toFixed(1)
    };

    res.status(200).json(statistics);

  } catch (err) {
    next(err);
  }
};

// 8. Manual Email Verification for existing users
export const manualEmailVerification = async (req, res, next) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) return next(createError(404, "User not found"));

    // Skip if already verified
    if (user.emailVerified) {
      return res.status(200).json({
        message: "Email is already verified",
        emailVerified: true
      });
    }

    // Manually verify the email for this user
    const updatedUser = await User.findByIdAndUpdate(
      req.userId,
      {
        emailVerified: true,
        emailVerifiedAt: new Date(),
        verificationLevel: user.verificationLevel === 'unverified' ? 'email_verified' : user.verificationLevel,
        trustScore: Math.min(user.trustScore + 5, 100) // Small trust boost
      },
      { new: true }
    );

    res.status(200).json({
      message: "Email verification completed successfully!",
      emailVerified: true,
      verificationLevel: updatedUser.verificationLevel,
      trustScore: updatedUser.trustScore,
      benefits: [
        "Email verified successfully",
        "Trust score increased",
        "Access to more platform features"
      ]
    });

  } catch (err) {
    next(err);
  }
};

