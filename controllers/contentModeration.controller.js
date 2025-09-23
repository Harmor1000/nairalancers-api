import createError from "../utils/createError.js";
import User from "../models/user.model.js";
import Message from "../models/message.model.js";
import contentFilterService from "../services/contentFilterService.js";

// Get content violation statistics for admin dashboard
export const getViolationStats = async (req, res, next) => {
  try {
    const { period = '30', limit = 100 } = req.query;
    const periodDays = parseInt(period);
    const limitNum = parseInt(limit);
    
    // Calculate date range
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - periodDays);
    
    // Get users with violations in the period
    const usersWithViolations = await User.find({
      'contentViolations.timestamp': { $gte: startDate }
    }).select('_id username email contentViolations createdAt');

    // Calculate statistics
    let totalViolations = 0;
    let severityStats = { low: 0, medium: 0, high: 0 };
    let actionStats = { none: 0, filter: 0, block: 0, warn: 0 };
    let userStats = [];

    usersWithViolations.forEach(user => {
      const recentViolations = user.contentViolations.filter(v => 
        new Date(v.timestamp) >= startDate
      );
      
      totalViolations += recentViolations.length;
      
      recentViolations.forEach(violation => {
        severityStats[violation.severity]++;
        actionStats[violation.action]++;
      });

      if (recentViolations.length > 0) {
        userStats.push({
          userId: user._id,
          username: user.username,
          email: user.email,
          violationCount: recentViolations.length,
          totalViolations: user.contentViolations.length,
          memberSince: user.createdAt,
          lastViolation: recentViolations[recentViolations.length - 1].timestamp,
          highestSeverity: recentViolations.reduce((max, v) => {
            const severityOrder = { low: 1, medium: 2, high: 3 };
            return severityOrder[v.severity] > severityOrder[max] ? v.severity : max;
          }, 'low')
        });
      }
    });

    // Sort by violation count
    userStats.sort((a, b) => b.violationCount - a.violationCount);
    userStats = userStats.slice(0, limitNum);

    res.status(200).json({
      period: periodDays,
      totalUsers: usersWithViolations.length,
      totalViolations,
      stats: {
        severity: severityStats,
        actions: actionStats
      },
      topViolators: userStats,
      summary: {
        averageViolationsPerUser: totalViolations / Math.max(usersWithViolations.length, 1),
        highRiskUsers: userStats.filter(u => u.highestSeverity === 'high' && u.violationCount > 3).length,
        blockedMessages: actionStats.block
      }
    });
  } catch (err) {
    next(err);
  }
};

// Get detailed violation history for a specific user
export const getUserViolationHistory = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const { limit = 50, offset = 0 } = req.query;
    
    const user = await User.findById(userId).select('username email contentViolations');
    if (!user) {
      return next(createError(404, "User not found"));
    }

    const violations = user.contentViolations
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(parseInt(offset), parseInt(offset) + parseInt(limit));

    // Get violation statistics for the user
    const stats = await contentFilterService.getUserViolationStats(userId);

    res.status(200).json({
      user: {
        id: user._id,
        username: user.username,
        email: user.email
      },
      violations,
      stats,
      pagination: {
        total: user.contentViolations.length,
        limit: parseInt(limit),
        offset: parseInt(offset),
        hasMore: (parseInt(offset) + parseInt(limit)) < user.contentViolations.length
      }
    });
  } catch (err) {
    next(err);
  }
};

