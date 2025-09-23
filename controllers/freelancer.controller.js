import Order from "../models/order.model.js";
import Withdrawal from "../models/withdrawal.model.js";
import Review from "../models/review.model.js";
import User from "../models/user.model.js";
import Settings from "../models/settings.model.js";
import createError from "../utils/createError.js";

// Get comprehensive freelancer statistics
export const getFreelancerStats = async (req, res, next) => {
  try {
    const { freelancerId } = req.params;

    // Verify the user is accessing their own stats or is an admin
    if (req.userId !== freelancerId && !req.user?.isAdmin) {
      return next(createError(403, "You can only access your own statistics"));
    }

    // Get all completed orders for this freelancer
    const completedOrders = await Order.find({
      sellerId: freelancerId,
      escrowStatus: 'released'
    });

    // Get all orders for project count
    const allOrders = await Order.find({ sellerId: freelancerId });

    // Get pending withdrawals amount
    const pendingWithdrawals = await Withdrawal.find({
      freelancerId,
      status: { $in: ['pending', 'processing'] }
    });

    // Get total withdrawn amount
    const completedWithdrawals = await Withdrawal.find({
      freelancerId,
      status: 'completed'
    });

    // Get reviews for this freelancer
    const reviews = await Review.find({ sellerId: freelancerId });

    // Calculate statistics with 15% platform commission
    const totalGrossEarnings = completedOrders.reduce((sum, order) => sum + order.price, 0);
    const platformCommission = totalGrossEarnings * 0.15; // 15% platform commission
    const totalEarnings = totalGrossEarnings - platformCommission;
    const totalWithdrawn = completedWithdrawals.reduce((sum, withdrawal) => sum + withdrawal.amount, 0);
    const pendingWithdrawalAmount = pendingWithdrawals.reduce((sum, withdrawal) => sum + withdrawal.amount, 0);
    const availableBalance = totalEarnings - totalWithdrawn - pendingWithdrawalAmount;

    // This month earnings
    const thisMonthStart = new Date();
    thisMonthStart.setDate(1);
    thisMonthStart.setHours(0, 0, 0, 0);

    const thisMonthOrders = completedOrders.filter(order => 
      new Date(order.releasedAt || order.createdAt) >= thisMonthStart
    );
    const thisMonthGrossEarnings = thisMonthOrders.reduce((sum, order) => sum + order.price, 0);
    const thisMonthCommission = thisMonthGrossEarnings * 0.15;
    const thisMonthEarnings = thisMonthGrossEarnings - thisMonthCommission;

    // Project statistics
    const totalProjects = allOrders.length;
    const completedProjects = completedOrders.length;
    const inProgressProjects = allOrders.filter(order => 
      ['funded', 'work_submitted'].includes(order.escrowStatus)
    ).length;

    // Rating statistics
    const totalReviews = reviews.length;
    const averageRating = totalReviews > 0 
      ? reviews.reduce((sum, review) => sum + review.star, 0) / totalReviews 
      : 0;

    // Rating distribution
    const ratingDistribution = {
      5: reviews.filter(r => r.star === 5).length,
      4: reviews.filter(r => r.star === 4).length,
      3: reviews.filter(r => r.star === 3).length,
      2: reviews.filter(r => r.star === 2).length,
      1: reviews.filter(r => r.star === 1).length
    };

    // Monthly earnings for chart (last 6 months)
    const monthlyEarnings = [];
    for (let i = 5; i >= 0; i--) {
      const monthStart = new Date();
      monthStart.setMonth(monthStart.getMonth() - i);
      monthStart.setDate(1);
      monthStart.setHours(0, 0, 0, 0);

      const monthEnd = new Date(monthStart);
      monthEnd.setMonth(monthEnd.getMonth() + 1);

      const monthOrders = completedOrders.filter(order => {
        const releaseDate = new Date(order.releasedAt || order.createdAt);
        return releaseDate >= monthStart && releaseDate < monthEnd;
      });

      const monthGrossEarnings = monthOrders.reduce((sum, order) => sum + order.price, 0);
      const monthCommission = monthGrossEarnings * 0.15;
      const monthEarnings = monthGrossEarnings - monthCommission;

      monthlyEarnings.push({
        month: monthStart.toLocaleString('default', { month: 'short', year: 'numeric' }),
        earnings: monthEarnings,
        orders: monthOrders.length
      });
    }

    // Response success rate
    const responseSuccessRate = totalProjects > 0 ? (completedProjects / totalProjects) * 100 : 0;

    // Average project value (net after commission)
    const averageProjectValue = completedProjects > 0 ? totalEarnings / completedProjects : 0;

    const stats = {
      // Financial Stats
      totalEarnings,
      totalGrossEarnings,
      platformCommission,
      commissionRate: 15, // 15% commission rate
      availableBalance,
      thisMonthEarnings,
      totalWithdrawn,
      pendingWithdrawalAmount,
      averageProjectValue,

      // Project Stats
      totalProjects,
      completedProjects,
      inProgressProjects,
      responseSuccessRate,

      // Rating Stats
      averageRating,
      totalReviews,
      ratingDistribution,

      // Chart Data
      monthlyEarnings,

      // Performance Metrics
      completionRate: totalProjects > 0 ? (completedProjects / totalProjects) * 100 : 0,
      repeatClientRate: 0, // TODO: Calculate repeat clients
      
      // Recent Activity - get latest orders with client info
      recentOrders: await Promise.all(
        allOrders
          .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)) // Latest first
          .slice(0, 5)
          .map(async order => {
            // Get client username
            const client = await User.findById(order.buyerId).select('username');
            const netAmount = order.price - (order.price * 0.15); // After 15% commission
            
            return {
              id: order._id,
              title: order.title,
              amount: order.price,
              netAmount: netAmount,
              status: order.escrowStatus,
              clientUsername: client?.username || 'Unknown Client',
              createdAt: order.createdAt
            };
          })
      )
    };

    res.status(200).json(stats);

  } catch (err) {
    console.error("Error fetching freelancer stats:", err);
    next(createError(500, "Failed to fetch freelancer statistics"));
  }
};

