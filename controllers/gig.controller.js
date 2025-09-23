import Gig from "../models/gig.model.js";
import createError from "../utils/createError.js";
import User from "../models/user.model.js";
import emailService from "../services/emailService.js";
import Order from "../models/order.model.js";

export const createGig = async (req, res, next) => {
    if (!req.isSeller)
    return next(createError(403, "Only sellers can create a gig"));

    try {
        // Get seller information for email notification
        const seller = await User.findById(req.userId).select('username email firstname lastname img');
        if (!seller) {
            return next(createError(404, "Seller not found"));
        }

        // Check if seller has a profile picture
        if (!seller.img) {
            return next(createError(400, "You must have a profile picture before you can post gigs. Please update your profile with a photo."));
        }

        // Enforce maximum of 5 active gigs before allowing creation
        const activeGigCount = await Gig.countDocuments({ userId: req.userId, status: 'active' });
        if (activeGigCount >= 5) {
            return next(createError(400, "You already have 5 active gigs. Please pause an active gig before creating a new one."));
        }

        // Prepare gig data
        const gigData = {
            userId: req.userId,
            ...req.body,
            status: 'pending' // Ensure gig requires approval
        };

        // Validate package data if packages are enabled
        if (req.body.hasPackages) {
            const { packages } = req.body;
            if (!packages || (!packages.basic?.enabled && !packages.standard?.enabled && !packages.premium?.enabled)) {
                return next(createError(400, "At least one package must be enabled when packages are active"));
            }
        }

        // Validate milestone data if milestones are enabled
        if (req.body.hasMilestones) {
            const { milestones } = req.body;
            if (!milestones || milestones.length === 0) {
                return next(createError(400, "At least one milestone must be provided when milestones are active"));
            }
            
            // Sort milestones by order
            gigData.milestones = milestones.sort((a, b) => a.order - b.order);
        }

        // Enforce mutual exclusivity between packages and milestones
        if (req.body.hasPackages && req.body.hasMilestones) {
            return next(createError(400, "You cannot enable both Packages and Milestones. Please choose one pricing mode."));
        }

        // Compute unified starting price for gig cards/listing
        let computedPrice = null;
        if (req.body.hasPackages) {
            const { packages = {} } = req.body;
            const enabledPackages = ['basic','standard','premium']
                .map((k) => packages?.[k])
                .filter((p) => p && p.enabled && typeof p.price === 'number' && p.price > 0);
            if (enabledPackages.length === 0) {
                return next(createError(400, "At least one enabled package must have a valid price"));
            }
            computedPrice = Math.min(...enabledPackages.map((p) => p.price));
        } else if (req.body.hasMilestones) {
            const milestones = gigData.milestones || [];
            const validMilestones = milestones.filter((m) => typeof m.price === 'number' && m.price > 0);
            if (validMilestones.length === 0) {
                return next(createError(400, "Each milestone must have a price greater than 0"));
            }
            // Use the lowest milestone price as the public "starting at" price
            computedPrice = Math.min(...validMilestones.map((m) => m.price));
        } else {
            // Standard pricing mode
            if (typeof req.body.price !== 'number' || req.body.price < 1) {
                return next(createError(400, "Starting price must be greater than 0"));
            }
            computedPrice = req.body.price;
        }
        gigData.price = computedPrice;

        // Sanitize fields based on pricing mode to avoid min validators on irrelevant fields
        if (req.body.hasPackages || req.body.hasMilestones) {
            // Top-level standard fields shouldn't be persisted in non-standard modes
            delete gigData.deliveryTime;
            delete gigData.revisionNumber;
        }
        if (req.body.hasPackages && req.body.packages) {
            const tiers = ['basic', 'standard', 'premium'];
            gigData.packages = gigData.packages || {};
            for (const tier of tiers) {
                const pkg = req.body.packages[tier];
                if (!pkg) continue;
                if (pkg.enabled) {
                    // Coerce numeric fields to numbers
                    if (pkg.price != null) pkg.price = Number(pkg.price);
                    if (pkg.deliveryTime != null) pkg.deliveryTime = Number(pkg.deliveryTime);
                    if (pkg.revisions != null) pkg.revisions = Number(pkg.revisions);
                    gigData.packages[tier] = pkg;
                } else {
                    // Keep only enabled flag for disabled packages to avoid min validators
                    gigData.packages[tier] = { enabled: false };
                }
            }
        }

        const newGig = new Gig(gigData);
        const savedGig = await newGig.save();

        // Send email notification to admin
        try {
            const adminUsers = await User.find({ isAdmin: true }).select('email');
            const adminEmails = adminUsers.map(admin => admin.email).filter(Boolean);

            if (adminEmails.length > 0) {
                const emailData = {
                    to: adminEmails,
                    subject: 'New Gig Posted - Approval Required',
                    template: 'gig-approval-notification',
                    templateData: {
                        gigTitle: savedGig.title,
                        sellerName: `${seller.firstname} ${seller.lastname}`,
                        sellerUsername: seller.username,
                        gigCategory: savedGig.cat,
                        gigSubcategory: savedGig.subcategory,
                        basePrice: savedGig.price,
                        hasPackages: savedGig.hasPackages,
                        hasMilestones: savedGig.hasMilestones,
                        gigUrl: `${process.env.CLIENT_URL}/gig/${savedGig._id}`,
                        adminUrl: `${process.env.CLIENT_URL}/admin/gigs/${savedGig._id}`,
                        approvalUrl: `${process.env.CLIENT_URL}/admin/gigs`,
                        createdAt: new Date(savedGig.createdAt).toLocaleDateString()
                    }
                };

                await emailService.sendEmail(emailData);
                console.log(`Admin notification sent for new gig: ${savedGig._id}`);
            }
        } catch (emailError) {
            console.error('Failed to send admin notification email:', emailError);
            // Don't fail the gig creation if email fails
        }

        res.status(201).json({
            ...savedGig.toObject(),
            message: "Gig created successfully and submitted for admin approval"
        });
    } catch (err) {
        next(err);
    }
};
export const deleteGig = async (req, res, next) => {
    try {
        const gig = await Gig.findById(req.params.id);

        if (gig.userId !== req.userId)
        return next(createError(403, "You can only delete your gig!"));

        // Prevent deletion if there are active orders for this gig
        const activeOrders = await Order.countDocuments({
            gigId: req.params.id,
            status: { $in: ['pending', 'in progress'] }
        });

        if (activeOrders > 0) {
            return next(createError(400, "Cannot delete gig with active orders"));
        }

        await Gig.findByIdAndDelete(req.params.id);
        res.status(200).send("Gig has been deleted!");
    } catch (err) {
        next(err);
    }
};
export const getGig = async (req, res, next) => {
    try {
        const gig = await Gig.findById(req.params.id);
        if(!gig) return next(createError(404, "Gig not found"));

        // Compute accurate order counts for this gig
        const [ordersCount, completedOrdersCount] = await Promise.all([
            // Total paid orders tied to this gig
            Order.countDocuments({ gigId: req.params.id }),
            // Completed/released orders
            Order.countDocuments({
                gigId: req.params.id,
                $or: [
                    { status: 'completed' },
                    { escrowStatus: { $in: ['approved', 'released'] } }
                ]
            })
        ]);

        res.status(200).json({
            ...gig.toObject(),
            ordersCount,
            completedOrdersCount,
        });
    } catch (err) {
        next(err);
    }
};
export const updateGig = async (req, res, next) => {
    if (!req.isSeller)
        return next(createError(403, "Only sellers can edit gigs"));

    try {
        const gig = await Gig.findById(req.params.id);
        
        if (!gig) 
            return next(createError(404, "Gig not found"));

        if (gig.userId !== req.userId)
            return next(createError(403, "You can only edit your own gigs!"));

        // Prepare update data
        const updateData = {
            ...req.body,
            status: 'pending' // Reset to pending when gig is edited
        };

        // Validate package data if packages are enabled
        if (req.body.hasPackages) {
            const { packages } = req.body;
            if (!packages || (!packages.basic?.enabled && !packages.standard?.enabled && !packages.premium?.enabled)) {
                return next(createError(400, "At least one package must be enabled when packages are active"));
            }
        }

        // Validate milestone data if milestones are enabled
        if (req.body.hasMilestones) {
            const { milestones } = req.body;
            if (!milestones || milestones.length === 0) {
                return next(createError(400, "At least one milestone must be provided when milestones are active"));
            }
            
            // Sort milestones by order
            updateData.milestones = milestones.sort((a, b) => a.order - b.order);
        }

        // Enforce mutual exclusivity between packages and milestones
        if (req.body.hasPackages && req.body.hasMilestones) {
            return next(createError(400, "You cannot enable both Packages and Milestones. Please choose one pricing mode."));
        }

        // Compute unified starting price for gig cards/listing
        if (Object.prototype.hasOwnProperty.call(req.body, 'hasPackages') ||
            Object.prototype.hasOwnProperty.call(req.body, 'hasMilestones') ||
            Object.prototype.hasOwnProperty.call(req.body, 'price') ||
            Object.prototype.hasOwnProperty.call(req.body, 'packages') ||
            Object.prototype.hasOwnProperty.call(req.body, 'milestones')) {
            let computedPrice = null;
            if (req.body.hasPackages) {
                const { packages = {} } = req.body;
                const enabledPackages = ['basic','standard','premium']
                    .map((k) => packages?.[k])
                    .filter((p) => p && p.enabled && typeof p.price === 'number' && p.price > 0);
                if (enabledPackages.length === 0) {
                    return next(createError(400, "At least one enabled package must have a valid price"));
                }
                computedPrice = Math.min(...enabledPackages.map((p) => p.price));
            } else if (req.body.hasMilestones) {
                const milestones = updateData.milestones || [];
                const validMilestones = milestones.filter((m) => typeof m.price === 'number' && m.price > 0);
                if (validMilestones.length === 0) {
                    return next(createError(400, "Each milestone must have a price greater than 0"));
                }
                computedPrice = Math.min(...validMilestones.map((m) => m.price));
            } else {
                if (typeof req.body.price !== 'number' || req.body.price < 1) {
                    return next(createError(400, "Starting price must be greater than 0"));
                }
                computedPrice = req.body.price;
            }
            updateData.price = computedPrice;
        }

        // Sanitize fields based on pricing mode to avoid min validators on irrelevant fields
        if (req.body.hasPackages || req.body.hasMilestones) {
            delete updateData.deliveryTime;
            delete updateData.revisionNumber;
        }
        if (req.body.hasPackages && req.body.packages) {
            const tiers = ['basic', 'standard', 'premium'];
            updateData.packages = updateData.packages || {};
            for (const tier of tiers) {
                const pkg = req.body.packages[tier];
                if (!pkg) continue;
                if (pkg.enabled) {
                    if (pkg.price != null) pkg.price = Number(pkg.price);
                    if (pkg.deliveryTime != null) pkg.deliveryTime = Number(pkg.deliveryTime);
                    if (pkg.revisions != null) pkg.revisions = Number(pkg.revisions);
                    updateData.packages[tier] = pkg;
                } else {
                    updateData.packages[tier] = { enabled: false };
                }
            }
        }

        const updatedGig = await Gig.findByIdAndUpdate(
            req.params.id,
            updateData,
            { new: true, runValidators: true }
        );

        // Send notification to admin for re-approval
        try {
            const seller = await User.findById(req.userId).select('username email firstname lastname');
            const adminUsers = await User.find({ isAdmin: true }).select('email');
            const adminEmails = adminUsers.map(admin => admin.email).filter(Boolean);

            if (adminEmails.length > 0 && seller) {
                const emailData = {
                    to: adminEmails,
                    subject: 'Gig Updated - Re-approval Required',
                    template: 'gig-approval-notification',
                    templateData: {
                        gigTitle: updatedGig.title,
                        sellerName: `${seller.firstname} ${seller.lastname}`,
                        sellerUsername: seller.username,
                        gigCategory: updatedGig.cat,
                        gigSubcategory: updatedGig.subcategory,
                        basePrice: updatedGig.price,
                        hasPackages: updatedGig.hasPackages,
                        hasMilestones: updatedGig.hasMilestones,
                        gigUrl: `${process.env.CLIENT_URL}/gig/${updatedGig._id}`,
                        adminUrl: `${process.env.CLIENT_URL}/admin/gigs/${updatedGig._id}`,
                        approvalUrl: `${process.env.CLIENT_URL}/admin/gigs`,
                        isUpdate: true,
                        updatedAt: new Date(updatedGig.updatedAt).toLocaleDateString()
                    }
                };

                await emailService.sendEmail(emailData);
                console.log(`Admin notification sent for updated gig: ${updatedGig._id}`);
            }
        } catch (emailError) {
            console.error('Failed to send admin notification email:', emailError);
            // Don't fail the gig update if email fails
        }

        res.status(200).json({
            ...updatedGig.toObject(),
            message: "Gig updated successfully and submitted for admin re-approval"
        });
    } catch (err) {
        next(err);
    }
};

