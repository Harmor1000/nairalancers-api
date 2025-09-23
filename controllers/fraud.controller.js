import createError from "../utils/createError.js";
import Order from "../models/order.model.js";
import User from "../models/user.model.js";
import Gig from "../models/gig.model.js";

// COMPREHENSIVE FRAUD DETECTION SYSTEM

// 1. Real-time Fraud Score Calculation
export const calculateFraudScore = async (userId, orderId = null) => {
  try {
    const user = await User.findById(userId);
    if (!user) throw new Error("User not found");

    const userOrders = await Order.find({
      $or: [{ buyerId: userId }, { sellerId: userId }]
    });

    let riskScore = 0;
    const riskFactors = [];

    // RISK FACTOR 1: Account Age (newer accounts = higher risk)
    const accountAge = (new Date() - new Date(user.createdAt)) / (1000 * 60 * 60 * 24); // days
    if (accountAge < 7) {
      riskScore += 25;
      riskFactors.push("New account (less than 7 days old)");
    } else if (accountAge < 30) {
      riskScore += 10;
      riskFactors.push("Recent account (less than 30 days old)");
    }

    // RISK FACTOR 2: Verification Status
    if (user.verificationLevel === 'unverified') {
      riskScore += 20;
      riskFactors.push("Unverified email address");
    }
    if (!user.phone) {
      riskScore += 15;
      riskFactors.push("No phone number provided");
    }

    // RISK FACTOR 3: Dispute History
    const disputeRate = user.totalOrders > 0 ? 
      (user.disputesInitiated + user.disputesLost) / user.totalOrders : 0;
    if (disputeRate > 0.3) {
      riskScore += 30;
      riskFactors.push(`High dispute rate: ${(disputeRate * 100).toFixed(1)}%`);
    } else if (disputeRate > 0.1) {
      riskScore += 15;
      riskFactors.push(`Moderate dispute rate: ${(disputeRate * 100).toFixed(1)}%`);
    }

    // RISK FACTOR 4: Order Patterns
    const recentOrders = userOrders.filter(order => 
      (new Date() - new Date(order.createdAt)) < (7 * 24 * 60 * 60 * 1000) // last 7 days
    );

    if (recentOrders.length > 10) {
      riskScore += 20;
      riskFactors.push(`High order volume: ${recentOrders.length} orders in last 7 days`);
    }

    // RISK FACTOR 5: Completion Rate (for freelancers)
    if (user.isSeller && user.totalOrders > 5) {
      if (user.completionRate < 70) {
        riskScore += 25;
        riskFactors.push(`Low completion rate: ${user.completionRate}%`);
      }
    }

    // RISK FACTOR 6: Geographic Risk (if available)
    // This would require IP geolocation data

    // RISK FACTOR 7: Payment Patterns
    const cancelledOrders = userOrders.filter(order => 
      order.status === 'cancelled' || order.escrowStatus === 'refunded'
    );
    const cancellationRate = userOrders.length > 0 ? 
      cancelledOrders.length / userOrders.length : 0;

    if (cancellationRate > 0.2) {
      riskScore += 20;
      riskFactors.push(`High cancellation rate: ${(cancellationRate * 100).toFixed(1)}%`);
    }

    // RISK FACTOR 8: Profile Completeness
    let profileCompleteness = 0;
    if (user.img) profileCompleteness += 20;
    if (user.desc) profileCompleteness += 15;
    if (user.skills && user.skills.length > 0) profileCompleteness += 20;
    if (user.professionalTitle) profileCompleteness += 15;
    if (user.portfolio && user.portfolio.length > 0) profileCompleteness += 30;

    if (profileCompleteness < 50) {
      riskScore += 15;
      riskFactors.push(`Incomplete profile: ${profileCompleteness}% complete`);
    }

    // RISK FACTOR 9: Behavioral Patterns
    if (user.fraudFlags > 0) {
      riskScore += user.fraudFlags * 10;
      riskFactors.push(`${user.fraudFlags} previous fraud flags`);
    }

    // Cap risk score at 100
    riskScore = Math.min(riskScore, 100);

    // Determine risk level
    let riskLevel = 'low';
    if (riskScore >= 70) riskLevel = 'high';
    else if (riskScore >= 40) riskLevel = 'medium';

    return {
      userId,
      riskScore,
      riskLevel,
      riskFactors,
      recommendations: getRiskRecommendations(riskScore, riskFactors),
      calculatedAt: new Date()
    };

  } catch (error) {
    throw new Error(`Fraud score calculation failed: ${error.message}`);
  }
};

