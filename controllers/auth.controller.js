import User from "../models/user.model.js";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import createError from "../utils/createError.js";
import crypto from "crypto";
import { sendPasswordResetEmail as sendSESPasswordResetEmail } from "../services/emailService.js";

export const register = async (req, res, next) => {
  try {
    const { firstname, lastname, username, email, password, isSeller, img, state, phone, desc } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({ $or: [{ email }, { username }] });
    // if (existingUser) return next(createError(400, "Email or username already taken"));
    if (existingUser) {
      let field = existingUser.email === email ? "email" : "username";
      return res.status(400).json({
        field,
        message: `This ${field} is already taken`
      });
    }

    // Hash password
    const hash = bcrypt.hashSync(password, 10);

    // Create new user
    const newUser = new User({
      firstname,
      lastname,
      username,
      email,
      password: hash,
      isSeller: isSeller || false,
      img,
      state,
      phone,
      desc
    });

    const savedUser = await newUser.save();

    // Generate JWT
    const token = jwt.sign(
      { id: savedUser._id, isSeller: savedUser.isSeller },
      process.env.JWT_KEY,
      { expiresIn: "7d" }
    );

    // Remove password from response
    const { password: pass, ...userData } = savedUser._doc;

    // Send token + user info (cross-site cookie support for Netlify -> API)
    const isProd = process.env.NODE_ENV === "production";
    const cookieOptions = {
      httpOnly: true,
      sameSite: isProd ? "none" : "lax",
      secure: isProd,
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    };
    if (process.env.COOKIE_DOMAIN) cookieOptions.domain = process.env.COOKIE_DOMAIN;
    res
      .cookie("accessToken", token, cookieOptions)
      .status(201)
      .json(userData);
  } catch (err) {
    next(err);
  }
};
export const login = async (req,res, next)=>{
    
    try {
        const { username, password } = req.body;
        
        // Check if input is email or username
        const isEmail = username && username.includes('@');
        
        // Find user by email or username (case insensitive)
        const user = await User.findOne(
            isEmail 
                ? { email: username.toLowerCase() } 
                : { username: { $regex: new RegExp(`^${username}$`, 'i') } }
        );
      
        if(!user) return next(createError(404, "User not found!"));

        const isCorrect = bcrypt.compareSync(password, user.password);
        if(!isCorrect) 
        return next(createError(400, "Wrong password or email/username!"))

        const token = jwt.sign(
            {
            id: user._id, 
            isSeller: user.isSeller,
        },
        process.env.JWT_KEY
        );

        const {password: pass, ...info} = user._doc;
        const isProd = process.env.NODE_ENV === "production";
        const cookieOptions = {
          httpOnly: true,
          sameSite: isProd ? "none" : "lax",
          secure: isProd,
          maxAge: 7 * 24 * 60 * 60 * 1000
        };
        if (process.env.COOKIE_DOMAIN) cookieOptions.domain = process.env.COOKIE_DOMAIN;
        res
          .cookie("accessToken", token, cookieOptions)
          .status(200)
          .send({token, ...info});

    } catch (err) {
        next(err);
        // res.status(500).send("something went wrong")
    }
}
export const logout = async (req,res)=>{
    const isProd = process.env.NODE_ENV === "production";
    const clearOptions = {
      httpOnly: true,
      sameSite: isProd ? "none" : "lax",
      secure: isProd,
    };
    if (process.env.COOKIE_DOMAIN) clearOptions.domain = process.env.COOKIE_DOMAIN;
    res.clearCookie("accessToken", clearOptions)
      .status(200)
      .send("User has been logged out.");
};