export const getGigs = async (req, res, next) => {
    const q = req.query;
    
    // Pagination parameters
    const page = parseInt(q.page) || 1;
    const limit = parseInt(q.limit) || 12;
    const skip = (page - 1) * limit;
    
    const filters = {
        ...(q.userId && {userId: q.userId}),
        ...(q.cat && {cat: q.cat}),
        ...((q.min || q.max) && {
            price: {
                ...(q.min && {$gt: q.min}), 
                ...(q.max && {$lt: q.max}) 
            },
         }),
        ...(q.search && {title: {$regex: q.search, $options: "i"}}),
        ...(q.status && {status: q.status}),
        // Only show active gigs to public unless explicitly overridden
        ...(!q.userId && !q.status && {status: 'active'}),
    };
    
    try {
        // Get sort parameter with default
        const sortField = q.sort || 'sales';
        const sortOrder = -1; // Descending order
        
        // Execute query with pagination
        const [gigs, totalCount] = await Promise.all([
            Gig.find(filters)
                .sort({ [sortField]: sortOrder })
                .skip(skip)
                .limit(limit)
                .populate('userId', 'username img averageRating totalReviews'),
            Gig.countDocuments(filters)
        ]);
        
        // Calculate pagination info
        const totalPages = Math.ceil(totalCount / limit);
        const hasMore = page < totalPages;
        
        res.status(200).json({
            data: gigs,
            pagination: {
                page,
                limit,
                totalCount,
                pages: totalPages,
                hasMore,
                hasPrevious: page > 1
            }
        });
    } catch (err) {
        next(err);
    }
};

