import User from "../models/user.model.js";
import createError from "../utils/createError.js";
import jwt from "jsonwebtoken";
import crypto from "crypto";

// for production
// import { sendVerificationEmail as sendSESVerificationEmail, sendRegistrationVerificationEmail as sendSESRegistrationEmail } from "../services/emailService.js";

// Store verification codes temporarily (in production, use Redis or database)
const verificationCodes = new Map();

// Generate verification code
const generateVerificationCode = () => {
  return crypto.randomInt(100000, 999999).toString();
};

// Send verification email using AWS SES
const sendVerificationEmail = async (email, code, type = "change") => {
    // In production, integrate with email service like SendGrid, Nodemailer, etc.
    console.log(`Email Verification Code for ${email}: ${code}`);
    console.log(`Verification Type: ${type}`);
    
    // Mock email sending - in production, implement actual email sending
    return new Promise((resolve) => {
      setTimeout(() => {
        console.log(`Verification email sent to ${email} with code: ${code}`);
        resolve(true);
      }, 100);
    });

    // for production
//   try {
//     const result = await sendSESVerificationEmail(email, code, type);
//     console.log(`✅ Verification email sent to ${email}:`, result.messageId);
//     return result;
//   } catch (error) {
//     console.error(`❌ Failed to send verification email to ${email}:`, error.message);
//     throw error;
//   }
};
// Send initial registration verification email
const sendRegistrationVerificationEmail = async (email, code, firstname) => {

  // In production, integrate with email service like SendGrid, Nodemailer, etc.
  console.log(`Registration Verification Email for ${email}:`);
  console.log(`Hi ${firstname},`);
  console.log(`Welcome to Nairalancers! Please verify your email address with this code: ${code}`);
  console.log(`This code will expire in 10 minutes.`);
  
  // Mock email sending - in production, implement actual email sending
  return new Promise((resolve) => {
    setTimeout(() => {
      console.log(`Registration verification email sent to ${email}`);
      resolve(true);
    }, 100);
  });

  // for production
// // Send initial registration verification email using AWS SES
// const sendRegistrationVerificationEmail = async (email, code, firstname) => {
//   try {
//     const result = await sendSESRegistrationEmail(email, code, firstname);
//     console.log(`✅ Registration verification email sent to ${email}:`, result.messageId);
//     return result;
//   } catch (error) {
//     console.error(`❌ Failed to send registration verification email to ${email}:`, error.message);
//     throw error;
//   }
};

// Request email verification for email change
export const requestEmailVerification = async (req, res, next) => {
  try {
    const userId = req.userId;
    const { newEmail } = req.body;

    if (!newEmail || !newEmail.includes("@")) {
      return next(createError(400, "Valid email address is required"));
    }

    // Check if new email is already in use by another user
    const existingUser = await User.findOne({ 
      email: newEmail, 
      _id: { $ne: userId } 
    });

    if (existingUser) {
      return next(createError(400, "This email address is already in use by another account. Please choose a different email."));
    }

    // Get current user
    const user = await User.findById(userId);
    if (!user) {
      return next(createError(404, "User not found"));
    }

    // Check if the new email is the same as current email
    if (user.email === newEmail) {
      return next(createError(400, "This is already your current email address. Please enter a different email to change it."));
    }

    // Generate verification code
    const verificationCode = generateVerificationCode();
    const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes

    // Store verification data
    verificationCodes.set(userId, {
      code: verificationCode,
      newEmail: newEmail,
      expiresAt: expiresAt,
      attempts: 0
    });

    // Send verification email
    await sendVerificationEmail(newEmail, verificationCode, "change");

    res.status(200).json({
      message: "Verification code sent to new email address",
      email: newEmail,
      expiresIn: 600 // 10 minutes in seconds
    });

  } catch (err) {
    next(err);
  }
};