// Change password function
export const changePassword = async (req, res, next) => {
    try {
        const { currentPassword, newPassword } = req.body;
        const userId = req.userId;

        if (!currentPassword || !newPassword) {
            return next(createError(400, "Current password and new password are required"));
        }

        if (newPassword.length < 6) {
            return next(createError(400, "New password must be at least 6 characters long"));
        }

        // Find user
        const user = await User.findById(userId);
        if (!user) {
            return next(createError(404, "User not found"));
        }

        // Check if user is a Google user (doesn't have a regular password)
        if (user.isGoogleUser) {
            return next(createError(400, "Google users cannot change password. Please use Google account settings."));
        }

        // Verify current password
        const isCurrentPasswordCorrect = bcrypt.compareSync(currentPassword, user.password);
        if (!isCurrentPasswordCorrect) {
            return next(createError(400, "Current password is incorrect"));
        }

        // Check if new password is different from current
        const isSamePassword = bcrypt.compareSync(newPassword, user.password);
        if (isSamePassword) {
            return next(createError(400, "New password must be different from current password"));
        }

        // Hash new password
        const newPasswordHash = bcrypt.hashSync(newPassword, 10);

        // Update password and last password change date
        await User.findByIdAndUpdate(userId, {
            password: newPasswordHash
        });

        // Update settings if they exist
        try {
            const Settings = (await import("../models/settings.model.js")).default;
            await Settings.findOneAndUpdate(
                { userId },
                { 
                    $set: { 
                        "security.lastPasswordChange": new Date() 
                    } 
                },
                { upsert: true }
            );
        } catch (settingsError) {
            console.warn("Could not update settings:", settingsError.message);
        }

        res.status(200).json({ 
            message: "Password changed successfully",
            lastPasswordChange: new Date()
        });
    } catch (err) {
        next(err);
    }
};



// Add this to your auth.controller.js

import dotenv from "dotenv";
dotenv.config();

import admin from 'firebase-admin';

// Initialize Firebase Admin SDK (add this at the top of your controller)
// You'll need to download the service account key from Firebase Console
// and add it to your project
const serviceAccount = {
  // Your Firebase service account key JSON
  type: "service_account",
  project_id: process.env.FIREBASE_PROJECT_ID,
  private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
  private_key: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  client_email: process.env.FIREBASE_CLIENT_EMAIL,
  client_id: process.env.FIREBASE_CLIENT_ID,
  auth_uri: "https://accounts.google.com/o/oauth2/auth",
  token_uri: "https://oauth2.googleapis.com/token",
  auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
  client_x509_cert_url: process.env.FIREBASE_CLIENT_CERT_URL
};

// Initialize Firebase Admin (only if not already initialized)
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

