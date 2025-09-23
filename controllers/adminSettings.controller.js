import createError from "../utils/createError.js";
import User from "../models/user.model.js";
import PlatformSettings from "../models/platformSettings.model.js";
import AdminLog from "../models/adminLog.model.js";

// Get current platform settings
export const getPlatformSettings = async (req, res, next) => {
  try {
    let settings = await PlatformSettings.findOne();
    
    // Create default settings if none exist
    if (!settings) {
      settings = new PlatformSettings();
      await settings.save();
    }

    res.status(200).json({
      settings,
      lastUpdated: settings.updatedAt,
      lastUpdatedBy: settings.lastUpdatedByName
    });

  } catch (err) {
    next(err);
  }
};

// Update platform settings
export const updatePlatformSettings = async (req, res, next) => {
  try {
    const { section, settings: newSettings, reason } = req.body;
    
    const admin = await User.findById(req.userId);
    let currentSettings = await PlatformSettings.findOne();
    
    if (!currentSettings) {
      currentSettings = new PlatformSettings();
    }

    // Store old values for audit
    const oldValues = currentSettings.toObject();

    // Update specific section or entire settings
    if (section) {
      currentSettings[section] = { ...currentSettings[section], ...newSettings };
    } else {
      // Merge new settings with existing ones
      Object.keys(newSettings).forEach(key => {
        if (typeof newSettings[key] === 'object' && !Array.isArray(newSettings[key])) {
          currentSettings[key] = { ...currentSettings[key], ...newSettings[key] };
        } else {
          currentSettings[key] = newSettings[key];
        }
      });
    }

    // Update metadata
    currentSettings.lastUpdatedBy = req.userId;
    currentSettings.lastUpdatedByName = `${admin.firstname} ${admin.lastname}`;
    currentSettings.updateReason = reason || 'Settings update';

    await currentSettings.save();

    // Log the change
    await AdminLog.create({
      adminId: req.userId,
      adminUsername: admin.username,
      action: 'system_settings_changed',
      targetType: 'system',
      targetName: section ? `${section} settings` : 'Platform settings',
      details: {
        section: section || 'multiple',
        reason,
        severity: 'high'
      },
      oldValues: section ? oldValues[section] : oldValues,
      newValues: section ? currentSettings[section] : newSettings,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      severity: 'high'
    });

    res.status(200).json({
      message: "Settings updated successfully",
      settings: currentSettings,
      updatedSection: section || 'all'
    });

  } catch (err) {
    next(err);
  }
};

// Update fee structure
export const updateFeeStructure = async (req, res, next) => {
  try {
    const { serviceFee, paymentProcessingFee, withdrawalFee, reason } = req.body;
    
    const admin = await User.findById(req.userId);
    let settings = await PlatformSettings.findOne();
    
    if (!settings) {
      settings = new PlatformSettings();
    }

    const oldFees = { ...settings.fees };

    // Update fee structure
    if (serviceFee) {
      settings.fees.serviceFee = { ...settings.fees.serviceFee, ...serviceFee };
    }
    if (paymentProcessingFee) {
      settings.fees.paymentProcessingFee = { ...settings.fees.paymentProcessingFee, ...paymentProcessingFee };
    }
    if (withdrawalFee) {
      settings.fees.withdrawalFee = { ...settings.fees.withdrawalFee, ...withdrawalFee };
    }

    settings.lastUpdatedBy = req.userId;
    settings.lastUpdatedByName = `${admin.firstname} ${admin.lastname}`;
    settings.updateReason = reason || 'Fee structure update';

    await settings.save();

    // Log fee changes (critical action)
    await AdminLog.create({
      adminId: req.userId,
      adminUsername: admin.username,
      action: 'system_settings_changed',
      targetType: 'system',
      targetName: 'Fee structure',
      details: {
        section: 'fees',
        reason,
        severity: 'critical'
      },
      oldValues: oldFees,
      newValues: settings.fees,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      severity: 'critical'
    });

    res.status(200).json({
      message: "Fee structure updated successfully",
      fees: settings.fees
    });

  } catch (err) {
    next(err);
  }
};