// Verify email change code
export const verifyEmailChange = async (req, res, next) => {
  try {
    const userId = req.userId;
    const { verificationCode } = req.body;

    if (!verificationCode) {
      return next(createError(400, "Verification code is required"));
    }

    // Get stored verification data
    const storedData = verificationCodes.get(userId);
    
    if (!storedData) {
      return next(createError(400, "No verification request found. Please request a new code."));
    }

    // Check if code has expired
    if (Date.now() > storedData.expiresAt) {
      verificationCodes.delete(userId);
      return next(createError(400, "Verification code has expired. Please request a new code."));
    }

    // Check attempt limit
    if (storedData.attempts >= 3) {
      verificationCodes.delete(userId);
      return next(createError(400, "Too many verification attempts. Please request a new code."));
    }

    // Verify code
    if (storedData.code !== verificationCode.trim()) {
      storedData.attempts += 1;
      return next(createError(400, `Invalid verification code. ${3 - storedData.attempts} attempts remaining.`));
    }

    // Update user email
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { email: storedData.newEmail },
      { new: true, runValidators: true }
    ).select("-password");

    // Clean up verification data
    verificationCodes.delete(userId);

    res.status(200).json({
      message: "Email successfully updated",
      user: updatedUser
    });

  } catch (err) {
    next(err);
  }
};

// Get verification status
export const getVerificationStatus = async (req, res, next) => {
  try {
    const userId = req.userId;
    const storedData = verificationCodes.get(userId);

    if (!storedData) {
      return res.status(200).json({
        hasActiveVerification: false
      });
    }

    // Check if expired
    if (Date.now() > storedData.expiresAt) {
      verificationCodes.delete(userId);
      return res.status(200).json({
        hasActiveVerification: false
      });
    }

    res.status(200).json({
      hasActiveVerification: true,
      email: storedData.newEmail,
      expiresAt: storedData.expiresAt,
      attemptsRemaining: 3 - storedData.attempts
    });

  } catch (err) {
    next(err);
  }
};

// Resend verification code
export const resendVerificationCode = async (req, res, next) => {
  try {
    const userId = req.userId;
    const storedData = verificationCodes.get(userId);

    if (!storedData) {
      return next(createError(400, "No active verification request found"));
    }

    // Generate new code
    const verificationCode = generateVerificationCode();
    const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes

    // Update stored data
    verificationCodes.set(userId, {
      ...storedData,
      code: verificationCode,
      expiresAt: expiresAt,
      attempts: 0 // Reset attempts
    });

    // Send verification email
    await sendVerificationEmail(storedData.newEmail, verificationCode, "resend");

    res.status(200).json({
      message: "New verification code sent",
      email: storedData.newEmail,
      expiresIn: 600
    });

  } catch (err) {
    next(err);
  }
};

// Cancel email verification
export const cancelEmailVerification = async (req, res, next) => {
  try {
    const userId = req.userId;
    
    if (verificationCodes.has(userId)) {
      verificationCodes.delete(userId);
    }

    res.status(200).json({
      message: "Email verification cancelled"
    });

  } catch (err) {
    next(err);
  }
};

// Check email availability
export const checkEmailAvailability = async (req, res, next) => {
  try {
    const userId = req.userId;
    const { email } = req.body;

    if (!email || !email.includes("@")) {
      return next(createError(400, "Valid email address is required"));
    }

    // Check if email is already in use by another user
    const existingUser = await User.findOne({ 
      email: email, 
      _id: { $ne: userId } 
    });

    if (existingUser) {
      return next(createError(400, "This email address is already in use by another account. Please choose a different email."));
    }

    // Get current user
    const user = await User.findById(userId);
    if (!user) {
      return next(createError(404, "User not found"));
    }

    // Check if the email is the same as current email
    if (user.email === email) {
      return next(createError(400, "This is already your current email address. Please enter a different email to change it."));
    }

    res.status(200).json({
      available: true,
      message: "Email address is available"
    });

  } catch (err) {
    next(err);
  }
};


