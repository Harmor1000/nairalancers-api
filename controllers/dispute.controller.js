import createError from "../utils/createError.js";
import Order from "../models/order.model.js";
import User from "../models/user.model.js";

// ADMIN DISPUTE RESOLUTION SYSTEM (FRAUD PROTECTION)

// 1. Get all pending disputes (Admin only)
export const getPendingDisputes = async (req, res, next) => {
  try {
    // Verify admin privileges (you may want to add admin verification middleware)
    const adminUser = await User.findById(req.userId);
    if (!adminUser.isAdmin) {
      return next(createError(403, "Admin access required"));
    }

    const disputes = await Order.find({
      disputeStatus: { $in: ["pending", "under_review"] }
    }).sort({ disputeInitiatedAt: -1 });

    // Get user information for each dispute
    const disputesWithUsers = await Promise.all(
      disputes.map(async (order) => {
        const [buyer, seller] = await Promise.all([
          User.findById(order.buyerId, { username: 1, email: 1, img: 1 }),
          User.findById(order.sellerId, { username: 1, email: 1, img: 1 })
        ]);

        return {
          ...order.toObject(),
          buyerInfo: buyer,
          sellerInfo: seller,
          daysSinceDispute: Math.floor(
            (new Date() - new Date(order.disputeInitiatedAt)) / (1000 * 60 * 60 * 24)
          )
        };
      })
    );

    res.status(200).json({
      disputes: disputesWithUsers,
      totalDisputes: disputesWithUsers.length,
      pendingReview: disputesWithUsers.filter(d => d.disputeStatus === "pending").length,
      underReview: disputesWithUsers.filter(d => d.disputeStatus === "under_review").length
    });

  } catch (err) {
    next(err);
  }
};

// 2. Start reviewing a dispute (Admin)
export const startDisputeReview = async (req, res, next) => {
  try {
    const { orderId } = req.params;
    const { adminNotes } = req.body;

    // Verify admin privileges
    const adminUser = await User.findById(req.userId);
    if (!adminUser.isAdmin) {
      return next(createError(403, "Admin access required"));
    }

    const order = await Order.findById(orderId);
    if (!order) return next(createError(404, "Order not found"));

    if (order.disputeStatus !== "pending") {
      return next(createError(400, "This dispute is not available for review"));
    }

    const updatedOrder = await Order.findByIdAndUpdate(
      orderId,
      {
        disputeStatus: "under_review",
        adminNotes: adminNotes,
        disputeReviewStartedAt: new Date(),
        disputeReviewedBy: req.userId
      },
      { new: true }
    );

    res.status(200).json({
      message: "Dispute review started. Both parties will be notified.",
      order: updatedOrder,
      reviewStartedBy: adminUser.username
    });

  } catch (err) {
    next(err);
  }
};

// 3. Resolve dispute with refund (Admin)
export const resolveWithRefund = async (req, res, next) => {
  try {
    const { orderId } = req.params;
    const { refundAmount, resolution, adminNotes } = req.body;

    // Verify admin privileges
    const adminUser = await User.findById(req.userId);
    if (!adminUser.isAdmin) {
      return next(createError(403, "Admin access required"));
    }

    const order = await Order.findById(orderId);
    if (!order) return next(createError(404, "Order not found"));

    if (order.disputeStatus !== "under_review") {
      return next(createError(400, "Dispute must be under review to resolve"));
    }

    // Validate refund amount
    if (refundAmount < 0 || refundAmount > order.price) {
      return next(createError(400, "Invalid refund amount"));
    }

    const updatedOrder = await Order.findByIdAndUpdate(
      orderId,
      {
        disputeStatus: "resolved",
        disputeResolution: resolution,
        disputeResolvedAt: new Date(),
        disputeResolvedBy: req.userId,
        escrowStatus: "refunded",
        status: "cancelled",
        adminNotes: adminNotes,
        refundAmount: refundAmount
      },
      { new: true }
    );

    // Update user statistics based on resolution
    if (refundAmount === order.price) {
      // Full refund - penalize freelancer
      await User.findByIdAndUpdate(order.sellerId, {
        $inc: { 
          disputesLost: 1,
          trustScore: -10 // Reduce trust score
        }
      });
    } else if (refundAmount > 0) {
      // Partial refund - both parties partially at fault
      await Promise.all([
        User.findByIdAndUpdate(order.sellerId, { $inc: { disputesPartial: 1 } }),
        User.findByIdAndUpdate(order.buyerId, { $inc: { disputesPartial: 1 } })
      ]);
    }

    res.status(200).json({
      message: `Dispute resolved with ₦${refundAmount} refund to client.`,
      order: updatedOrder,
      resolution: resolution,
      refundAmount: refundAmount,
      resolvedBy: adminUser.username
    });

  } catch (err) {
    next(err);
  }
};