// Create withdrawal request
export const createWithdrawal = async (req, res, next) => {
  try {
    const { freelancerId } = req.params;
    const { amount, bankDetails } = req.body;

    // Verify the user is creating withdrawal for their own account
    if (req.userId !== freelancerId) {
      return next(createError(403, "You can only create withdrawals for your own account"));
    }

    // Validate required fields
    if (!amount || amount <= 0) {
      return next(createError(400, "Valid withdrawal amount is required"));
    }

    if (amount < 1000) {
      return next(createError(400, "Minimum withdrawal amount is ₦1,000"));
    }

    // Get saved bank details from settings or use provided ones
    let finalBankDetails;
    
    // Check for saved bank details in settings
    const userSettings = await Settings.findOne({ userId: freelancerId });
    const savedBankDetails = userSettings?.bankDetails;
    
    if (savedBankDetails && savedBankDetails.accountNumber && savedBankDetails.bankName && savedBankDetails.accountName) {
      // Use saved bank details
      finalBankDetails = {
        accountNumber: savedBankDetails.accountNumber,
        bankName: savedBankDetails.bankName,
        accountName: savedBankDetails.accountName
      };
    } else if (bankDetails && bankDetails.accountNumber && bankDetails.bankName && bankDetails.accountName) {
      // Use provided bank details
      finalBankDetails = bankDetails;
    } else {
      return next(createError(400, "Bank details are required. Please provide bank details or save them in your profile settings."));
    }

    // Calculate available balance with 15% platform commission
    const completedOrders = await Order.find({
      sellerId: freelancerId,
      escrowStatus: 'released'
    });

    const completedWithdrawals = await Withdrawal.find({
      freelancerId,
      status: 'completed'
    });

    const pendingWithdrawals = await Withdrawal.find({
      freelancerId,
      status: { $in: ['pending', 'processing'] }
    });

    const totalGrossEarnings = completedOrders.reduce((sum, order) => sum + order.price, 0);
    const platformCommission = totalGrossEarnings * 0.15; // 15% platform commission
    const totalEarnings = totalGrossEarnings - platformCommission;
    const totalWithdrawn = completedWithdrawals.reduce((sum, withdrawal) => sum + withdrawal.amount, 0);
    const pendingWithdrawalAmount = pendingWithdrawals.reduce((sum, withdrawal) => sum + withdrawal.amount, 0);
    const availableBalance = totalEarnings - totalWithdrawn - pendingWithdrawalAmount;

    // Check if user has sufficient balance
    if (amount > availableBalance) {
      return next(createError(400, `Insufficient balance. Available: ₦${availableBalance.toLocaleString()}`));
    }

    // Create withdrawal request
    const withdrawal = new Withdrawal({
      freelancerId,
      amount,
      bankDetails: {
        accountNumber: finalBankDetails.accountNumber.trim(),
        bankName: finalBankDetails.bankName,
        accountName: finalBankDetails.accountName.trim()
      }
    });

    await withdrawal.save();

    res.status(201).json({
      message: "Withdrawal request submitted successfully",
      withdrawal: {
        id: withdrawal._id,
        amount: withdrawal.amount,
        processingFee: withdrawal.processingFee,
        netAmount: withdrawal.netAmount,
        status: withdrawal.status,
        transactionReference: withdrawal.transactionReference,
        requestedAt: withdrawal.requestedAt
      }
    });

  } catch (err) {
    console.error("Error creating withdrawal:", err);
    next(createError(500, "Failed to create withdrawal request"));
  }
};