// 2. Risk-based Recommendations
const getRiskRecommendations = (riskScore, riskFactors) => {
  const recommendations = [];

  if (riskScore >= 70) {
    recommendations.push("BLOCK: High-risk user - manual review required before any transactions");
    recommendations.push("Require enhanced verification (ID + phone + address)");
    recommendations.push("Monitor all transactions closely");
  } else if (riskScore >= 40) {
    recommendations.push("MONITOR: Medium-risk user - increased scrutiny recommended");
    recommendations.push("Require email and phone verification");
    recommendations.push("Limit order values to ₦25,000 until trust is established");
  } else {
    recommendations.push("ALLOW: Low-risk user - standard monitoring");
  }

  // Specific recommendations based on risk factors
  if (riskFactors.some(factor => factor.includes("dispute rate"))) {
    recommendations.push("Consider requiring milestone payments for this user");
  }
  if (riskFactors.some(factor => factor.includes("Incomplete profile"))) {
    recommendations.push("Encourage profile completion before allowing high-value orders");
  }

  return recommendations;
};

// 3. Detect Suspicious Order Patterns
export const detectSuspiciousOrders = async (req, res, next) => {
  try {
    // Verify admin privileges
    const adminUser = await User.findById(req.userId);
    if (!adminUser.isAdmin) {
      return next(createError(403, "Admin access required"));
    }

    const suspiciousPatterns = [];

    // Pattern 1: Multiple orders to same seller in short time
    const recentOrders = await Order.find({
      createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } // last 24 hours
    });

    const buyerSellerPairs = {};
    recentOrders.forEach(order => {
      const key = `${order.buyerId}-${order.sellerId}`;
      if (!buyerSellerPairs[key]) {
        buyerSellerPairs[key] = { orders: [], buyerId: order.buyerId, sellerId: order.sellerId };
      }
      buyerSellerPairs[key].orders.push(order);
    });

    Object.values(buyerSellerPairs).forEach(pair => {
      if (pair.orders.length >= 3) {
        suspiciousPatterns.push({
          type: "Multiple orders to same seller",
          severity: "medium",
          details: `${pair.orders.length} orders from buyer ${pair.buyerId} to seller ${pair.sellerId} in 24h`,
          orders: pair.orders.map(o => o._id)
        });
      }
    });

    // Pattern 2: High-value orders from new users
    const highValueNewUserOrders = await Order.find({
      price: { $gte: 50000 },
      createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
    });

    for (const order of highValueNewUserOrders) {
      const buyer = await User.findById(order.buyerId);
      const accountAge = (new Date() - new Date(buyer.createdAt)) / (1000 * 60 * 60 * 24);
      
      if (accountAge < 7) {
        suspiciousPatterns.push({
          type: "High-value order from new user",
          severity: "high",
          details: `₦${order.price} order from ${accountAge.toFixed(1)} day old account`,
          orderId: order._id,
          buyerId: order.buyerId
        });
      }
    }

    // Pattern 3: Rapid dispute initiation
    const rapidDisputes = await Order.find({
      disputeInitiatedAt: { $exists: true },
      $expr: {
        $lt: [
          { $subtract: ["$disputeInitiatedAt", "$paidAt"] },
          2 * 60 * 60 * 1000 // Less than 2 hours
        ]
      }
    });

    rapidDisputes.forEach(order => {
      suspiciousPatterns.push({
        type: "Rapid dispute initiation",
        severity: "high",
        details: "Dispute initiated within 2 hours of payment",
        orderId: order._id,
        initiatedBy: order.disputeInitiatedBy
      });
    });

    res.status(200).json({
      suspiciousPatterns,
      totalPatterns: suspiciousPatterns.length,
      highSeverity: suspiciousPatterns.filter(p => p.severity === 'high').length,
      mediumSeverity: suspiciousPatterns.filter(p => p.severity === 'medium').length,
      scanCompletedAt: new Date()
    });

  } catch (err) {
    next(err);
  }
};