// Get filtered messages statistics
export const getFilteredMessagesStats = async (req, res, next) => {
  try {
    const { period = '30' } = req.query;
    const periodDays = parseInt(period);
    
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - periodDays);

    const filteredMessages = await Message.find({
      isFiltered: true,
      'filteringDetails.filteredAt': { $gte: startDate }
    }).populate('userId', 'username email');

    const stats = {
      totalFiltered: filteredMessages.length,
      actionBreakdown: { filter: 0, warn: 0 },
      violationTypes: {},
      userBreakdown: {}
    };

    filteredMessages.forEach(message => {
      const action = message.filteringDetails.action;
      stats.actionBreakdown[action] = (stats.actionBreakdown[action] || 0) + 1;

      message.filteringDetails.violations.forEach(violation => {
        stats.violationTypes[violation.type] = (stats.violationTypes[violation.type] || 0) + 1;
      });

      const userId = message.userId._id.toString();
      if (!stats.userBreakdown[userId]) {
        stats.userBreakdown[userId] = {
          username: message.userId.username,
          email: message.userId.email,
          count: 0
        };
      }
      stats.userBreakdown[userId].count++;
    });

    res.status(200).json({
      period: periodDays,
      stats,
      topUsers: Object.entries(stats.userBreakdown)
        .sort(([,a], [,b]) => b.count - a.count)
        .slice(0, 10)
        .map(([userId, data]) => ({ userId, ...data }))
    });
  } catch (err) {
    next(err);
  }
};

// Update user's content filtering level
export const updateUserFilteringLevel = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const { level } = req.body;
    
    if (!['strict', 'standard', 'relaxed'].includes(level)) {
      return next(createError(400, "Invalid filtering level"));
    }

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { contentFilteringLevel: level },
      { new: true }
    ).select('_id username contentFilteringLevel');

    if (!updatedUser) {
      return next(createError(404, "User not found"));
    }

    // Log the admin action
    console.log(`[ADMIN ACTION] ${req.userId} updated filtering level for user ${userId} to ${level}`);

    res.status(200).json({
      message: "User filtering level updated successfully",
      user: updatedUser
    });
  } catch (err) {
    next(err);
  }
};

// Clear user's violation history (admin action)
export const clearUserViolations = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const { reason } = req.body;
    
    const user = await User.findById(userId);
    if (!user) {
      return next(createError(404, "User not found"));
    }

    const violationCount = user.contentViolations.length;
    
    // Clear violations
    await User.findByIdAndUpdate(userId, {
      $set: { contentViolations: [] }
    });

    // Log the admin action
    console.log(`[ADMIN ACTION] ${req.userId} cleared ${violationCount} violations for user ${userId}. Reason: ${reason}`);

    res.status(200).json({
      message: `Cleared ${violationCount} violations for user`,
      clearedCount: violationCount
    });
  } catch (err) {
    next(err);
  }
};

// Get content filtering patterns and settings (for admin configuration)
export const getFilteringConfig = async (req, res, next) => {
  try {
    // This would typically come from a database configuration
    const config = {
      strictMode: {
        description: "Blocks messages with any detected contact info",
        blockThreshold: "low",
        allowedExceptions: []
      },
      standardMode: {
        description: "Filters out contact info but allows messages through",
        blockThreshold: "high",
        warningThreshold: "medium"
      },
      relaxedMode: {
        description: "Only warns about potential contact info",
        blockThreshold: "none",
        warningThreshold: "high"
      },
      detectionPatterns: {
        email: "Email addresses",
        phone: "Phone numbers",
        social: "Social media handles",
        url: "External URLs",
        messaging: "External messaging platforms",
        obfuscated: "Obfuscated contact attempts"
      }
    };

    res.status(200).json(config);
  } catch (err) {
    next(err);
  }
};

// Test content filtering (for admin testing)
export const testContentFilter = async (req, res, next) => {
  try {
    const { content, userId = req.userId } = req.body;
    
    if (!content) {
      return next(createError(400, "Content is required for testing"));
    }

    const result = await contentFilterService.filterContent(content, userId, { 
      strictMode: false 
    });

    res.status(200).json({
      originalContent: content,
      result: {
        isAllowed: result.isAllowed,
        filteredContent: result.filteredContent,
        violations: result.violations,
        severity: result.severity,
        action: result.action,
        warning: result.warning
      },
      testMode: true
    });
  } catch (err) {
    next(err);
  }
};