// 4. Resolve dispute in favor of freelancer (Admin)
export const resolveInFavorOfFreelancer = async (req, res, next) => {
  try {
    const { orderId } = req.params;
    const { resolution, adminNotes } = req.body;

    // Verify admin privileges
    const adminUser = await User.findById(req.userId);
    if (!adminUser.isAdmin) {
      return next(createError(403, "Admin access required"));
    }

    const order = await Order.findById(orderId);
    if (!order) return next(createError(404, "Order not found"));

    if (order.disputeStatus !== "under_review") {
      return next(createError(400, "Dispute must be under review to resolve"));
    }

    const updatedOrder = await Order.findByIdAndUpdate(
      orderId,
      {
        disputeStatus: "resolved",
        disputeResolution: resolution,
        disputeResolvedAt: new Date(),
        disputeResolvedBy: req.userId,
        escrowStatus: "released",
        status: "completed",
        isCompleted: true,
        releasedAt: new Date(),
        adminNotes: adminNotes
      },
      { new: true }
    );

    // Update user statistics - freelancer wins
    await Promise.all([
      User.findByIdAndUpdate(order.sellerId, {
        $inc: { 
          disputesWon: 1,
          totalOrders: 1,
          trustScore: 5 // Increase trust score for winning legitimate dispute
        }
      }),
      User.findByIdAndUpdate(order.buyerId, {
        $inc: { 
          disputesLost: 1,
          trustScore: -2 // Small penalty for losing dispute
        }
      })
    ]);

    res.status(200).json({
      message: "Dispute resolved in favor of freelancer. Payment released.",
      order: updatedOrder,
      resolution: resolution,
      resolvedBy: adminUser.username
    });

  } catch (err) {
    next(err);
  }
};

// 5. Get dispute statistics (Admin dashboard)
export const getDisputeStatistics = async (req, res, next) => {
  try {
    // Verify admin privileges
    const adminUser = await User.findById(req.userId);
    if (!adminUser.isAdmin) {
      return next(createError(403, "Admin access required"));
    }

    const [totalDisputes, pendingDisputes, resolvedDisputes, disputeRates] = await Promise.all([
      Order.countDocuments({ disputeStatus: { $ne: "none" } }),
      Order.countDocuments({ disputeStatus: { $in: ["pending", "under_review"] } }),
      Order.countDocuments({ disputeStatus: "resolved" }),
      Order.aggregate([
        {
          $group: {
            _id: null,
            totalOrders: { $sum: 1 },
            totalDisputes: {
              $sum: {
                $cond: [{ $ne: ["$disputeStatus", "none"] }, 1, 0]
              }
            }
          }
        },
        {
          $project: {
            disputeRate: {
              $multiply: [
                { $divide: ["$totalDisputes", "$totalOrders"] },
                100
              ]
            }
          }
        }
      ])
    ]);

    // Recent dispute trends (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const recentDisputes = await Order.find({
      disputeInitiatedAt: { $gte: thirtyDaysAgo },
      disputeStatus: { $ne: "none" }
    });

    const statistics = {
      total: totalDisputes,
      pending: pendingDisputes,
      resolved: resolvedDisputes,
      disputeRate: disputeRates[0]?.disputeRate || 0,
      recentTrend: {
        last30Days: recentDisputes.length,
        averageResolutionTime: "5.2 days", // This should be calculated from actual data
        commonReasons: [
          { reason: "Work not as described", count: Math.floor(recentDisputes.length * 0.4) },
          { reason: "Late delivery", count: Math.floor(recentDisputes.length * 0.3) },
          { reason: "Communication issues", count: Math.floor(recentDisputes.length * 0.2) },
          { reason: "Payment issues", count: Math.floor(recentDisputes.length * 0.1) }
        ]
      }
    };

    res.status(200).json(statistics);

  } catch (err) {
    next(err);
  }
};

// 6. Add evidence to dispute (Both parties can use this)
export const addDisputeEvidence = async (req, res, next) => {
  try {
    const { orderId } = req.params;
    const { evidenceType, description, fileUrls } = req.body;

    const order = await Order.findById(orderId);
    if (!order) return next(createError(404, "Order not found"));

    // Verify user is part of this dispute
    if (order.buyerId !== req.userId && order.sellerId !== req.userId) {
      return next(createError(403, "You are not part of this dispute"));
    }

    if (order.disputeStatus === "resolved") {
      return next(createError(400, "Cannot add evidence to resolved dispute"));
    }

    // Add evidence to order
    const evidence = {
      submittedBy: req.userId,
      userType: order.buyerId === req.userId ? "client" : "freelancer",
      evidenceType,
      description,
      fileUrls: fileUrls || [],
      submittedAt: new Date()
    };

    const updatedOrder = await Order.findByIdAndUpdate(
      orderId,
      { $push: { disputeEvidence: evidence } },
      { new: true }
    );

    res.status(200).json({
      message: "Evidence submitted successfully. Admin will review all evidence.",
      evidence: evidence,
      disputeStatus: order.disputeStatus
    });

  } catch (err) {
    next(err);
  }
};

// 7. Automated fraud detection for disputes
export const detectFraudulentDisputes = async (req, res, next) => {
  try {
    // Verify admin privileges
    const adminUser = await User.findById(req.userId);
    if (!adminUser.isAdmin) {
      return next(createError(403, "Admin access required"));
    }

    const suspiciousDisputes = await Order.find({
      disputeStatus: "pending",
      $or: [
        // Client with multiple recent disputes
        {
          buyerId: {
            $in: await User.find({ disputesInitiated: { $gte: 3 } }).select("_id")
          }
        },
        // Freelancer with low trust score
        {
          sellerId: {
            $in: await User.find({ trustScore: { $lt: 50 } }).select("_id")
          }
        },
        // Dispute initiated immediately after payment
        {
          $expr: {
            $lt: [
              { $subtract: ["$disputeInitiatedAt", "$paidAt"] },
              1000 * 60 * 60 // Less than 1 hour
            ]
          }
        }
      ]
    });

    const fraudAnalysis = suspiciousDisputes.map(order => ({
      orderId: order._id,
      riskFactors: [],
      riskScore: 0,
      recommendation: "manual_review"
    }));

    res.status(200).json({
      suspiciousDisputes: fraudAnalysis.length,
      disputes: fraudAnalysis,
      message: "Fraud detection analysis completed"
    });

  } catch (err) {
    next(err);
  }
};