// 4. Get User Risk Assessment
export const getUserRiskAssessment = async (req, res, next) => {
  try {
    const { userId } = req.params;
    
    // Verify admin privileges or user accessing their own data
    const requestingUser = await User.findById(req.userId);
    if (!requestingUser.isAdmin && req.userId !== userId) {
      return next(createError(403, "Access denied"));
    }

    const riskAssessment = await calculateFraudScore(userId);
    
    // Additional context
    const user = await User.findById(userId);
    const orderHistory = await Order.find({
      $or: [{ buyerId: userId }, { sellerId: userId }]
    }).limit(10).sort({ createdAt: -1 });

    res.status(200).json({
      user: {
        username: user.username,
        email: user.email,
        accountAge: Math.floor((new Date() - new Date(user.createdAt)) / (1000 * 60 * 60 * 24)),
        verificationLevel: user.verificationLevel,
        totalOrders: user.totalOrders,
        trustScore: user.trustScore
      },
      riskAssessment,
      recentOrders: orderHistory.length,
      lastActivity: user.lastSeen
    });

  } catch (err) {
    next(err);
  }
};

// 5. Bulk User Risk Analysis
export const bulkRiskAnalysis = async (req, res, next) => {
  try {
    // Verify admin privileges
    const adminUser = await User.findById(req.userId);
    if (!adminUser.isAdmin) {
      return next(createError(403, "Admin access required"));
    }

    // Analyze all users with recent activity
    const activeUsers = await User.find({
      lastSeen: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }, // active in last 30 days
      isAdmin: false
    }).limit(100); // Process in batches

    const riskAnalysis = [];

    for (const user of activeUsers) {
      try {
        const risk = await calculateFraudScore(user._id);
        if (risk.riskScore >= 40) { // Only include medium and high risk users
          riskAnalysis.push({
            userId: user._id,
            username: user.username,
            email: user.email,
            ...risk
          });
        }
      } catch (error) {
        console.error(`Risk analysis failed for user ${user._id}:`, error.message);
      }
    }

    // Sort by risk score (highest first)
    riskAnalysis.sort((a, b) => b.riskScore - a.riskScore);

    res.status(200).json({
      highRiskUsers: riskAnalysis.filter(u => u.riskScore >= 70),
      mediumRiskUsers: riskAnalysis.filter(u => u.riskScore >= 40 && u.riskScore < 70),
      totalAnalyzed: activeUsers.length,
      flaggedUsers: riskAnalysis.length,
      analysisCompletedAt: new Date()
    });

  } catch (err) {
    next(err);
  }
};

// 6. Update User Trust Score
export const updateTrustScore = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const { adjustment, reason } = req.body;

    // Verify admin privileges
    const adminUser = await User.findById(req.userId);
    if (!adminUser.isAdmin) {
      return next(createError(403, "Admin access required"));
    }

    const user = await User.findById(userId);
    if (!user) return next(createError(404, "User not found"));

    const newTrustScore = Math.max(0, Math.min(100, user.trustScore + adjustment));
    
    await User.findByIdAndUpdate(userId, {
      trustScore: newTrustScore,
      $push: {
        trustScoreHistory: {
          previousScore: user.trustScore,
          newScore: newTrustScore,
          adjustment,
          reason,
          adjustedBy: req.userId,
          adjustedAt: new Date()
        }
      }
    });

    res.status(200).json({
      message: "Trust score updated successfully",
      userId,
      previousScore: user.trustScore,
      newScore: newTrustScore,
      adjustment,
      reason
    });

  } catch (err) {
    next(err);
  }
};

// 7. Flag User for Manual Review
export const flagUserForReview = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const { reason, severity } = req.body;

    // Can be called by admin or automatically by system
    if (req.userId) {
      const requestingUser = await User.findById(req.userId);
      if (!requestingUser.isAdmin) {
        return next(createError(403, "Admin access required"));
      }
    }

    await User.findByIdAndUpdate(userId, {
      $inc: { fraudFlags: 1 },
      $push: {
        flagHistory: {
          reason,
          severity,
          flaggedBy: req.userId || 'system',
          flaggedAt: new Date()
        }
      }
    });

    // If high severity, temporarily suspend high-value transactions
    if (severity === 'high') {
      await User.findByIdAndUpdate(userId, {
        transactionLimit: 10000, // Limit to ₦10,000
        requiresManualApproval: true
      });
    }

    res.status(200).json({
      message: "User flagged for manual review",
      userId,
      severity,
      reason
    });

  } catch (err) {
    next(err);
  }
};
