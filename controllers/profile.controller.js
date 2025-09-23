import User from "../models/user.model.js";
import Gig from "../models/gig.model.js";
import Review from "../models/review.model.js";
import Order from "../models/order.model.js";
import createError from "../utils/createError.js";

// Get public profile by user ID
export const getProfile = async (req, res, next) => {
  try {
    const userId = req.params.id;
    
    // Get user basic info
    const user = await User.findById(userId).select("-password -email");
    if (!user) {
      return next(createError(404, "User not found"));
    }

    // Get user's gigs if they're a seller
    let gigs = [];
    if (user.isSeller) {
      gigs = await Gig.find({ userId: userId, isActive: { $ne: false } })
        .populate("userId", "username img")
        .sort({ createdAt: -1 })
        .limit(6);
    }

    // Get reviews for this user (as a seller)
    const reviews = await Review.find({ sellerId: userId })
      .populate("userId", "username img")
      .sort({ createdAt: -1 })
      .limit(10);

    // Calculate profile statistics
    const stats = await calculateProfileStats(userId, user.isSeller);

    res.status(200).json({
      user,
      gigs,
      reviews,
      stats
    });
  } catch (err) {
    next(err);
  }
};

// Update profile information
export const updateProfile = async (req, res, next) => {
  try {
    const userId = req.userId; // From JWT middleware
    const {
      firstname,
      lastname,
      username,
      email,
      phone,
      state,
      img,
      desc,
      skills,
      languages,
      education,
      certifications,
      portfolio,
      socialLinks,
      professionalTitle,
      hourlyRate,
      responseTime,
      availability
    } = req.body;

    const user = await User.findById(userId);
    if (!user) {
      return next(createError(404, "User not found"));
    }

    // Exclude username and email from direct updates for security
    const updateData = {
      firstname,
      lastname,
      phone,
      state,
      img,
      desc,
      skills,
      languages,
      education,
      certifications,
      portfolio,
      socialLinks,
      professionalTitle,
      hourlyRate,
      responseTime,
      availability,
      profileCompletedAt: new Date()
    };

    // Prevent username changes
    if (username && username !== user.username) {
      return next(createError(400, "Username cannot be changed for security reasons"));
    }

    // Prevent direct email changes
    if (email && email !== user.email) {
      return next(createError(400, "Email changes require verification. Please use the email verification process."));
    }

    // Remove undefined fields
    Object.keys(updateData).forEach(key => 
      updateData[key] === undefined && delete updateData[key]
    );

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { $set: updateData },
      { new: true, runValidators: true }
    ).select("-password");

    res.status(200).json(updatedUser);
  } catch (err) {
    next(err);
  }
};

// Get profile completion percentage
export const getProfileCompletion = async (req, res, next) => {
  try {
    const userId = req.userId;
    const user = await User.findById(userId).select("-password");
    
    if (!user) {
      return next(createError(404, "User not found"));
    }

    const completion = calculateProfileCompletion(user);
    
    res.status(200).json({
      percentage: completion.percentage,
      missingFields: completion.missingFields,
      suggestions: completion.suggestions
    });
  } catch (err) {
    next(err);
  }
};

// Search profiles
export const searchProfiles = async (req, res, next) => {
  try {
    const { 
      search, 
      skills, 
      location, 
      minRating, 
      maxPrice, 
      minPrice,
      isSeller,
      sort = "relevance",
      page = 1,
      limit = 12
    } = req.query;

    let query = {};
    
    // Build search query
    if (search) {
      query.$or = [
        { username: { $regex: search, $options: "i" } },
        { desc: { $regex: search, $options: "i" } },
        { professionalTitle: { $regex: search, $options: "i" } },
        { skills: { $in: [new RegExp(search, "i")] } }
      ];
    }

    if (skills) {
      const skillsArray = skills.split(",");
      query.skills = { $in: skillsArray };
    }

    if (location) {
      query.state = { $regex: location, $options: "i" };
    }

    if (isSeller !== undefined) {
      query.isSeller = isSeller === "true";
    }

    if (minPrice || maxPrice) {
      query.hourlyRate = {};
      if (minPrice) query.hourlyRate.$gte = Number(minPrice);
      if (maxPrice) query.hourlyRate.$lte = Number(maxPrice);
    }

    // Build sort criteria with _id as tiebreaker for consistent pagination
    let sortCriteria = {};
    switch (sort) {
      case "rating":
        sortCriteria = { averageRating: -1, _id: 1 };
        break;
      case "newest":
        sortCriteria = { createdAt: -1, _id: 1 };
        break;
      case "price_low":
        sortCriteria = { hourlyRate: 1, _id: 1 };
        break;
      case "price_high":
        sortCriteria = { hourlyRate: -1, _id: 1 };
        break;
      default:
        sortCriteria = { totalReviews: -1, averageRating: -1, _id: 1 };
    }

    const skip = (page - 1) * limit;

    const users = await User.find(query)
      .select("-password -email")
      .sort(sortCriteria)
      .skip(skip)
      .limit(Number(limit));

    const total = await User.countDocuments(query);

    res.status(200).json({
      users,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / limit),
        hasMore: Number(page) < Math.ceil(total / limit),
        hasPrevious: Number(page) > 1
      }
    });
  } catch (err) {
    next(err);
  }
};

