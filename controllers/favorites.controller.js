import User from '../models/user.model.js';
import Gig from '../models/gig.model.js';
import createError from '../utils/createError.js';

// Add gig or seller to favorites
export const addToFavorites = async (req, res, next) => {
  try {
    const { itemId } = req.params;
    const { type } = req.query; // 'gig' or 'seller'
    const userId = req.userId;

    // Validate type parameter
    if (!type || !['gig', 'seller'].includes(type)) {
      return next(createError(400, "Type must be 'gig' or 'seller'"));
    }

    // Get user info
    const user = await User.findById(userId);
    if (!user) {
      return next(createError(404, "User not found!"));
    }

    // Only allow clients/buyers to favorite items
    if (user.isSeller) {
      return next(createError(403, "Sellers cannot add items to favorites!"));
    }

    let targetItem, fieldToUpdate, alreadyInFavorites;

    if (type === 'gig') {
      // Check if gig exists
      targetItem = await Gig.findById(itemId);
      if (!targetItem) {
        return next(createError(404, "Gig not found!"));
      }

      fieldToUpdate = 'favorites';
      alreadyInFavorites = user.favorites?.some(id => id.toString() === itemId.toString());

      if (alreadyInFavorites) {
        return next(createError(400, "Gig already in favorites!"));
      }
    } else if (type === 'seller') {
      // Check if seller exists
      targetItem = await User.findById(itemId);
      if (!targetItem) {
        return next(createError(404, "Seller not found!"));
      }

      // Verify target user is a seller
      if (!targetItem.isSeller) {
        return next(createError(400, "You can only favorite sellers!"));
      }

      fieldToUpdate = 'favoriteSellers';
      alreadyInFavorites = user.favoriteSellers?.some(id => id.toString() === itemId.toString());

      if (alreadyInFavorites) {
        return next(createError(400, "Seller already in favorites!"));
      }
    }

    // Add to favorites
    await User.findByIdAndUpdate(
      userId,
      { $push: { [fieldToUpdate]: itemId } },
      { new: true }
    );

    res.status(200).json({ 
      message: `${type === 'gig' ? 'Gig' : 'Seller'} added to favorites successfully!` 
    });
  } catch (err) {
    next(err);
  }
};

// Remove gig or seller from favorites
export const removeFromFavorites = async (req, res, next) => {
  try {
    const { itemId } = req.params;
    const { type } = req.query; // 'gig' or 'seller'
    const userId = req.userId;

    // Validate type parameter
    if (!type || !['gig', 'seller'].includes(type)) {
      return next(createError(400, "Type must be 'gig' or 'seller'"));
    }

    // Get user info
    const user = await User.findById(userId);
    if (!user) {
      return next(createError(404, "User not found!"));
    }

    // Only allow clients/buyers to manage favorites
    if (user.isSeller) {
      return next(createError(403, "Sellers cannot manage favorites!"));
    }

    const fieldToUpdate = type === 'gig' ? 'favorites' : 'favoriteSellers';

    // Remove from favorites
    await User.findByIdAndUpdate(
      userId,
      { $pull: { [fieldToUpdate]: itemId } },
      { new: true }
    );

    res.status(200).json({ 
      message: `${type === 'gig' ? 'Gig' : 'Seller'} removed from favorites successfully!` 
    });
  } catch (err) {
    next(err);
  }
};

