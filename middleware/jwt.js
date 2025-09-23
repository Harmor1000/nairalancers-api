import jwt from "jsonwebtoken";
import createError from "../utils/createError.js";
import User from "../models/user.model.js";

export const verifyToken = (req, res, next) => {
  let token = req.cookies.accessToken;
  if (!token) {
    const auth = req.headers['authorization'] || req.headers['Authorization'];
    if (auth && typeof auth === 'string' && auth.startsWith('Bearer ')) {
      token = auth.slice(7).trim();
    }
  }
  if (!token) return next(createError(401, "You are not Authenticated!"));

  jwt.verify(token, process.env.JWT_KEY, async (err, payload) => {
    if (err) return next(createError(403, "Token is not valid!"));
    
    req.userId = payload.id;
    req.isSeller = payload.isSeller;
    
    // Update lastSeen timestamp for user activity tracking
    // Do this asynchronously to avoid slowing down requests
    try {
      // Only update if last update was more than 1 minute ago to avoid too frequent DB writes
      const user = await User.findById(payload.id, 'lastSeen');
      if (user) {
        const now = new Date();
        const lastUpdate = user.lastSeen ? new Date(user.lastSeen) : new Date(0);
        const timeDiff = now - lastUpdate;
        
        // Update only if more than 1 minute has passed since last update
        if (timeDiff > 60000) { // 1 minute in milliseconds
          User.findByIdAndUpdate(
            payload.id, 
            { lastSeen: now, isOnline: true },
            { new: false }
          ).catch(error => {
            // Silent error handling - don't break the request if lastSeen update fails
            console.error('Failed to update lastSeen:', error.message);
          });
        }
      }
    } catch (error) {
      // Silent error handling - don't break the request if lastSeen update fails
      console.error('Failed to update lastSeen:', error.message);
    }
    
    next();
  });
};