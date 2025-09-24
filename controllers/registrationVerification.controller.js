import User from "../models/user.model.js";
import createError from "../utils/createError.js";
import crypto from "crypto";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { sendRegistrationVerificationEmail } from "../services/emailService.js";

// Store verification codes temporarily (in production, use Redis or database)
const registrationVerificationCodes = new Map();

// Generate verification code
const generateVerificationCode = () => {
  return crypto.randomInt(100000, 999999).toString();
};

// Use SES Nodemailer email service

// Request initial email verification for new registrations
export const requestRegistrationVerification = async (req, res, next) => {
  try {
    const { email, firstname, registrationData } = req.body;

    if (!email || !email.includes("@")) {
      return next(createError(400, "Valid email address is required"));
    }

    if (!firstname) {
      return next(createError(400, "First name is required"));
    }

    // Check if user already exists (but allow re-sending verification for same email)
    const existingUser = await User.findOne({ 
      $or: [
        { email },
        ...(registrationData?.username ? [{ username: registrationData.username }] : [])
      ]
    });
    
    if (existingUser) {
      // If email verification is already complete, don't allow re-registration
      if (existingUser.emailVerified) {
        if (existingUser.email === email) {
          return next(createError(400, "User with this email already exists"));
        } else {
          return next(createError(400, "Username already taken"));
        }
      } else {
        // If user exists but email not verified, allow re-sending verification
        // Delete the incomplete user record
        await User.findByIdAndDelete(existingUser._id);
      }
    }

    // Generate verification code
    const verificationCode = generateVerificationCode();
    const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes

    // Store verification data using email as key for registration
    registrationVerificationCodes.set(`reg_${email}`, {
      code: verificationCode,
      email: email,
      firstname: firstname,
      registrationData: registrationData || null, // Store full registration data
      expiresAt: expiresAt,
      attempts: 0,
      type: 'registration'
    });

    // Send verification email
    await sendRegistrationVerificationEmail(email, verificationCode, firstname);

    res.status(200).json({
      message: "Verification code sent to your email address",
      email: email,
      expiresIn: 600 // 10 minutes in seconds
    });

  } catch (err) {
    next(err);
  }
};

// Verify registration email code
export const verifyRegistrationEmail = async (req, res, next) => {
  try {
    const { email, verificationCode } = req.body;

    if (!email || !verificationCode) {
      return next(createError(400, "Email and verification code are required"));
    }

    // Get stored verification data
    const storedData = registrationVerificationCodes.get(`reg_${email}`);
    
    if (!storedData) {
      return next(createError(400, "No verification request found. Please request a new code."));
    }

    // Check if code has expired
    if (Date.now() > storedData.expiresAt) {
      registrationVerificationCodes.delete(`reg_${email}`);
      return next(createError(400, "Verification code has expired. Please request a new code."));
    }

    // Check attempt limit
    if (storedData.attempts >= 3) {
      registrationVerificationCodes.delete(`reg_${email}`);
      return next(createError(400, "Too many verification attempts. Please request a new code."));
    }

    // Verify code
    if (storedData.code !== verificationCode.trim()) {
      storedData.attempts += 1;
      return next(createError(400, `Invalid verification code. ${3 - storedData.attempts} attempts remaining.`));
    }

    // Create user account now that email is verified
    if (storedData.registrationData) {
      const { firstname, lastname, username, email, password, isSeller } = storedData.registrationData;
      
      // Hash password
      const hash = bcrypt.hashSync(password, 10);

      // Create new user with email already verified
      const newUser = new User({
        firstname,
        lastname,
        username,
        email,
        password: hash,
        isSeller: isSeller || false,
        emailVerified: true,
        emailVerifiedAt: new Date(),
        verificationLevel: 'email_verified'
      });

      const savedUser = await newUser.save();

      // Generate JWT token
      const token = jwt.sign(
        { id: savedUser._id, isSeller: savedUser.isSeller },
        process.env.JWT_KEY,
        { expiresIn: "7d" }
      );

      // Remove password from response
      const { password: pass, ...userData } = savedUser._doc;

      // Clean up verification data
      registrationVerificationCodes.delete(`reg_${email}`);

      res.status(201).json({
        message: "Email successfully verified and account created!",
        verified: true,
        user: userData,
        token: token
      });
    } else {
      // Fallback - just mark existing user as verified (shouldn't happen with new flow)
      await User.findOneAndUpdate(
        { email: email },
        { emailVerified: true, emailVerifiedAt: new Date() },
        { new: true }
      );

      // Clean up verification data
      registrationVerificationCodes.delete(`reg_${email}`);

      res.status(200).json({
        message: "Email successfully verified!",
        verified: true
      });
    }

  } catch (err) {
    next(err);
  }
};