// Google Sign-in endpoint - FIXED VERSION
export const googleAuth = async (req, res, next) => {
  try {
    const { idToken, role } = req.body;

    // Verify the Firebase ID token
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    const { email, name, picture, uid } = decodedToken;

    console.log('Decoded token:', { email, name, picture, uid }); // Debug log

    // Check if user already exists
    let existingUser = await User.findOne({ email });

    if (existingUser) {
      // User exists, log them in
      const token = jwt.sign(
        { id: existingUser._id, isSeller: existingUser.isSeller },
        process.env.JWT_KEY,
        { expiresIn: "7d" }
      );

      const { password: pass, ...userData } = existingUser._doc;

      const isProd = process.env.NODE_ENV === "production";
      const cookieOptions = {
        httpOnly: true,
        sameSite: isProd ? "none" : "lax",
        secure: isProd,
        maxAge: 7 * 24 * 60 * 60 * 1000
      };
      if (process.env.COOKIE_DOMAIN) cookieOptions.domain = process.env.COOKIE_DOMAIN;
      return res
        .cookie("accessToken", token, cookieOptions)
        .status(200)
        .json({ token, ...userData });
    }

    // User doesn't exist, create new user
    const nameParts = name ? name.split(' ') : ['User'];
    const firstname = nameParts[0] || 'User';
    const lastname = nameParts.slice(1).join(' ') || '';
    
    // Generate username from email
    const baseUsername = email.split('@')[0];
    let username = baseUsername;
    let counter = 1;
    
    // Ensure username is unique
    while (await User.findOne({ username })) {
      username = `${baseUsername}${counter}`;
      counter++;
    }

    console.log('Creating new user with:', { // Debug log
      firstname,
      lastname,
      username,
      email,
      isSeller: role === "freelancer",
      img: picture,
    });

    // Create user object with proper password handling
    const userData = {
      firstname,
      lastname,
      username,
      email,
      isSeller: role === "freelancer" || false,
      img: picture || "",
      state: "", // Provide default values for required fields
      phone: "",
      desc: "",
    };

    // Only add googleId and isGoogleUser if they exist in your User model
    // Check your User model schema and uncomment these if they exist:
    // userData.googleId = uid;
    // userData.isGoogleUser = true;

    // Generate a random password hash for Google users (they won't use it)
    const randomPassword = Math.random().toString(36).substring(2, 15);
    userData.password = bcrypt.hashSync(randomPassword, 10);

    const newUser = new User(userData);

    console.log('About to save user:', newUser); // Debug log

    const savedUser = await newUser.save();
    
    console.log('User saved successfully:', savedUser._id); // Debug log

    // Generate JWT
    const token = jwt.sign(
      { id: savedUser._id, isSeller: savedUser.isSeller },
      process.env.JWT_KEY,
      { expiresIn: "7d" }
    );

    // Remove password from response
    const { password: pass, ...userResponse } = savedUser._doc;

    const isProd2 = process.env.NODE_ENV === "production";
    const cookieOptions2 = {
      httpOnly: true,
      sameSite: isProd2 ? "none" : "lax",
      secure: isProd2,
      maxAge: 7 * 24 * 60 * 60 * 1000
    };
    if (process.env.COOKIE_DOMAIN) cookieOptions2.domain = process.env.COOKIE_DOMAIN;
    res
      .cookie("accessToken", token, cookieOptions2)
      .status(201)
      .json({ token, ...userResponse });

  } catch (error) {
    console.error('Google auth error details:', error); // Enhanced error logging
    
    // Check for specific MongoDB errors
    if (error.code === 11000) {
      console.error('Duplicate key error:', error.keyPattern);
      return res.status(400).json({ 
        message: 'User with this email or username already exists',
        field: Object.keys(error.keyPattern)[0]
      });
    }
    
    // Check for validation errors
    if (error.name === 'ValidationError') {
      console.error('Validation error:', error.errors);
      return res.status(400).json({ 
        message: 'Validation failed',
        errors: Object.keys(error.errors).map(key => ({
          field: key,
          message: error.errors[key].message
        }))
      });
    }
    
    // Firebase auth errors
    if (error.code === 'auth/id-token-expired') {
      return res.status(401).json({ message: 'Token expired. Please try again.' });
    }
    if (error.code === 'auth/invalid-id-token') {
      return res.status(401).json({ message: 'Invalid token. Please try again.' });
    }
    
    next(createError(500, `Google authentication failed: ${error.message}`));
  }
};

// Store password reset tokens temporarily (in production, use Redis or database)
const passwordResetTokens = new Map();

// Generate reset token
const generateResetToken = () => {
  return crypto.randomBytes(32).toString('hex');
};

// Send password reset email (mock implementation - replace with actual email service)
const sendPasswordResetEmail = async (email, token, firstname) => {
    // In production, integrate with email service like SendGrid, Nodemailer, etc.
    const resetLink = `${process.env.CLIENT_URL || 'http://localhost:5173'}/reset-password?token=${token}`;
  
    console.log(`Password Reset Email for ${email}:`);
    console.log(`Hi ${firstname},`);
    console.log(`Click the link below to reset your password:`);
    console.log(resetLink);
    console.log(`This link will expire in 1 hour.`);
    
    // Mock email sending - in production, implement actual email sending
    return new Promise((resolve) => {
      setTimeout(() => {
        console.log(`Password reset email sent to ${email}`);
        resolve(true);
      }, 100);
    });

    // Send password reset email using AWS SES
  // try {
  //   const resetLink = `${process.env.CLIENT_URL || 'http://localhost:5173'}/reset-password?token=${token}`;
  //   const result = await sendSESPasswordResetEmail(email, resetLink, firstname);
  //   console.log(`✅ Password reset email sent to ${email}:`, result.messageId);
  //   return result;
  // } catch (error) {
  //   console.error(`❌ Failed to send password reset email to ${email}:`, error.message);
  //   throw error;
  // }
};

