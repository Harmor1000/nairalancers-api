import jwt from "jsonwebtoken";
import createError from "../utils/createError.js";
import User from "../models/user.model.js";

// Admin Authentication Middleware
export const verifyAdmin = async (req, res, next) => {
  try {
    const token = req.cookies.accessToken;
    if (!token) return next(createError(401, "You are not authenticated!"));

    jwt.verify(token, process.env.JWT_KEY, async (err, payload) => {
      if (err) return next(createError(403, "Token is not valid!"));
      
      // Get user from database to verify admin status
      const user = await User.findById(payload.id);
      if (!user) return next(createError(404, "User not found!"));
      if (!user.isAdmin) return next(createError(403, "Admin access required!"));

      req.userId = payload.id;
      req.isSeller = payload.isSeller;
      req.isAdmin = true;
      req.adminUser = user;
      next();
    });
  } catch (error) {
    next(createError(500, "Authentication error"));
  }
};

// Super Admin Check (for sensitive operations)
export const verifySuperAdmin = async (req, res, next) => {
  try {
    const token = req.cookies.accessToken;
    if (!token) return next(createError(401, "You are not authenticated!"));

    jwt.verify(token, process.env.JWT_KEY, async (err, payload) => {
      if (err) return next(createError(403, "Token is not valid!"));
      
      // Get user from database to verify super admin status
      const user = await User.findById(payload.id);
      if (!user) return next(createError(404, "User not found!"));
      if (!user.isAdmin) return next(createError(403, "Admin access required!"));
      if (!user.isSuperAdmin) return next(createError(403, "Super Admin access required!"));

      req.userId = payload.id;
      req.isSeller = payload.isSeller;
      req.isAdmin = true;
      req.isSuperAdmin = true;
      req.adminUser = user;
      next();
    });
  } catch (error) {
    next(createError(500, "Authentication error"));
  }
};

// Optional Admin Check (continues even if not admin)
export const optionalAdmin = async (req, res, next) => {
  try {
    const token = req.cookies.accessToken;
    if (!token) {
      req.isAdmin = false;
      return next();
    }

    jwt.verify(token, process.env.JWT_KEY, async (err, payload) => {
      if (err) {
        req.isAdmin = false;
        return next();
      }
      
      const user = await User.findById(payload.id);
      req.userId = payload.id;
      req.isSeller = payload.isSeller;
      req.isAdmin = user?.isAdmin || false;
      req.adminUser = user?.isAdmin ? user : null;
      next();
    });
  } catch (error) {
    req.isAdmin = false;
    next();
  }
};
