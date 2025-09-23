import createError from "../utils/createError.js";
import User from "../models/user.model.js";
import AdminLog from "../models/adminLog.model.js";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

// Admin-specific authentication and session management

// Admin Login with enhanced security
export const adminLogin = async (req, res, next) => {
  try {
    const { email, password, remember } = req.body;
    
    // Find user and verify admin status
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      await AdminLog.create({
        adminId: 'unknown',
        adminUsername: email,
        action: 'failed_login_attempt',
        targetType: 'auth',
        details: { reason: 'User not found', email },
        success: false,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        severity: 'medium'
      });
      return next(createError(401, "Invalid credentials"));
    }

    // Check if user is admin
    if (!user.isAdmin) {
      await AdminLog.create({
        adminId: user._id,
        adminUsername: user.username,
        action: 'failed_login_attempt',
        targetType: 'auth',
        details: { reason: 'Non-admin attempted admin login', email },
        success: false,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        severity: 'high'
      });
      return next(createError(403, "Admin access required"));
    }

    // Verify password
    const isCorrect = bcrypt.compareSync(password, user.password);
    if (!isCorrect) {
      await AdminLog.create({
        adminId: user._id,
        adminUsername: user.username,
        action: 'failed_login_attempt',
        targetType: 'auth',
        details: { reason: 'Incorrect password', email },
        success: false,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        severity: 'medium'
      });
      return next(createError(401, "Invalid credentials"));
    }

    // Check if account is suspended
    if (user.isBlacklisted) {
      return next(createError(403, "Account suspended"));
    }

    // Generate JWT with extended expiry for admin sessions
    const tokenExpiry = remember ? "30d" : "24h";
    const token = jwt.sign(
      { 
        id: user._id, 
        isSeller: user.isSeller,
        isAdmin: true,
        adminRole: 'admin' // Could be extended to support different admin roles
      },
      process.env.JWT_KEY,
      { expiresIn: tokenExpiry }
    );

    // Update last login
    await User.findByIdAndUpdate(user._id, {
      lastSeen: new Date()
    });

    // Log successful login
    await AdminLog.create({
      adminId: user._id,
      adminUsername: user.username,
      action: 'login',
      targetType: 'auth',
      details: { loginMethod: 'password', remember },
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      severity: 'low'
    });

    const { password: pass, ...userData } = user._doc;

    const isProd = process.env.NODE_ENV === "production";
    const cookieOptions = {
      httpOnly: true,
      secure: isProd,
      sameSite: isProd ? "none" : "lax",
      maxAge: remember ? 30 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000
    };
    if (process.env.COOKIE_DOMAIN) cookieOptions.domain = process.env.COOKIE_DOMAIN;
    res
      .cookie("accessToken", token, cookieOptions)
      .status(200)
      .json({
        message: "Admin login successful",
        admin: userData,
        token,
        sessionExpiry: remember ? "30 days" : "24 hours"
      });

  } catch (err) {
    next(err);
  }
};

// Admin Logout with session cleanup
export const adminLogout = async (req, res, next) => {
  try {
    const adminUser = await User.findById(req.userId);
    
    // Log logout
    await AdminLog.create({
      adminId: req.userId,
      adminUsername: adminUser?.username || 'unknown',
      action: 'logout',
      targetType: 'auth',
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      severity: 'low'
    });

    const isProd2 = process.env.NODE_ENV === "production";
    const clearOptions = {
      httpOnly: true,
      secure: isProd2,
      sameSite: isProd2 ? "none" : "lax"
    };
    if (process.env.COOKIE_DOMAIN) clearOptions.domain = process.env.COOKIE_DOMAIN;
    res
      .clearCookie("accessToken", clearOptions)
      .status(200)
      .json({ message: "Admin logout successful" });

  } catch (err) {
    next(err);
  }
};

// Get current admin session info
export const getAdminSession = async (req, res, next) => {
  try {
    const admin = await User.findById(req.userId)
      .select('-password')
      .lean();

    if (!admin || !admin.isAdmin) {
      return next(createError(403, "Admin access required"));
    }

    // Get recent admin activity
    const recentActivity = await AdminLog.find({ adminId: req.userId })
      .sort({ createdAt: -1 })
      .limit(10)
      .select('action targetType createdAt details');

    res.status(200).json({
      admin,
      session: {
        loginTime: admin.lastSeen,
        recentActivity,
        permissions: ['all'] // Could be expanded for role-based permissions
      }
    });

  } catch (err) {
    next(err);
  }
};

// Admin role and permission management
export const updateAdminRole = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const { role, permissions } = req.body;

    // Only super admins can change roles
    const requestingAdmin = await User.findById(req.userId);
    if (!requestingAdmin.isAdmin) {
      return next(createError(403, "Super admin access required"));
    }

    const targetUser = await User.findById(userId);
    if (!targetUser) {
      return next(createError(404, "User not found"));
    }

    // Prevent removing last admin
    if (!role || role !== 'admin') {
      const adminCount = await User.countDocuments({ isAdmin: true });
      if (adminCount <= 1) {
        return next(createError(400, "Cannot remove the last admin"));
      }
    }

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      {
        isAdmin: role === 'admin',
        adminRole: role,
        adminPermissions: permissions || ['all']
      },
      { new: true }
    ).select('-password');

    // Log role change
    await AdminLog.create({
      adminId: req.userId,
      adminUsername: requestingAdmin.username,
      action: role === 'admin' ? 'admin_created' : 'admin_removed',
      targetType: 'user',
      targetId: userId,
      targetName: `${targetUser.firstname} ${targetUser.lastname}`,
      details: { 
        oldRole: targetUser.isAdmin ? 'admin' : 'user',
        newRole: role,
        permissions,
        severity: 'critical'
      },
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      severity: 'critical'
    });

    res.status(200).json({
      message: `User ${role === 'admin' ? 'promoted to' : 'removed from'} admin`,
      user: updatedUser
    });

  } catch (err) {
    next(err);
  }
};

// Get all admin users
export const getAllAdmins = async (req, res, next) => {
  try {
    const admins = await User.find({ isAdmin: true })
      .select('-password')
      .sort({ createdAt: -1 });

    // Get recent activity for each admin
    const adminsWithActivity = await Promise.all(
      admins.map(async (admin) => {
        const recentActions = await AdminLog.countDocuments({
          adminId: admin._id,
          createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } // Last 7 days
        });

        return {
          ...admin.toObject(),
          weeklyActions: recentActions
        };
      })
    );

    res.status(200).json({
      admins: adminsWithActivity,
      totalAdmins: admins.length
    });

  } catch (err) {
    next(err);
  }
};

// Admin session validation (middleware helper)
export const validateAdminSession = async (req, res, next) => {
  try {
    const admin = await User.findById(req.userId);
    
    if (!admin || !admin.isAdmin) {
      return next(createError(403, "Admin session invalid"));
    }

    if (admin.isBlacklisted) {
      return next(createError(403, "Admin account suspended"));
    }

    // Update last seen
    await User.findByIdAndUpdate(req.userId, { lastSeen: new Date() });

    next();
  } catch (err) {
    next(err);
  }
};