// Helper function to calculate profile statistics
const calculateProfileStats = async (userId, isSeller) => {
  const stats = {
    totalGigs: 0,
    activeGigs: 0,
    totalOrders: 0,
    completedOrders: 0,
    totalReviews: 0,
    averageRating: 0,
    responseTime: "N/A",
    completionRate: 0,
    joinedDate: null
  };

  try {
    const user = await User.findById(userId);
    stats.joinedDate = user.createdAt;

    if (isSeller) {
      // Gig statistics
      const totalGigs = await Gig.countDocuments({ userId });
      const activeGigs = await Gig.countDocuments({ userId, isActive: { $ne: false } });
      
      stats.totalGigs = totalGigs;
      stats.activeGigs = activeGigs;

      // Order statistics
      const orders = await Order.find({ sellerId: userId });
      const completedOrders = orders.filter(order => order.isCompleted);
      
      stats.totalOrders = orders.length;
      stats.completedOrders = completedOrders.length;
      stats.completionRate = orders.length > 0 ? (completedOrders.length / orders.length) * 100 : 0;

      // Review statistics
      const reviews = await Review.find({ sellerId: userId });
      stats.totalReviews = reviews.length;
      
      if (reviews.length > 0) {
        const totalRating = reviews.reduce((sum, review) => sum + review.rating, 0);
        stats.averageRating = (totalRating / reviews.length).toFixed(1);
      }
    } else {
      // Buyer statistics
      const orders = await Order.find({ buyerId: userId });
      stats.totalOrders = orders.length;
      stats.completedOrders = orders.filter(order => order.isCompleted).length;
    }

    return stats;
  } catch (error) {
    console.error("Error calculating profile stats:", error);
    return stats;
  }
};

// Helper function to calculate profile completion percentage
const calculateProfileCompletion = (user) => {
  const requiredFields = [
    'username', 'firstname', 'lastname', 'desc', 'img', 'state'
  ];
  
  const optionalFields = [
    'skills', 'languages', 'education', 'certifications', 
    'portfolio', 'socialLinks', 'professionalTitle'
  ];

  if (user.isSeller) {
    optionalFields.push('hourlyRate', 'responseTime');
  }

  let completedRequired = 0;
  let completedOptional = 0;
  const missingFields = [];
  const suggestions = [];

  // Check required fields
  requiredFields.forEach(field => {
    if (user[field] && user[field].toString().trim() !== '') {
      completedRequired++;
    } else {
      missingFields.push(field);
      suggestions.push(`Add your ${field.replace(/([A-Z])/g, ' $1').toLowerCase()}`);
    }
  });

  // Check optional fields
  optionalFields.forEach(field => {
    if (user[field] && (
      (Array.isArray(user[field]) && user[field].length > 0) ||
      (!Array.isArray(user[field]) && user[field].toString().trim() !== '')
    )) {
      completedOptional++;
    }
  });

  const requiredWeight = 70; // 70% weight for required fields
  const optionalWeight = 30; // 30% weight for optional fields

  const requiredPercentage = (completedRequired / requiredFields.length) * requiredWeight;
  const optionalPercentage = (completedOptional / optionalFields.length) * optionalWeight;

  const totalPercentage = Math.round(requiredPercentage + optionalPercentage);

  return {
    percentage: totalPercentage,
    missingFields,
    suggestions: suggestions.slice(0, 3) // Return top 3 suggestions
  };
};