// Get withdrawal history
export const getWithdrawals = async (req, res, next) => {
  try {
    const { freelancerId } = req.params;

    // Verify the user is accessing their own withdrawals or is an admin
    if (req.userId !== freelancerId && !req.user?.isAdmin) {
      return next(createError(403, "You can only access your own withdrawal history"));
    }

    const withdrawals = await Withdrawal.find({ freelancerId })
      .sort({ createdAt: -1 })
      .select('-paymentGatewayResponse'); // Exclude sensitive payment data

    res.status(200).json(withdrawals);

  } catch (err) {
    console.error("Error fetching withdrawals:", err);
    next(createError(500, "Failed to fetch withdrawal history"));
  }
};

// Update withdrawal status (admin only)
export const updateWithdrawalStatus = async (req, res, next) => {
  try {
    const { withdrawalId } = req.params;
    const { status, notes, transactionReference } = req.body;

    // Check if user is admin
    const user = await User.findById(req.userId);
    if (!user || !user.isAdmin) {
      return next(createError(403, "Only administrators can update withdrawal status"));
    }

    const validStatuses = ['pending', 'processing', 'completed', 'failed', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return next(createError(400, "Invalid withdrawal status"));
    }

    const updateData = {
      status,
      processedBy: req.userId
    };

    if (notes) updateData.notes = notes;
    if (transactionReference) updateData.transactionReference = transactionReference;

    if (['completed', 'failed'].includes(status)) {
      updateData.processedAt = new Date();
    }

    const withdrawal = await Withdrawal.findByIdAndUpdate(
      withdrawalId,
      updateData,
      { new: true }
    );

    if (!withdrawal) {
      return next(createError(404, "Withdrawal not found"));
    }

    res.status(200).json({
      message: `Withdrawal ${status} successfully`,
      withdrawal
    });

  } catch (err) {
    console.error("Error updating withdrawal status:", err);
    next(createError(500, "Failed to update withdrawal status"));
  }
};