// Resend registration verification code
export const resendRegistrationVerification = async (req, res, next) => {
  try {
    const { email } = req.body;

    if (!email) {
      return next(createError(400, "Email address is required"));
    }

    const storedData = registrationVerificationCodes.get(`reg_${email}`);

    if (!storedData) {
      return next(createError(400, "No active verification request found"));
    }

    // Generate new code
    const verificationCode = generateVerificationCode();
    const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes

    // Update stored data
    registrationVerificationCodes.set(`reg_${email}`, {
      ...storedData,
      code: verificationCode,
      expiresAt: expiresAt,
      attempts: 0 // Reset attempts
    });

    // Send verification email
    await sendRegistrationVerificationEmail(email, verificationCode, storedData.firstname);

    res.status(200).json({
      message: "New verification code sent",
      email: email,
      expiresIn: 600
    });

  } catch (err) {
    next(err);
  }
};

// Change email during registration verification
export const changeRegistrationEmail = async (req, res, next) => {
  try {
    const { oldEmail, newEmail, registrationData } = req.body;

    if (!oldEmail || !newEmail) {
      return next(createError(400, "Both old and new email addresses are required"));
    }

    if (!newEmail.includes("@")) {
      return next(createError(400, "Valid new email address is required"));
    }

    if (oldEmail === newEmail) {
      return next(createError(400, "New email must be different from current email"));
    }

    // Check if new email is already registered
    const existingUser = await User.findOne({ email: newEmail });
    if (existingUser) {
      return next(createError(400, "An account with this email already exists"));
    }

    // Get stored verification data for old email
    const storedData = registrationVerificationCodes.get(`reg_${oldEmail}`);
    
    if (!storedData && !registrationData) {
      return next(createError(400, "No active verification request found"));
    }

    // Extract firstname from stored data or provided registration data
    const firstname = storedData?.firstname || registrationData?.firstname || 'User';

    // Generate new verification code for new email
    const verificationCode = generateVerificationCode();
    const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes

    // Remove old email verification data
    if (storedData) {
      registrationVerificationCodes.delete(`reg_${oldEmail}`);
    }

    // Store verification data for new email
    registrationVerificationCodes.set(`reg_${newEmail}`, {
      code: verificationCode,
      email: newEmail,
      firstname: firstname,
      expiresAt: expiresAt,
      attempts: 0,
      type: 'registration',
      originalEmail: oldEmail,
      registrationData: registrationData
    });

    // If there's already a partially created user with old email, update it
    if (registrationData) {
      try {
        await User.findOneAndUpdate(
          { email: oldEmail, emailVerified: false },
          { email: newEmail },
          { new: true }
        );
      } catch (updateError) {
        // User might not exist yet, which is fine
        console.log('No user to update:', updateError.message);
      }
    }

    // Send verification email to new address
    await sendRegistrationVerificationEmail(newEmail, verificationCode, firstname);

    res.status(200).json({
      message: `Verification code sent to your new email address: ${newEmail}`,
      email: newEmail,
      expiresIn: 600
    });

  } catch (err) {
    next(err);
  }
};