export const getCategories = async (req, res, next) => {
    try {
        const categories = await Gig.aggregate([
            // {
            //     $match: { 
            //         status: 'active' // Only count active gigs
            //     }
            // },
            {
                $group: {
                    _id: '$cat',
                    count: { $sum: 1 },
                    avgPrice: { $avg: '$price' }
                }
            },
            {
                $sort: { count: -1 }
            }
        ]);

        // Also get total count for "All Gigs"
        const totalCount = await Gig.countDocuments({ status: 'active' });

        res.status(200).json({
            categories,
            totalCount
        });
    } catch (err) {
        next(err);
    }
};

// Pause a gig (seller action)
export const pauseGig = async (req, res, next) => {
    if (!req.isSeller)
        return next(createError(403, "Only sellers can pause gigs"));

    try {
        const gig = await Gig.findById(req.params.id);
        if (!gig) return next(createError(404, "Gig not found"));
        if (gig.userId !== req.userId)
            return next(createError(403, "You can only manage your own gigs"));

        if (gig.status !== 'active') {
            return next(createError(400, "Only active gigs can be paused"));
        }

        const updatedGig = await Gig.findByIdAndUpdate(
            req.params.id,
            { $set: { status: 'paused' } },
            { new: true }
        );

        res.status(200).json({
            message: "Gig paused successfully",
            gig: updatedGig
        });
    } catch (err) {
        next(err);
    }
};

// Resume a gig (seller action) - enforce max 5 active gigs
export const resumeGig = async (req, res, next) => {
    if (!req.isSeller)
        return next(createError(403, "Only sellers can resume gigs"));

    try {
        const gig = await Gig.findById(req.params.id);
        if (!gig) return next(createError(404, "Gig not found"));
        if (gig.userId !== req.userId)
            return next(createError(403, "You can only manage your own gigs"));

        if (gig.status !== 'paused') {
            return next(createError(400, "Only paused gigs can be resumed"));
        }

        // Enforce maximum of 5 active gigs per seller
        const activeGigCount = await Gig.countDocuments({ userId: gig.userId, status: 'active' });
        if (activeGigCount >= 5) {
            return next(createError(400, "You can only have up to 5 active gigs. Please pause another gig before resuming this one."));
        }

        const updatedGig = await Gig.findByIdAndUpdate(
            req.params.id,
            { $set: { status: 'active' } },
            { new: true }
        );

        res.status(200).json({
            message: "Gig resumed successfully",
            gig: updatedGig
        });
    } catch (err) {
        next(err);
    }
};

// ... (rest of the code remains the same)