// Update transaction limits
export const updateTransactionLimits = async (req, res, next) => {
  try {
    const { limits, reason } = req.body;
    
    const admin = await User.findById(req.userId);
    let settings = await PlatformSettings.findOne();
    
    if (!settings) {
      settings = new PlatformSettings();
    }

    const oldLimits = { ...settings.limits };
    settings.limits = { ...settings.limits, ...limits };
    
    settings.lastUpdatedBy = req.userId;
    settings.lastUpdatedByName = `${admin.firstname} ${admin.lastname}`;
    settings.updateReason = reason || 'Transaction limits update';

    await settings.save();

    await AdminLog.create({
      adminId: req.userId,
      adminUsername: admin.username,
      action: 'system_settings_changed',
      targetType: 'system',
      targetName: 'Transaction limits',
      details: {
        section: 'limits',
        reason,
        severity: 'high'
      },
      oldValues: oldLimits,
      newValues: settings.limits,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      severity: 'high'
    });

    res.status(200).json({
      message: "Transaction limits updated successfully",
      limits: settings.limits
    });

  } catch (err) {
    next(err);
  }
};

// Toggle maintenance mode
export const toggleMaintenanceMode = async (req, res, next) => {
  try {
    const { enabled, message, estimatedDuration, allowedIPs } = req.body;
    
    const admin = await User.findById(req.userId);
    let settings = await PlatformSettings.findOne();
    
    if (!settings) {
      settings = new PlatformSettings();
    }

    const oldMaintenanceSettings = { ...settings.maintenance };

    settings.maintenance.maintenanceMode = enabled;
    if (message) settings.maintenance.maintenanceMessage = message;
    if (estimatedDuration) settings.maintenance.estimatedDuration = estimatedDuration;
    if (allowedIPs) settings.maintenance.allowedIPs = allowedIPs;

    settings.lastUpdatedBy = req.userId;
    settings.lastUpdatedByName = `${admin.firstname} ${admin.lastname}`;
    
    await settings.save();

    // Log maintenance mode change (critical action)
    await AdminLog.create({
      adminId: req.userId,
      adminUsername: admin.username,
      action: 'system_settings_changed',
      targetType: 'system',
      targetName: `Maintenance mode ${enabled ? 'enabled' : 'disabled'}`,
      details: {
        section: 'maintenance',
        maintenanceEnabled: enabled,
        severity: 'critical'
      },
      oldValues: oldMaintenanceSettings,
      newValues: settings.maintenance,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      severity: 'critical'
    });

    res.status(200).json({
      message: `Maintenance mode ${enabled ? 'enabled' : 'disabled'} successfully`,
      maintenance: settings.maintenance
    });

  } catch (err) {
    next(err);
  }
};

// Update verification requirements
export const updateVerificationRequirements = async (req, res, next) => {
  try {
    const { requirements, limits, reason } = req.body;
    
    const admin = await User.findById(req.userId);
    let settings = await PlatformSettings.findOne();
    
    if (!settings) {
      settings = new PlatformSettings();
    }

    const oldVerification = { ...settings.verification };

    if (requirements) {
      Object.keys(requirements).forEach(key => {
        settings.verification[key] = requirements[key];
      });
    }

    if (limits) {
      Object.keys(limits).forEach(level => {
        if (settings.verification.verificationLimits[level]) {
          settings.verification.verificationLimits[level] = {
            ...settings.verification.verificationLimits[level],
            ...limits[level]
          };
        }
      });
    }

    settings.lastUpdatedBy = req.userId;
    settings.lastUpdatedByName = `${admin.firstname} ${admin.lastname}`;
    settings.updateReason = reason || 'Verification requirements update';

    await settings.save();

    await AdminLog.create({
      adminId: req.userId,
      adminUsername: admin.username,
      action: 'system_settings_changed',
      targetType: 'system',
      targetName: 'Verification requirements',
      details: {
        section: 'verification',
        reason,
        severity: 'high'
      },
      oldValues: oldVerification,
      newValues: settings.verification,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      severity: 'high'
    });

    res.status(200).json({
      message: "Verification requirements updated successfully",
      verification: settings.verification
    });

  } catch (err) {
    next(err);
  }
};

// Update feature flags
export const updateFeatureFlags = async (req, res, next) => {
  try {
    const { features, reason } = req.body;
    
    const admin = await User.findById(req.userId);
    let settings = await PlatformSettings.findOne();
    
    if (!settings) {
      settings = new PlatformSettings();
    }

    const oldFeatures = { ...settings.features };
    settings.features = { ...settings.features, ...features };
    
    settings.lastUpdatedBy = req.userId;
    settings.lastUpdatedByName = `${admin.firstname} ${admin.lastname}`;
    settings.updateReason = reason || 'Feature flags update';

    await settings.save();

    await AdminLog.create({
      adminId: req.userId,
      adminUsername: admin.username,
      action: 'system_settings_changed',
      targetType: 'system',
      targetName: 'Feature flags',
      details: {
        section: 'features',
        reason,
        changedFeatures: Object.keys(features),
        severity: 'medium'
      },
      oldValues: oldFeatures,
      newValues: settings.features,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      severity: 'medium'
    });

    res.status(200).json({
      message: "Feature flags updated successfully",
      features: settings.features
    });

  } catch (err) {
    next(err);
  }
};

