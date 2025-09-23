import Settings from "../models/settings.model.js";
import User from "../models/user.model.js";
import createError from "../utils/createError.js";

// Get user settings
export const getSettings = async (req, res, next) => {
  try {
    const userId = req.userId;
    
    let settings = await Settings.findOne({ userId }).populate('userId', 'username email img isSeller');
    
    // If no settings exist, create default settings
    if (!settings) {
      const user = await User.findById(userId);
      if (!user) {
        return next(createError(404, "User not found"));
      }
      
      settings = new Settings({
        userId,
        profile: {
          displayName: user.username,
          bio: user.desc || '',
        },
        seller: {
          isEnabled: user.isSeller || false,
        }
      });
      
      await settings.save();
      await settings.populate('userId', 'username email img isSeller');
    }
    
    res.status(200).json(settings);
  } catch (err) {
    next(err);
  }
};

// Update user settings
export const updateSettings = async (req, res, next) => {
  try {
    const userId = req.userId;
    const updateData = req.body;
    
    // Remove userId from update data to prevent modification
    delete updateData.userId;
    delete updateData._id;
    
    let settings = await Settings.findOne({ userId });
    
    if (!settings) {
      // Create new settings if none exist
      settings = new Settings({
        userId,
        ...updateData
      });
    } else {
      // Update existing settings using deep merge
      Object.keys(updateData).forEach(key => {
        if (typeof updateData[key] === 'object' && updateData[key] !== null && !Array.isArray(updateData[key])) {
          // Handle case where the key doesn't exist yet
          const existingValue = settings[key] ? settings[key].toObject() : {};
          settings[key] = { ...existingValue, ...updateData[key] };
        } else {
          settings[key] = updateData[key];
        }
      });
    }
    
    await settings.save();
    await settings.populate('userId', 'username email img isSeller');
    
    res.status(200).json(settings);
  } catch (err) {
    next(err);
  }
};

// Update profile section specifically
export const updateProfile = async (req, res, next) => {
  try {
    const userId = req.userId;
    const profileData = req.body;
    
    let settings = await Settings.findOne({ userId });
    
    if (!settings) {
      settings = new Settings({ userId });
    }
    
    settings.profile = { ...settings.profile.toObject(), ...profileData };
    await settings.save();
    await settings.populate('userId', 'username email img isSeller');
    
    res.status(200).json(settings);
  } catch (err) {
    next(err);
  }
};

// Update account section specifically
export const updateAccount = async (req, res, next) => {
  try {
    const userId = req.userId;
    const accountData = req.body;
    
    let settings = await Settings.findOne({ userId });
    
    if (!settings) {
      settings = new Settings({ userId });
    }
    
    settings.account = { ...settings.account.toObject(), ...accountData };
    await settings.save();
    await settings.populate('userId', 'username email img isSeller');
    
    res.status(200).json(settings);
  } catch (err) {
    next(err);
  }
};

// Update security section specifically
export const updateSecurity = async (req, res, next) => {
  try {
    const userId = req.userId;
    const securityData = req.body;
    
    let settings = await Settings.findOne({ userId });
    
    if (!settings) {
      settings = new Settings({ userId });
    }
    
    settings.security = { ...settings.security.toObject(), ...securityData };
    await settings.save();
    await settings.populate('userId', 'username email img isSeller');
    
    res.status(200).json(settings);
  } catch (err) {
    next(err);
  }
};

// Update notifications section specifically
export const updateNotifications = async (req, res, next) => {
  try {
    const userId = req.userId;
    const notificationData = req.body;
    
    let settings = await Settings.findOne({ userId });
    
    if (!settings) {
      settings = new Settings({ userId });
    }
    
    settings.notifications = { ...settings.notifications.toObject(), ...notificationData };
    await settings.save();
    await settings.populate('userId', 'username email img isSeller');
    
    res.status(200).json(settings);
  } catch (err) {
    next(err);
  }
};

// Update seller section specifically
export const updateSeller = async (req, res, next) => {
  try {
    const userId = req.userId;
    const sellerData = req.body;
    
    // Check if user is a seller
    const user = await User.findById(userId);
    if (!user.isSeller && sellerData.isEnabled) {
      return next(createError(403, "User must be a seller to enable seller settings"));
    }
    
    let settings = await Settings.findOne({ userId });
    
    if (!settings) {
      settings = new Settings({ userId });
    }
    
    settings.seller = { ...settings.seller.toObject(), ...sellerData };
    await settings.save();
    await settings.populate('userId', 'username email img isSeller');
    
    res.status(200).json(settings);
  } catch (err) {
    next(err);
  }
};

// Update bank details specifically
export const updateBankDetails = async (req, res, next) => {
  try {
    const userId = req.userId;
    const bankDetailsData = req.body;
    
    // Validate bank details
    if (!bankDetailsData.accountNumber || !bankDetailsData.bankName || !bankDetailsData.accountName) {
      return next(createError(400, "All bank details fields are required"));
    }
    
    // Validate account number format (10 digits)
    if (!/^\d{10}$/.test(bankDetailsData.accountNumber)) {
      return next(createError(400, "Account number must be exactly 10 digits"));
    }
    
    let settings = await Settings.findOne({ userId });
    
    if (!settings) {
      // Create new settings if none exist
      settings = new Settings({
        userId,
        bankDetails: bankDetailsData
      });
    } else {
      // Update bank details
      settings.bankDetails = bankDetailsData;
    }
    
    await settings.save();
    await settings.populate('userId', 'username email img isSeller');
    
    res.status(200).json(settings);
  } catch (err) {
    next(err);
  }
};

// Delete user settings (rarely used)
export const deleteSettings = async (req, res, next) => {
  try {
    const userId = req.userId;
    
    const settings = await Settings.findOne({ userId });
    if (!settings) {
      return next(createError(404, "Settings not found"));
    }
    
    await Settings.findByIdAndDelete(settings._id);
    res.status(200).json({ message: "Settings deleted successfully" });
  } catch (err) {
    next(err);
  }
};

// Add skill to profile
export const addSkill = async (req, res, next) => {
  try {
    const userId = req.userId;
    const { skill } = req.body;
    
    if (!skill || skill.trim() === '') {
      return next(createError(400, "Skill cannot be empty"));
    }
    
    let settings = await Settings.findOne({ userId });
    if (!settings) {
      settings = new Settings({ userId });
    }
    
    if (!settings.profile.skills.includes(skill.trim())) {
      settings.profile.skills.push(skill.trim());
      await settings.save();
    }
    
    res.status(200).json(settings.profile.skills);
  } catch (err) {
    next(err);
  }
};

// Remove skill from profile
export const removeSkill = async (req, res, next) => {
  try {
    const userId = req.userId;
    const { skill } = req.body;
    
    let settings = await Settings.findOne({ userId });
    if (!settings) {
      return next(createError(404, "Settings not found"));
    }
    
    settings.profile.skills = settings.profile.skills.filter(s => s !== skill);
    await settings.save();
    
    res.status(200).json(settings.profile.skills);
  } catch (err) {
    next(err);
  }
};