// Request password reset
export const requestPasswordReset = async (req, res, next) => {
  try {
    const { email } = req.body;

    if (!email || !email.includes("@")) {
      return next(createError(400, "Valid email address is required"));
    }

    // Find user by email
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      // Don't reveal whether email exists or not for security
      return res.status(200).json({
        message: "If an account with that email exists, we've sent a password reset link."
      });
    }

    // Check if user is a Google user
    if (user.isGoogleUser) {
      return res.status(200).json({
        message: "If an account with that email exists, we've sent a password reset link."
      });
    }

    // Generate reset token
    const resetToken = generateResetToken();
    const expiresAt = Date.now() + 60 * 60 * 1000; // 1 hour

    // Store reset token
    passwordResetTokens.set(resetToken, {
      userId: user._id.toString(),
      email: user.email,
      expiresAt: expiresAt,
      used: false
    });

    // Send password reset email
    await sendPasswordResetEmail(user.email, resetToken, user.firstname);

    res.status(200).json({
      message: "If an account with that email exists, we've sent a password reset link."
    });

  } catch (err) {
    next(err);
  }
};

// Verify reset token
export const verifyResetToken = async (req, res, next) => {
  try {
    const { token } = req.query;

    if (!token) {
      return next(createError(400, "Reset token is required"));
    }

    // Get stored token data
    const tokenData = passwordResetTokens.get(token);
    
    if (!tokenData) {
      return next(createError(400, "Invalid or expired reset token"));
    }

    // Check if token has expired
    if (Date.now() > tokenData.expiresAt) {
      passwordResetTokens.delete(token);
      return next(createError(400, "Reset token has expired"));
    }

    // Check if token has been used
    if (tokenData.used) {
      return next(createError(400, "Reset token has already been used"));
    }

    // Get user details for the response
    const user = await User.findById(tokenData.userId).select("firstname email");
    if (!user) {
      passwordResetTokens.delete(token);
      return next(createError(400, "User not found"));
    }

    res.status(200).json({
      message: "Reset token is valid",
      email: user.email,
      firstname: user.firstname
    });

  } catch (err) {
    next(err);
  }
};

// Reset password
export const resetPassword = async (req, res, next) => {
  try {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
      return next(createError(400, "Reset token and new password are required"));
    }

    if (newPassword.length < 6) {
      return next(createError(400, "Password must be at least 6 characters long"));
    }

    // Get stored token data
    const tokenData = passwordResetTokens.get(token);
    
    if (!tokenData) {
      return next(createError(400, "Invalid or expired reset token"));
    }

    // Check if token has expired
    if (Date.now() > tokenData.expiresAt) {
      passwordResetTokens.delete(token);
      return next(createError(400, "Reset token has expired"));
    }

    // Check if token has been used
    if (tokenData.used) {
      return next(createError(400, "Reset token has already been used"));
    }

    // Find user
    const user = await User.findById(tokenData.userId);
    if (!user) {
      passwordResetTokens.delete(token);
      return next(createError(400, "User not found"));
    }

    // Check if user is a Google user
    if (user.isGoogleUser) {
      passwordResetTokens.delete(token);
      return next(createError(400, "Google users cannot reset password through this method"));
    }

    // Hash new password
    const newPasswordHash = bcrypt.hashSync(newPassword, 10);

    // Update password
    await User.findByIdAndUpdate(tokenData.userId, {
      password: newPasswordHash
    });

    // Mark token as used
    tokenData.used = true;

    // Update settings if they exist
    try {
      const Settings = (await import("../models/settings.model.js")).default;
      await Settings.findOneAndUpdate(
        { userId: tokenData.userId },
        { 
          $set: { 
            "security.lastPasswordChange": new Date() 
          } 
        },
        { upsert: true }
      );
    } catch (settingsError) {
      console.warn("Could not update settings:", settingsError.message);
    }

    // Clean up token after a delay to prevent reuse
    setTimeout(() => {
      passwordResetTokens.delete(token);
    }, 5000);

    res.status(200).json({ 
      message: "Password has been reset successfully. You can now log in with your new password."
    });

  } catch (err) {
    next(err);
  }
};