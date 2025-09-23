import User from "../models/user.model.js";
import createError from "./createError.js";

/**
 * Check if a user can make a transaction of a given amount
 * @param {string} userId - The user's ID
 * @param {number} amount - The transaction amount in Naira
 * @param {string} transactionType - 'order' for clients buying, 'withdrawal' for freelancers
 * @returns {Promise<{allowed: boolean, limit: number|null, message?: string}>}
 */
export const checkTransactionLimit = async (userId, amount, transactionType = 'order') => {
  try {
    const user = await User.findById(userId);
    if (!user) {
      throw createError(404, "User not found");
    }

    // DIFFERENT RULES FOR CLIENTS VS FREELANCERS
    const isClient = transactionType === 'order'; // Clients place orders
    const isFreelancer = user.isSeller && transactionType === 'withdrawal';
    
    // CLIENTS: Unlimited transactions after PHONE verification
    if (isClient && (user.unlimitedTransactions || user.phoneVerified)) {
      return {
        allowed: true,
        limit: null,
        unlimited: true,
        userType: 'client'
      };
    }

    // FREELANCERS: Unlimited transactions after ID verification (higher security requirement)
    if (isFreelancer && (user.unlimitedTransactions || user.verificationLevel === 'id_verified')) {
      return {
        allowed: true,
        limit: null,
        unlimited: true,
        userType: 'freelancer'
      };
    }

    // Get appropriate limit based on user type and verification level
    const limit = user.transactionLimit || getDefaultTransactionLimit(user.verificationLevel, isClient);
    
    if (amount > limit) {
      // Different messages for clients vs freelancers
      let message;
      if (isClient) {
        if (!user.phoneVerified) {
          message = `Transaction amount (₦${amount.toLocaleString()}) exceeds your current limit of ₦${limit.toLocaleString()}. Verify your phone number to get unlimited transaction limits.`;
        } else {
          message = `Transaction amount (₦${amount.toLocaleString()}) exceeds your current limit of ₦${limit.toLocaleString()}. Complete email verification to increase your limits.`;
        }
      } else {
        message = `Transaction amount (₦${amount.toLocaleString()}) exceeds your current limit of ₦${limit.toLocaleString()}. Complete ID verification to get unlimited transaction limits.`;
      }

      return {
        allowed: false,
        limit: limit,
        unlimited: false,
        userType: isClient ? 'client' : 'freelancer',
        message: message
      };
    }

    return {
      allowed: true,
      limit: limit,
      unlimited: false,
      userType: isClient ? 'client' : 'freelancer'
    };

  } catch (error) {
    throw error;
  }
};

/**
 * Get default transaction limits based on verification level and user type
 * @param {string} verificationLevel - User's verification level
 * @param {boolean} isClient - Whether the user is a client (true) or freelancer (false)
 * @returns {number} Transaction limit in Naira
 */
export const getDefaultTransactionLimit = (verificationLevel, isClient = true) => {
  // CLIENT LIMITS (More generous since they're spending money, not earning)
  const clientLimits = {
    'unverified': 50000,           // ₦50,000 (higher than freelancers)
    'email_verified': 200000,      // ₦200,000 
    'phone_verified': null,        // UNLIMITED for clients after phone verification
    'id_verified': null,           // Unlimited
    'enhanced': null               // Unlimited
  };
  
  // FREELANCER LIMITS (More restrictive since they're earning money)
  const freelancerLimits = {
    'unverified': 25000,           // ₦25,000
    'email_verified': 100000,      // ₦100,000  
    'phone_verified': 200000,      // ₦200,000 (still limited for freelancers)
    'id_verified': null,           // Unlimited after ID verification
    'enhanced': null               // Unlimited
  };

  const limits = isClient ? clientLimits : freelancerLimits;
  return limits[verificationLevel] || limits['unverified'];
};

/**
 * Format transaction limit for display
 * @param {number|null} limit - The transaction limit
 * @param {boolean} unlimited - Whether user has unlimited transactions
 * @returns {string} Formatted limit string
 */
export const formatTransactionLimit = (limit, unlimited = false) => {
  if (unlimited || limit === null) {
    return "Unlimited";
  }
  
  return `₦${limit.toLocaleString()}`;
};

/**
 * Middleware to check transaction limits before order creation
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object  
 * @param {Function} next - Express next function
 */
export const validateTransactionLimit = async (req, res, next) => {
  try {
    let transactionAmount = null;
    let transactionType = 'order'; // Default to order (client transaction)
    
    // For order initialization route, get price from gig (respect selectedPackage if provided)
    if (req.params.id) {
      const Gig = (await import("../models/gig.model.js")).default;
      const gig = await Gig.findById(req.params.id);
      if (!gig) {
        return next(createError(404, "Gig not found"));
      }
      transactionAmount = gig.price;
      // Prefer milestone total if seller defined milestones
      if (gig.hasMilestones && Array.isArray(gig.milestones) && gig.milestones.length > 0) {
        transactionAmount = gig.milestones.reduce((sum, m) => sum + (m.price || 0), 0);
      } else {
        // Otherwise, respect selected package if provided
        const selectedPackage = (req.body?.selectedPackage || '').toString().toLowerCase();
        const validPkgKeys = ['basic','standard','premium'];
        if (gig.hasPackages && gig.packages && validPkgKeys.includes(selectedPackage)) {
          const pkg = gig.packages[selectedPackage];
          if (pkg?.enabled && typeof pkg.price === 'number' && pkg.price > 0) {
            transactionAmount = pkg.price;
          }
        }
      }
    } else {
      // For other routes, get from request body
      const { amount, price } = req.body;
      transactionAmount = amount || price;
      
      // Check if this is a withdrawal request
      if (req.route.path.includes('withdraw') || req.body.type === 'withdrawal') {
        transactionType = 'withdrawal';
      }
    }
    
    if (!transactionAmount) {
      return next(createError(400, "Transaction amount is required"));
    }

    const limitCheck = await checkTransactionLimit(req.userId, transactionAmount, transactionType);
    
    if (!limitCheck.allowed) {
      // Enhanced error response with verification guidance
      const errorResponse = {
        error: "Transaction Limit Exceeded",
        message: limitCheck.message,
        currentLimit: limitCheck.limit,
        requestedAmount: transactionAmount,
        userType: limitCheck.userType,
        unlimited: limitCheck.unlimited
      };

      // Add specific guidance based on user type
      if (limitCheck.userType === 'client') {
        errorResponse.verificationSteps = [
          { step: 1, action: "Verify your phone number", description: "Get unlimited transaction limits" },
          { step: 2, action: "Go to Settings > Verification", description: "Complete phone verification in under 2 minutes" }
        ];
      } else {
        errorResponse.verificationSteps = [
          { step: 1, action: "Complete ID verification", description: "Upload valid government ID for unlimited limits" },
          { step: 2, action: "Go to Settings > Verification", description: "Upload ID documents for review" }
        ];
      }

      return res.status(400).json(errorResponse);
    }

    // Add limit info to request for logging/analytics
    req.transactionLimitInfo = limitCheck;
    next();

  } catch (error) {
    console.error('Transaction limit validation error:', error);
    next(error);
  }
};