// Get settings history/audit trail
export const getSettingsHistory = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const section = req.query.section;

    let filter = {
      action: 'system_settings_changed',
      targetType: 'system'
    };

    if (section) {
      filter['details.section'] = section;
    }

    const skip = (page - 1) * limit;

    const [history, total] = await Promise.all([
      AdminLog.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .select('adminUsername targetName details oldValues newValues createdAt ipAddress'),
      AdminLog.countDocuments(filter)
    ]);

    const totalPages = Math.ceil(total / limit);

    res.status(200).json({
      history,
      pagination: {
        currentPage: page,
        totalPages,
        total,
        limit,
        hasNext: page < totalPages,
        hasPrev: page > 1
      }
    });

  } catch (err) {
    next(err);
  }
};

// Reset settings to default
export const resetSettingsToDefault = async (req, res, next) => {
  try {
    const { section, confirmReset, reason } = req.body;

    if (!confirmReset) {
      return next(createError(400, "Please confirm reset action"));
    }

    const admin = await User.findById(req.userId);
    let settings = await PlatformSettings.findOne();
    
    if (!settings) {
      return next(createError(404, "No settings found to reset"));
    }

    const oldSettings = settings.toObject();

    if (section) {
      // Reset specific section
      const defaultSettings = new PlatformSettings();
      settings[section] = defaultSettings[section];
    } else {
      // Reset entire settings
      const newDefaults = new PlatformSettings();
      settings = newDefaults;
      settings._id = oldSettings._id;
    }

    settings.lastUpdatedBy = req.userId;
    settings.lastUpdatedByName = `${admin.firstname} ${admin.lastname}`;
    settings.updateReason = reason || `Reset ${section || 'all settings'} to default`;

    await settings.save();

    // Log critical reset action
    await AdminLog.create({
      adminId: req.userId,
      adminUsername: admin.username,
      action: 'system_settings_changed',
      targetType: 'system',
      targetName: `Settings reset: ${section || 'all'}`,
      details: {
        section: section || 'all',
        action: 'reset_to_default',
        reason,
        severity: 'critical'
      },
      oldValues: section ? oldSettings[section] : oldSettings,
      newValues: section ? settings[section] : settings.toObject(),
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      severity: 'critical'
    });

    res.status(200).json({
      message: `${section || 'All settings'} reset to default successfully`,
      settings: settings
    });

  } catch (err) {
    next(err);
  }
};

// Validate settings before applying
export const validateSettings = async (req, res, next) => {
  try {
    const { settings } = req.body;
    const errors = [];
    const warnings = [];

    // Validate fee structure
    if (settings.fees) {
      if (settings.fees.serviceFee?.percentage > 20) {
        warnings.push("Service fee above 20% may discourage users");
      }
      if (settings.fees.serviceFee?.percentage < 1) {
        warnings.push("Service fee below 1% may not cover operational costs");
      }
      if (settings.fees.withdrawalFee?.percentage > 10) {
        errors.push("Withdrawal fee cannot exceed 10%");
      }
    }

    // Validate limits
    if (settings.limits) {
      if (settings.limits.minimumOrder > settings.limits.maximumOrder) {
        errors.push("Minimum order cannot be greater than maximum order");
      }
      if (settings.limits.minimumWithdrawal > settings.limits.maximumWithdrawal) {
        errors.push("Minimum withdrawal cannot be greater than maximum withdrawal");
      }
    }

    // Validate verification limits
    if (settings.verification?.verificationLimits) {
      const levels = ['unverified', 'emailVerified', 'phoneVerified', 'idVerified', 'enhanced'];
      for (let i = 0; i < levels.length - 1; i++) {
        const current = settings.verification.verificationLimits[levels[i]];
        const next = settings.verification.verificationLimits[levels[i + 1]];
        
        if (current && next) {
          if (current.orderLimit > next.orderLimit && next.orderLimit !== -1) {
            warnings.push(`${levels[i]} order limit should not exceed ${levels[i + 1]} limit`);
          }
        }
      }
    }

    res.status(200).json({
      valid: errors.length === 0,
      errors,
      warnings,
      recommendation: errors.length === 0 ? "Settings validation passed" : "Please fix errors before applying"
    });

  } catch (err) {
    next(err);
  }
};