// Get user's favorites
export const getFavorites = async (req, res, next) => {
  try {
    const userId = req.userId;
    const { type } = req.query; // 'gig', 'seller', or 'all' (default)
    
    // Pagination parameters
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 12;
    const skip = (page - 1) * limit;

    // Get user with favorites
    const user = await User.findById(userId).select('favorites favoriteSellers isSeller');
    if (!user) {
      return next(createError(404, "User not found!"));
    }

    // Only allow clients/buyers to access favorites
    if (user.isSeller) {
      return next(createError(403, "Sellers cannot access favorites!"));
    }

    let favorites = [];
    let totalFavorites = 0;

    if (type === 'gig') {
      // Get only gig favorites
      const gigFavorites = user.favorites || [];
      totalFavorites = gigFavorites.length;
      
      if (gigFavorites.length === 0) {
        return res.status(200).json({
          favorites: [],
          type: 'gig',
          pagination: { page: 1, limit, totalCount: 0, pages: 0, hasMore: false, hasPrevious: false }
        });
      }

      const favoritesSlice = gigFavorites.slice(skip, skip + limit);
      const populatedGigs = await Gig.find({ _id: { $in: favoritesSlice } })
        .select('title desc shortDesc price cover cat subcategory userId sales totalStars starNumber status createdAt updatedAt');
      
      favorites = favoritesSlice.map(favoriteId => {
        const foundGig = populatedGigs.find(gig => gig._id.toString() === favoriteId.toString());
        return foundGig ? { ...foundGig.toObject(), type: 'gig' } : null;
      }).filter(Boolean);

    } else if (type === 'seller') {
      // Get only seller favorites
      const sellerFavorites = user.favoriteSellers || [];
      totalFavorites = sellerFavorites.length;
      
      if (sellerFavorites.length === 0) {
        return res.status(200).json({
          favorites: [],
          type: 'seller',
          pagination: { page: 1, limit, totalCount: 0, pages: 0, hasMore: false, hasPrevious: false }
        });
      }

      const favoritesSlice = sellerFavorites.slice(skip, skip + limit);
      const populatedSellers = await User.find({ _id: { $in: favoritesSlice } })
        .select('username firstname lastname img professionalTitle state responseTime hourlyRate skills verificationBadge createdAt');
      
      favorites = favoritesSlice.map(favoriteId => {
        const foundSeller = populatedSellers.find(seller => seller._id.toString() === favoriteId.toString());
        return foundSeller ? { ...foundSeller.toObject(), type: 'seller' } : null;
      }).filter(Boolean);

    } else {
      // Get both types (default behavior)
      const gigFavorites = (user.favorites || []).map(id => ({ id, type: 'gig' }));
      const sellerFavorites = (user.favoriteSellers || []).map(id => ({ id, type: 'seller' }));
      const allFavorites = [...gigFavorites, ...sellerFavorites];
      
      totalFavorites = allFavorites.length;
      
      if (allFavorites.length === 0) {
        return res.status(200).json({
          favorites: [],
          type: 'all',
          pagination: { page: 1, limit, totalCount: 0, pages: 0, hasMore: false, hasPrevious: false }
        });
      }

      const favoritesSlice = allFavorites.slice(skip, skip + limit);
      
      // Separate gig and seller IDs
      const gigIds = favoritesSlice.filter(item => item.type === 'gig').map(item => item.id);
      const sellerIds = favoritesSlice.filter(item => item.type === 'seller').map(item => item.id);
      
      // Fetch both types
      const [populatedGigs, populatedSellers] = await Promise.all([
        gigIds.length > 0 ? Gig.find({ _id: { $in: gigIds } })
          .select('title desc shortDesc price cover cat subcategory userId sales totalStars starNumber status createdAt updatedAt') : [],
        sellerIds.length > 0 ? User.find({ _id: { $in: sellerIds } })
          .select('username firstname lastname img professionalTitle state responseTime hourlyRate skills verificationBadge createdAt') : []
      ]);
      
      // Combine results in original order
      favorites = favoritesSlice.map(item => {
        if (item.type === 'gig') {
          const foundGig = populatedGigs.find(gig => gig._id.toString() === item.id.toString());
          return foundGig ? { ...foundGig.toObject(), type: 'gig' } : null;
        } else {
          const foundSeller = populatedSellers.find(seller => seller._id.toString() === item.id.toString());
          return foundSeller ? { ...foundSeller.toObject(), type: 'seller' } : null;
        }
      }).filter(Boolean);
    }

    // Calculate pagination info
    const totalPages = Math.ceil(totalFavorites / limit);
    const hasMore = page < totalPages;

    res.status(200).json({
      favorites,
      type: type || 'all',
      pagination: {
        page,
        limit,
        totalCount: totalFavorites,
        pages: totalPages,
        hasMore,
        hasPrevious: page > 1
      }
    });
  } catch (err) {
    console.error('Error in getFavorites:', err);
    next(err);
  }
};

// Check if gig or seller is in favorites
export const checkFavorite = async (req, res, next) => {
  try {
    const { itemId } = req.params;
    const { type } = req.query; // 'gig' or 'seller'
    const userId = req.userId;

    // Validate type parameter
    if (!type || !['gig', 'seller'].includes(type)) {
      return next(createError(400, "Type must be 'gig' or 'seller'"));
    }

    const user = await User.findById(userId);
    if (!user) {
      return next(createError(404, "User not found!"));
    }

    // Only allow clients/buyers to check favorites
    if (user.isSeller) {
      return res.status(200).json({ isFavorite: false });
    }

    const fieldToCheck = type === 'gig' ? 'favorites' : 'favoriteSellers';
    const isFavorite = user[fieldToCheck]?.some(id => id.toString() === itemId.toString());
    
    res.status(200).json({ isFavorite });
  } catch (err) {
    next(err);
  }
};

// Toggle favorite status
export const toggleFavorite = async (req, res, next) => {
  try {
    const { itemId } = req.params;
    const { type } = req.query; // 'gig' or 'seller'
    const userId = req.userId;

    // Validate type parameter
    if (!type || !['gig', 'seller'].includes(type)) {
      return next(createError(400, "Type must be 'gig' or 'seller'"));
    }

    // Get user info
    const user = await User.findById(userId);
    if (!user) {
      return next(createError(404, "User not found!"));
    }

    // Only allow clients/buyers to toggle favorites
    if (user.isSeller) {
      return next(createError(403, "Sellers cannot manage favorites!"));
    }

    let targetItem, fieldToUpdate, isFavorite;

    if (type === 'gig') {
      // Check if gig exists
      targetItem = await Gig.findById(itemId);
      if (!targetItem) {
        return next(createError(404, "Gig not found!"));
      }

      fieldToUpdate = 'favorites';
      isFavorite = user.favorites?.some(id => id.toString() === itemId.toString());
    } else if (type === 'seller') {
      // Check if seller exists
      targetItem = await User.findById(itemId);
      if (!targetItem) {
        return next(createError(404, "Seller not found!"));
      }

      // Verify target user is a seller
      if (!targetItem.isSeller) {
        return next(createError(400, "You can only favorite sellers!"));
      }

      fieldToUpdate = 'favoriteSellers';
      isFavorite = user.favoriteSellers?.some(id => id.toString() === itemId.toString());
    }

    if (isFavorite) {
      // Remove from favorites
      await User.findByIdAndUpdate(
        userId,
        { $pull: { [fieldToUpdate]: itemId } },
        { new: true }
      );
      res.status(200).json({ 
        message: `${type === 'gig' ? 'Gig' : 'Seller'} removed from favorites successfully!`,
        data: { isFavorite: false }
      });
    } else {
      // Add to favorites
      await User.findByIdAndUpdate(
        userId,
        { $push: { [fieldToUpdate]: itemId } },
        { new: true }
      );
      res.status(200).json({ 
        message: `${type === 'gig' ? 'Gig' : 'Seller'} added to favorites successfully!`,
        data: { isFavorite: true }
      });
    }
  } catch (err) {
    next(err);
  }
};
