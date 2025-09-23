import axios from "axios";
import createError from "../utils/createError.js";
import Order from "../models/order.model.js";
import Gig from "../models/gig.model.js";
import crypto from "crypto";
import User from "../models/user.model.js";
import notificationService from "../services/notificationService.js";
import socketService from "../services/socketService.js";
import PlatformSettings from "../models/platformSettings.model.js";

export const intent = async (req, res, next) => {
  try {
    // Validate gig existence
    const gig = await Gig.findById(req.params.id);
    if (!gig) {
      return res.status(404).json({
        error: "Gig not found",
        message: "The service you're trying to order no longer exists or has been removed.",
        code: "GIG_NOT_FOUND"
      });
    }

    // Validate gig is active
    if (gig.status !== 'active') {
      return res.status(400).json({
        error: "Service unavailable",
        message: "This service is currently unavailable for ordering. Please try again later or contact the seller.",
        code: "GIG_INACTIVE",
        gigStatus: gig.status
      });
    }

    // Check if user is trying to order from themselves
    if (gig.userId === req.userId) {
      return res.status(400).json({
        error: "Invalid order",
        message: "You cannot order your own service. Please browse other services instead.",
        code: "SELF_ORDER_ATTEMPT"
      });
    }

    // Validate required email for payment
    if (!req.body.email) {
      return res.status(400).json({
        error: "Email required",
        message: "Email address is required to process the payment.",
        code: "EMAIL_REQUIRED"
      });
    }
    
    const reference = crypto.randomBytes(8).toString("hex");

    // Determine amount based on pricing mode (supports packages)
    const selectedPackage = (req.body.selectedPackage || '').toString().toLowerCase();
    const validPkgKeys = ['basic','standard','premium'];
    const isValidPkg = validPkgKeys.includes(selectedPackage);
    let amountNaira = gig.price;
    let packageDeliveryTime = null;
    let milestoneTotal = null;

    // Prefer milestone total when seller defined milestones on the gig
    if (gig.hasMilestones && Array.isArray(gig.milestones) && gig.milestones.length > 0) {
      milestoneTotal = gig.milestones.reduce((sum, m) => sum + (m.price || 0), 0);
      if (milestoneTotal && milestoneTotal > 0) {
        amountNaira = milestoneTotal;
      }
    } else if (gig.hasPackages && gig.packages && isValidPkg) {
      // Otherwise use selected package price
      const pkg = gig.packages[selectedPackage];
      if (pkg && pkg.enabled && typeof pkg.price === 'number' && pkg.price > 0) {
        amountNaira = pkg.price;
        if (typeof pkg.deliveryTime === 'number' && pkg.deliveryTime > 0) {
          packageDeliveryTime = pkg.deliveryTime;
        }
      }
    }

    // Payment initialization with enhanced error handling
    try {
      const response = await axios.post(
        "https://api.paystack.co/transaction/initialize",
        {
          email: req.body.email,
          amount: amountNaira * 100, // Paystack uses kobo
          reference, // use the reference for tracking
          callback_url: `${process.env.CLIENT_URL || 'http://localhost:5173'}/payment/success`, // frontend success page
          metadata: {
            gigId: gig._id,
            buyerId: req.userId,
            sellerId: gig.userId,
            gigTitle: gig.title,
            gigPrice: amountNaira,
            clientEmail: req.body.email,
            selectedPackage: isValidPkg ? selectedPackage : undefined,
            packageDeliveryTime: packageDeliveryTime || undefined,
            milestoneTotal: milestoneTotal || undefined
          },
        },
        {
          headers: {
            Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
            "Content-Type": "application/json",
          },
        }
      );

      // Add additional context to the response
      const enhancedResponse = {
        ...response.data,
        orderInfo: {
          gigId: gig._id,
          title: gig.title,
          price: amountNaira,
          seller: gig.userId,
          reference: reference
        }
      };

      res.status(200).json(enhancedResponse);

    } catch (paystackError) {
      console.error('Paystack initialization error:', paystackError.response?.data || paystackError.message);
      
      return res.status(500).json({
        error: "Payment initialization failed",
        message: "Unable to initialize payment at this time. Please try again in a few moments.",
        code: "PAYMENT_INIT_FAILED",
        details: paystackError.response?.data?.message || "Payment service temporarily unavailable"
      });
    }

  } catch (err) {
    console.error('Order intent creation error:', err);
    
    // Provide user-friendly error messages
    if (err.name === 'ValidationError') {
      return res.status(400).json({
        error: "Validation error",
        message: "Invalid order data provided. Please check your input and try again.",
        code: "VALIDATION_ERROR"
      });
    }

    if (err.code === 'NETWORK_ERROR') {
      return res.status(503).json({
        error: "Service temporarily unavailable",
        message: "Unable to process your order right now. Please try again in a few minutes.",
        code: "SERVICE_UNAVAILABLE"
      });
    }

    // Default error response
    return res.status(500).json({
      error: "Order creation failed",
      message: "An unexpected error occurred while creating your order. Please try again.",
      code: "ORDER_CREATION_ERROR"
    });
  }
};

export const verifyPayment = async (req, res) => {
  const { reference } = req.params;

  try {
    const verifyRes = await axios.get(
      `https://api.paystack.co/transaction/verify/${reference}`,
      {
        headers: {
          Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`
        }
      }
    );

    if (verifyRes.data.data.status === "success") {
      const metadata = verifyRes.data.data.metadata;
      const amount = verifyRes.data.data.amount / 100; // Convert from kobo to naira
      
      // CRITICAL: Check if order already exists to prevent duplicates
      const existingOrder = await Order.findOne({ reference: reference });
      if (existingOrder) {
        console.log("🔄 Order already exists for reference:", reference);
        return res.json({ 
          status: "success",
          message: "Payment already verified and order exists.",
          orderId: existingOrder._id,
          autoReleaseDate: existingOrder.autoReleaseDate,
          isExisting: true
        });
      }
      
      // Get gig details for order creation
      const gig = await Gig.findById(metadata.gigId);
      if (!gig) {
        return res.status(404).json({ 
          status: "error", 
          message: "Gig not found" 
        });
      }

      console.log("✅ Creating new order for reference:", reference);
      
      // CREATE ORDER ONLY NOW AFTER SUCCESSFUL PAYMENT
      const newOrder = new Order({
        gigId: gig._id,
        img: gig.cover,
        title: gig.title,
        buyerId: metadata.buyerId,
        sellerId: metadata.sellerId,
        price: amount,
        reference: reference,
        status: "in progress",
        paymentStatus: "paid",
        escrowStatus: "funded", // CRITICAL: Funds held in escrow, not released
        paidAt: new Date(),
      });

      // Calculate auto-release and review windows using gig delivery time for better alignment
      const MS_PER_DAY = 24 * 60 * 60 * 1000;

      // Platform settings
      let autoReleaseDays = amount >= 50000 ? 14 : 7;
      let reviewDays = 3; // for non-milestone gigs: client review window after work submission
      let holdDays = 3;   // for milestone gigs: hold window after last due date
      try {
        const settings = await PlatformSettings.findOne().lean();
        autoReleaseDays = settings?.disputes?.autoReleaseAfterDays ?? autoReleaseDays;
        reviewDays = settings?.disputes?.clientReviewWindowDays ?? settings?.disputes?.escrowHoldDays ?? reviewDays;
        holdDays = settings?.disputes?.escrowHoldDays ?? holdDays;
      } catch (e) {
        // keep fallbacks
      }

      const paidAt = newOrder.paidAt || new Date();
      let autoReleaseDate;

      if (gig.hasMilestones && Array.isArray(gig.milestones) && gig.milestones.length > 0) {
        // Auto-create order milestones based on seller-defined gig milestones
        const sorted = [...gig.milestones].sort((a, b) => (a.order || 1) - (b.order || 1));
        let accumulatedDays = 0;
        const formattedMilestones = sorted.map((m) => {
          const days = Number(m.deliveryTime) || 0;
          accumulatedDays += days;
          const dueDate = new Date(paidAt.getTime() + accumulatedDays * MS_PER_DAY);
          return {
            title: m.title,
            description: m.description,
            amount: m.price,
            dueDate,
            status: "pending",
            deliverables: []
          };
        });

        const latestDue = formattedMilestones.reduce((max, m) => (m.dueDate && m.dueDate > max ? m.dueDate : max), new Date(0));
        if (latestDue && latestDue.getTime() > 0) {
          newOrder.expectedDeliveryDate = latestDue;
          autoReleaseDate = new Date(latestDue.getTime() + holdDays * MS_PER_DAY);
          newOrder.autoReleaseDate = autoReleaseDate;
          newOrder.clientReviewDeadline = autoReleaseDate;
        }
        newOrder.milestones = formattedMilestones;
        newOrder.protectionLevel = newOrder.price >= 100000 ? "enhanced" : "standard";
      } else {
        // Non-milestone gigs: derive expected delivery and review-based auto-release
        let expectedDeliveryDays = null;
        if (gig.hasPackages && gig.packages) {
          const candidates = ['basic', 'standard', 'premium']
            .map(k => gig.packages[k])
            .filter(p => p && p.enabled && typeof p.deliveryTime === 'number' && p.deliveryTime > 0)
            .map(p => p.deliveryTime);
          if (candidates.length > 0) expectedDeliveryDays = Math.min(...candidates);
        } else if (typeof gig.deliveryTime === 'number' && gig.deliveryTime > 0) {
          expectedDeliveryDays = gig.deliveryTime;
        }

        const expectedDeliveryDate = expectedDeliveryDays
          ? new Date(paidAt.getTime() + expectedDeliveryDays * MS_PER_DAY)
          : null;
        if (expectedDeliveryDate) {
          newOrder.expectedDeliveryDate = expectedDeliveryDate;
        }

        const baseDate = expectedDeliveryDate || new Date(paidAt.getTime() + autoReleaseDays * MS_PER_DAY);
        autoReleaseDate = new Date(baseDate.getTime() + reviewDays * MS_PER_DAY);
        newOrder.autoReleaseDate = autoReleaseDate;
        newOrder.clientReviewDeadline = autoReleaseDate;
      }

      try {
        await newOrder.save();
        console.log("✅ Order created successfully:", newOrder._id);

        // Send notifications to seller and buyer
        try {
          const [buyer, seller] = await Promise.all([
            User.findById(metadata.buyerId, "username"),
            User.findById(metadata.sellerId, "username")
          ]);

          // Persist notifications in DB
          await notificationService.notifyNewOrder(newOrder, seller, buyer);

          // Real-time toast for seller (new order)
          socketService.sendNotificationToUser(metadata.sellerId, {
            title: "New Order Received!",
            body: `You received a new order for "${gig.title}" from ${buyer?.username || "a buyer"}`,
            type: "order",
            data: { action: "open_order", orderId: newOrder._id }
          });

          // Real-time toast for buyer (order confirmed)
          socketService.sendNotificationToUser(metadata.buyerId, {
            title: "Order Confirmed",
            body: `Your order "${gig.title}" has been confirmed and is being processed`,
            type: "order",
            data: { action: "open_order", orderId: newOrder._id }
          });
        } catch (notifyError) {
          console.log("Order notification dispatch failed:", notifyError?.message || notifyError);
        }
      } catch (saveError) {
        // Handle duplicate key error gracefully
        if (saveError.code === 11000 && saveError.keyPattern?.reference) {
          console.log("🔄 Duplicate order detected during save, fetching existing order");
          const existingOrder = await Order.findOne({ reference: reference });
          return res.json({ 
            status: "success",
            message: "Payment already verified and order exists.",
            orderId: existingOrder._id,
            autoReleaseDate: existingOrder.autoReleaseDate,
            isExisting: true
          });
        }
        throw saveError; // Re-throw other errors
      }

      res.json({ 
        status: "success",
        message: "Payment successful! Order created and funds held securely in escrow. Funds will be released when work is delivered and approved.",
        orderId: newOrder._id,
        autoReleaseDate: autoReleaseDate
      });
    } else {
      res.json({ 
        status: "failed",
        message: "Payment verification failed"
      });
    }
  } catch (error) {
    console.error("Payment verification error:", error);
    res.status(500).json({ 
      status: "error", 
      message: "Payment verification failed" 
    });
  }
};


// export const createOrder = async (req,res,next)=>{
//     try {

//         const gig = await Gig.findById(req.params.gigId);

//         const newOrder = new Order({
//             gigId: gig._id,
//             img: gig.cover,
//             title: gig.title,
//             buyerId: req.userId,
//             sellerId: gig.userId,
//             price: gig.price,
//             payment_intent: "temporary",

//         });

//         await newOrder.save();
//         res.status(200).send("successful");

//     } catch (err) {
//         next(err)
//     }
    
// }

export const getOrders = async (req, res, next) => {
  try {
    // Handle freelancer query parameter
    const { freelancer } = req.query;
    
    let query = {};
    if (freelancer) {
      // For freelancer dashboard - get orders for specific freelancer
      query = { sellerId: freelancer };
    } else {
      // Regular order list - get orders for current user
      query = req.isSeller ? { sellerId: req.userId } : { buyerId: req.userId };
    }

    const orders = await Order.find(query);

    // Get unique user IDs (both sellers and buyers)
    const userIds = [
      ...new Set(orders.flatMap(order => [order.sellerId, order.buyerId])),
    ];

    // Fetch their usernames
    const users = await User.find(
      { _id: { $in: userIds } },
      { username: 1 } // only fetch username
    );

    // Create a lookup object: { userId: username }
    const userMap = {};
    users.forEach(user => {
      userMap[user._id.toString()] = user.username;
    });

    // Attach usernames to each order
    const ordersWithUsernames = orders.map(order => ({
      ...order.toObject(),
      sellerUsername: userMap[order.sellerId] || "N/A",
      buyerUsername: userMap[order.buyerId] || "N/A",
    }));

    res.status(200).json(ordersWithUsernames);
  } catch (err) {
    next(err);
  }
};

// WORK DELIVERY SYSTEM - FRAUD PREVENTION CORE

// 1. Freelancer submits work (with file attachments)
export const submitWork = async (req, res, next) => {
  try {
    const { orderId } = req.params;
    const { description, deliverableUrls } = req.body;

    const order = await Order.findById(orderId);
    if (!order) return next(createError(404, "Order not found"));

    // Prevent using whole-order submission on milestone-based projects
    if (order.milestones && order.milestones.length > 0) {
      return next(createError(400, "This order uses milestones. Please submit work for the specific milestone."));
    }

    // Verify freelancer owns this order
    if (order.sellerId !== req.userId) {
      return next(createError(403, "You are not authorized to submit work for this order"));
    }

    // Verify order is paid and in progress OR is work_submitted with no deliverables (recovery case)
    const canSubmit = order.escrowStatus === "funded" || 
                     (order.escrowStatus === "work_submitted" && (!order.deliverables || order.deliverables.length === 0));
    
    if (!canSubmit) {
      return next(createError(400, "Order payment must be confirmed before submitting work"));
    }

    // Update order with submitted work
    const now = new Date();
    const updateData = {
      escrowStatus: "work_submitted",
      status: "completed", // Work submitted, awaiting review
      workSubmittedAt: now,
      freelancerNotes: description
    };

    // VALIDATE: Ensure deliverables are provided (prevent empty work submission)
    if (!deliverableUrls || !Array.isArray(deliverableUrls) || deliverableUrls.length === 0) {
      return next(createError(400, "At least one deliverable file must be uploaded to submit work"));
    }

    // Add deliverable files if provided - WITH PREVIEW PROTECTION
    if (deliverableUrls && Array.isArray(deliverableUrls)) {
      // Calculate correct revision number based on distinct submission rounds
      const existingRevisions = order.deliverables ? 
        [...new Set(order.deliverables.map(d => d.revisionNumber))] : [];
      const nextRevisionNumber = existingRevisions.length > 0 ? 
        Math.max(...existingRevisions) + 1 : 1;
        
      const newDeliverables = deliverableUrls.map(url => ({
        // Original file data (from upload service)
        fileUrl: url.previewUrl || url.fileUrl, // Show preview version by default
        finalUrl: url.originalUrl || url.fileUrl, // Store final version separately
        previewUrl: url.previewUrl,
        originalName: url.originalName,
        filename: url.filename,
        fileSize: url.previewFileSize || url.fileSize,
        finalFileSize: url.originalFileSize || url.fileSize,
        description: url.description,
        submittedAt: new Date(),
        revisionNumber: nextRevisionNumber, // Same revision number for all files in this submission
        
        // PREVIEW PROTECTION SETTINGS
        isPreview: true,
        accessLevel: 'preview_only', // Client can only access previews until payment approved
        downloadCount: 0,
        lastAccessedAt: null
      }));
      
      // If first submission, create new deliverables array
      // If revision, push to existing deliverables
      updateData.$push = { deliverables: { $each: newDeliverables } };
    }

    // Ensure client review deadline gives the buyer adequate time after submission
    try {
      const settings = await PlatformSettings.findOne().lean();
      const reviewDays = settings?.disputes?.clientReviewWindowDays ?? settings?.disputes?.escrowHoldDays ?? 3;
      const proposedDeadline = new Date(now.getTime() + reviewDays * 24 * 60 * 60 * 1000);
      // Do not shorten an existing future deadline; guarantee at least reviewDays after submission
      const effectiveDeadline = (order.clientReviewDeadline && order.clientReviewDeadline > proposedDeadline)
        ? order.clientReviewDeadline
        : proposedDeadline;
      updateData.clientReviewDeadline = effectiveDeadline;
      updateData.autoReleaseDate = effectiveDeadline;
    } catch (e) {
      const fallback = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
      updateData.clientReviewDeadline = order.clientReviewDeadline && order.clientReviewDeadline > fallback ? order.clientReviewDeadline : fallback;
      updateData.autoReleaseDate = updateData.clientReviewDeadline;
    }

    const updatedOrder = await Order.findByIdAndUpdate(orderId, updateData, { new: true });

    // Notify client that work has been submitted
    res.status(200).json({
      message: "Work submitted successfully! Client will be notified to review.",
      order: updatedOrder,
      nextSteps: "The client has until " + updatedOrder.clientReviewDeadline + " to review and approve your work."
    });

  } catch (err) {
    next(err);
  }
};

// 2. Client approves work and releases payment (CRITICAL FRAUD PREVENTION)
export const approveWork = async (req, res, next) => {
  try {
    const { orderId } = req.params;
    const { rating, feedback } = req.body;

    const order = await Order.findById(orderId);
    if (!order) return next(createError(404, "Order not found"));

    // Prevent using whole-order approval on milestone-based projects
    if (order.milestones && order.milestones.length > 0) {
      return next(createError(400, "This order uses milestones. Please approve the specific milestone instead."));
    }

    // Verify client owns this order
    if (order.buyerId !== req.userId) {
      return next(createError(403, "You are not authorized to approve this order"));
    }

    // Verify work has been submitted
    if (order.escrowStatus !== "work_submitted") {
      return next(createError(400, "No work has been submitted for approval"));
    }

    // RELEASE PAYMENT FROM ESCROW - FRAUD PREVENTION CHECKPOINT
    // AND UNLOCK FULL ACCESS TO DELIVERABLES
    const releaseData = {
      escrowStatus: "released",
      status: "completed",
      isCompleted: true, // NOW payment is completed
      approvedAt: new Date(),
      releasedAt: new Date(),
      clientNotes: feedback
    };

    // CRITICAL: Grant full access to final deliverables after payment approval
    if (order.deliverables && order.deliverables.length > 0) {
      order.deliverables.forEach((deliverable, index) => {
        releaseData[`deliverables.${index}.accessLevel`] = 'full_access';
        releaseData[`deliverables.${index}.isPreview`] = false;
        releaseData[`deliverables.${index}.fileUrl`] = deliverable.finalUrl || deliverable.fileUrl;
        releaseData[`deliverables.${index}.fileSize`] = deliverable.finalFileSize || deliverable.fileSize;
      });
    }

    const updatedOrder = await Order.findByIdAndUpdate(orderId, { $set: releaseData }, { new: true });

    // Update freelancer stats
    await User.findByIdAndUpdate(order.sellerId, {
      $inc: { 
        totalOrders: 1,
        completionRate: 1 // This should be calculated as percentage in production
      }
    });

    // Send notifications about order completion/delivery
    try {
      const [buyer, seller] = await Promise.all([
        User.findById(order.buyerId, "username"),
        User.findById(order.sellerId, "username")
      ]);

      // Persist notifications in DB
      await notificationService.notifyOrderCompletion(order, seller, buyer);

      // Real-time toast for buyer
      socketService.sendNotificationToUser(order.buyerId, {
        title: "Order Delivered!",
        body: `Your order "${order.title}" has been completed by ${seller?.username || "the seller"}`,
        type: "order",
        data: { action: "open_order", orderId: order._id }
      });

      // Real-time toast for seller
      socketService.sendNotificationToUser(order.sellerId, {
        title: "Order Delivered",
        body: `Successfully delivered "${order.title}" to ${buyer?.username || "the buyer"}`,
        type: "order",
        data: { action: "open_order", orderId: order._id }
      });
    } catch (notifyError) {
      console.log("Order completion notification dispatch failed:", notifyError?.message || notifyError);
    }

    res.status(200).json({
      message: "Work approved! Payment has been released to the freelancer.",
      order: updatedOrder,
      status: "Payment released successfully"
    });

  } catch (err) {
    next(err);
  }
};

// 3. Client requests revisions instead of approving
export const requestRevision = async (req, res, next) => {
  try {
    const { orderId } = req.params;
    const { reason, details } = req.body;

    const order = await Order.findById(orderId);
    if (!order) return next(createError(404, "Order not found"));

    // Prevent using whole-order revision on milestone-based projects
    if (order.milestones && order.milestones.length > 0) {
      return next(createError(400, "This order uses milestones. Please request a revision on the specific milestone."));
    }

    // Verify client owns this order
    if (order.buyerId !== req.userId) {
      return next(createError(403, "You are not authorized to request revisions for this order"));
    }

    // Verify work has been submitted
    if (order.escrowStatus !== "work_submitted") {
      return next(createError(400, "No work has been submitted yet"));
    }

    // Add revision request
    const revisionRequest = {
      reason,
      details,
      requestedAt: new Date(),
      requestedBy: req.userId
    };

    const updatedOrder = await Order.findByIdAndUpdate(
      orderId, 
      {
        $push: { revisionRequests: revisionRequest },
        escrowStatus: "funded", // Back to funded status for revision
        status: "in progress"
      },
      { new: true }
    );

    res.status(200).json({
      message: "Revision requested. The freelancer will be notified to make changes.",
      order: updatedOrder
    });

  } catch (err) {
    next(err);
  }
};

// 4. Initiate dispute (FRAUD PROTECTION)
export const initiateDispute = async (req, res, next) => {
  try {
    const { orderId } = req.params;
    const { reason, details } = req.body;

    const order = await Order.findById(orderId);
    if (!order) return next(createError(404, "Order not found"));

    // Verify user is part of this order
    if (order.buyerId !== req.userId && order.sellerId !== req.userId) {
      return next(createError(403, "You are not authorized to dispute this order"));
    }

    // Prevent multiple disputes
    if (order.disputeStatus !== "none") {
      return next(createError(400, "A dispute is already active for this order"));
    }

    // Update order with dispute information
    const disputeData = {
      disputeStatus: "pending",
      disputeReason: reason,
      disputeDetails: details,
      disputeInitiatedBy: req.userId,
      disputeInitiatedAt: new Date(),
      escrowStatus: "disputed",
      status: "disputed"
    };

    const updatedOrder = await Order.findByIdAndUpdate(orderId, disputeData, { new: true });

    res.status(200).json({
      message: "Dispute initiated. Our support team will review within 24-48 hours.",
      order: updatedOrder,
      disputeId: orderId,
      nextSteps: "Both parties will be contacted for evidence and statements."
    });

  } catch (err) {
    next(err);
  }
};

// 5. Auto-release payment if client doesn't respond (PREVENTS PAYMENT HOLDING ABUSE)
export const checkAutoRelease = async (req, res, next) => {
  try {
    // Find orders where work is submitted but auto-release date has passed
    const ordersForAutoRelease = await Order.find({
      escrowStatus: "work_submitted",
      autoReleaseDate: { $lte: new Date() },
      disputeStatus: "none"
    });

    let releasedCount = 0;

    for (const order of ordersForAutoRelease) {
      // Harden: if the order has milestones, do not auto-release early unless past the extended window
      if (order.milestones && order.milestones.length > 0) {
        // Compute latest milestone due date
        const latestDue = order.milestones.reduce((max, m) => (m.dueDate && m.dueDate > max ? m.dueDate : max), new Date(0));
        let holdDays = 3;
        try {
          const settings = await PlatformSettings.findOne().lean();
          holdDays = settings?.disputes?.escrowHoldDays ?? 3;
        } catch (e) {}
        const extendedCutoff = latestDue && latestDue.getTime() > 0
          ? new Date(new Date(latestDue).getTime() + holdDays * 24 * 60 * 60 * 1000)
          : null;

        if (extendedCutoff && new Date() < extendedCutoff) {
          // Skip auto-release for this order until after the milestone window passes
          continue;
        }
      }
      await Order.findByIdAndUpdate(order._id, {
        escrowStatus: "released",
        status: "completed",
        isCompleted: true,
        releasedAt: new Date(),
        adminNotes: "Auto-released due to client non-response within deadline"
      });

      // Update freelancer stats
      await User.findByIdAndUpdate(order.sellerId, {
        $inc: { totalOrders: 1 }
      });

      releasedCount++;
    }

    res.status(200).json({
      message: `Auto-release check completed. ${releasedCount} payments released.`,
      releasedOrders: releasedCount
    });

  } catch (err) {
    next(err);
  }
};

// Recovery endpoint: Reset stuck orders for freelancers to re-submit work
export const resetOrderForResubmission = async (req, res, next) => {
  try {
    const { orderId } = req.params;

    const order = await Order.findById(orderId);
    if (!order) return next(createError(404, "Order not found"));

    // Verify freelancer owns this order
    if (order.sellerId !== req.userId) {
      return next(createError(403, "You are not authorized to reset this order"));
    }

    // Only allow reset if order is stuck in work_submitted with no deliverables
    if (order.escrowStatus !== "work_submitted" || (order.deliverables && order.deliverables.length > 0)) {
      return next(createError(400, "Order reset is only allowed for work submissions without deliverables"));
    }

    // Reset order back to funded status
    const updatedOrder = await Order.findByIdAndUpdate(
      orderId, 
      { 
        escrowStatus: "funded",
        status: "in progress",
        workSubmittedAt: null,
        freelancerNotes: null
      }, 
      { new: true }
    );

    res.status(200).json({
      message: "Order reset successfully. You can now re-submit your work with proper file uploads.",
      order: updatedOrder,
      nextSteps: "Please ensure all files are uploaded successfully before submitting work again."
    });

  } catch (err) {
    next(err);
  }
};

// 6. Get single order details (for order management UI)
export const getOrderDetails = async (req, res, next) => {
  try {
    const { orderId } = req.params;
    
    const order = await Order.findById(orderId);
    if (!order) return next(createError(404, "Order not found"));

    // Verify user has access to this order
    if (order.buyerId !== req.userId && order.sellerId !== req.userId) {
      return next(createError(403, "You don't have access to this order"));
    }

    // Get usernames and gig info
    const [buyer, seller, gig] = await Promise.all([
      User.findById(order.buyerId, { username: 1, img: 1 }),
      User.findById(order.sellerId, { username: 1, img: 1 }),
      Gig.findById(order.gigId, { hasMilestones: 1 })
    ]);

    const orderDetails = {
      ...order.toObject(),
      buyerInfo: buyer,
      sellerInfo: seller,
      canSubmitWork: order.sellerId === req.userId && order.escrowStatus === "funded" && !(order.milestones && order.milestones.length > 0),
      canApprove: order.buyerId === req.userId && order.escrowStatus === "work_submitted" && !(order.milestones && order.milestones.length > 0),
      canRequestRevision: order.buyerId === req.userId && order.escrowStatus === "work_submitted" && !(order.milestones && order.milestones.length > 0),
      canDispute: order.escrowStatus !== "released" && order.disputeStatus === "none",
      hasMilestones: order.milestones && order.milestones.length > 0,
      gigHasSellerMilestones: !!gig?.hasMilestones
    };

    res.status(200).json(orderDetails);

  } catch (err) {
    next(err);
  }
};

// MILESTONE PAYMENT SYSTEM (FRAUD PREVENTION FOR LARGE PROJECTS)

// 7. Create milestones for large projects (Called after payment - orders only exist after successful payment)
export const createMilestones = async (req, res, next) => {
  try {
    const { orderId } = req.params;
    const { milestones } = req.body;

    const order = await Order.findById(orderId);
    if (!order) return next(createError(404, "Order not found"));

    // Verify client owns this order
    if (order.buyerId !== req.userId) {
      return next(createError(403, "Only the client can create milestones"));
    }

    // Prevent creating custom milestones for orders based on seller-defined milestone gigs
    try {
      const gig = await Gig.findById(order.gigId).lean();
      if (gig?.hasMilestones) {
        return next(createError(400, "This order is based on a gig with seller-defined milestones. Custom milestones cannot be created for this order."));
      }
    } catch (e) {
      // If gig lookup fails unexpectedly, block to be safe
      return next(createError(500, "Failed to verify gig milestone configuration"));
    }

    // Prevent re-creating milestones if they already exist on the order
    if (order.milestones && order.milestones.length > 0) {
      return next(createError(400, "Milestones already exist for this order and cannot be recreated."));
    }

    // Orders are now only created after payment, so this check is no longer needed
    // Payment is always completed when order exists

    // Validate milestone amounts sum to order total
    const totalMilestoneAmount = milestones.reduce((sum, milestone) => sum + milestone.amount, 0);
    if (Math.abs(totalMilestoneAmount - order.price) > 0.01) {
      return next(createError(400, `Milestone amounts (₦${totalMilestoneAmount}) must equal order total (₦${order.price})`));
    }

    // Format milestones with proper structure
    const formattedMilestones = milestones.map((milestone, index) => ({
      title: milestone.title,
      description: milestone.description,
      amount: milestone.amount,
      dueDate: new Date(milestone.dueDate),
      status: "pending",
      deliverables: [],
    }));

    // Extend auto-release date to cover the longest milestone due date + hold period
    let holdDays = 3;
    try {
      const settings = await PlatformSettings.findOne().lean();
      holdDays = settings?.disputes?.escrowHoldDays ?? 3;
    } catch (e) {
      holdDays = 3;
    }

    const latestDue = formattedMilestones.reduce((max, m) => (m.dueDate && m.dueDate > max ? m.dueDate : max), new Date(0));
    const extendedAutoRelease = latestDue && latestDue.getTime() > 0
      ? new Date(new Date(latestDue).getTime() + holdDays * 24 * 60 * 60 * 1000)
      : null;

    // Choose the later of the existing autoReleaseDate and the extended one
    const newAutoRelease = extendedAutoRelease && order.autoReleaseDate
      ? (extendedAutoRelease > order.autoReleaseDate ? extendedAutoRelease : order.autoReleaseDate)
      : (extendedAutoRelease || order.autoReleaseDate);

    const updateDoc = { 
      milestones: formattedMilestones,
      protectionLevel: order.price >= 100000 ? "enhanced" : "standard"
    };
    if (newAutoRelease) {
      updateDoc.autoReleaseDate = newAutoRelease;
      updateDoc.clientReviewDeadline = newAutoRelease;
    }
    if (latestDue && latestDue.getTime() > 0) {
      updateDoc.expectedDeliveryDate = latestDue;
    }

    const updatedOrder = await Order.findByIdAndUpdate(
      orderId,
      updateDoc,
      { new: true }
    );

    res.status(200).json({
      message: "Milestones created successfully! Proceed with payment to start the project.",
      order: updatedOrder,
      totalMilestones: formattedMilestones.length,
      protectionLevel: updatedOrder.protectionLevel
    });

  } catch (err) {
    next(err);
  }
};

// 8. Submit milestone deliverables (Freelancer)  
export const submitMilestoneWork = async (req, res, next) => {
  try {
    const { orderId, milestoneIndex } = req.params;
    const { description, deliverableUrls } = req.body;

    const order = await Order.findById(orderId);
    if (!order) return next(createError(404, "Order not found"));

    // Verify freelancer owns this order
    if (order.sellerId !== req.userId) {
      return next(createError(403, "You are not authorized to submit work for this order"));
    }

    // Verify milestone exists and is in correct status
    const milestone = order.milestones[milestoneIndex];
    if (!milestone) {
      return next(createError(404, "Milestone not found"));
    }

    if (milestone.status !== "pending" && milestone.status !== "in_progress") {
      return next(createError(400, "This milestone is not available for submission"));
    }

    // Add deliverables to milestone - WITH PREVIEW PROTECTION
    const deliverables = deliverableUrls ? deliverableUrls.map(url => ({
      fileUrl: url.previewUrl || url.fileUrl, // Show preview version by default
      finalUrl: url.originalUrl || url.fileUrl, // Store final version separately
      previewUrl: url.previewUrl,
      originalName: url.originalName,
      filename: url.filename,
      fileSize: url.previewFileSize || url.fileSize,
      finalFileSize: url.originalFileSize || url.fileSize,
      description: url.description,
      submittedAt: new Date(),
      // PREVIEW PROTECTION SETTINGS
      isPreview: true,
      accessLevel: 'preview_only', // Client can only access previews until milestone payment approved
      downloadCount: 0,
      lastAccessedAt: null
    })) : [];

    // Use $set to properly update the specific milestone in the array
    const updateQuery = {};
    updateQuery[`milestones.${milestoneIndex}.status`] = "submitted";
    updateQuery[`milestones.${milestoneIndex}.deliverables`] = deliverables;
    updateQuery[`milestones.${milestoneIndex}.submittedAt`] = new Date();
    
    const updatedOrder = await Order.findByIdAndUpdate(
      orderId,
      { $set: updateQuery },
      { new: true, runValidators: true }
    ).exec();

    if (!updatedOrder) {
      return next(createError(500, "Failed to update order"));
    }

    res.status(200).json({
      message: `Milestone ${parseInt(milestoneIndex) + 1} submitted successfully! Client will review the deliverables.`,
      order: updatedOrder,
      milestone: updatedOrder.milestones[milestoneIndex]
    });

  } catch (err) {
    next(err);
  }
};

// 9. Approve milestone and release payment (Client)
export const approveMilestone = async (req, res, next) => {
  try {
    const { orderId, milestoneIndex } = req.params;
    const { feedback } = req.body;

    const order = await Order.findById(orderId);
    if (!order) return next(createError(404, "Order not found"));

    // Verify client owns this order
    if (order.buyerId !== req.userId) {
      return next(createError(403, "You are not authorized to approve milestones for this order"));
    }

    // Verify milestone exists and work has been submitted
    const milestone = order.milestones[milestoneIndex];
    if (!milestone) {
      return next(createError(404, "Milestone not found"));
    }

    if (milestone.status !== "submitted") {
      return next(createError(400, "No work has been submitted for this milestone"));
    }

    // Use $set to properly update the specific milestone in the array (same fix as submitMilestoneWork)
    const updateQuery = {};
    updateQuery[`milestones.${milestoneIndex}.status`] = "approved";
    updateQuery[`milestones.${milestoneIndex}.approvedAt`] = new Date();
    updateQuery[`milestones.${milestoneIndex}.paidAt`] = new Date();
    // Persist client feedback if provided
    if (feedback) {
      updateQuery[`milestones.${milestoneIndex}.clientFeedback`] = feedback;
    }

    // CRITICAL: Grant full access to final deliverables for approved milestone
    if (milestone.deliverables && milestone.deliverables.length > 0) {
      milestone.deliverables.forEach((deliverable, delivIndex) => {
        updateQuery[`milestones.${milestoneIndex}.deliverables.${delivIndex}.accessLevel`] = 'full_access';
        updateQuery[`milestones.${milestoneIndex}.deliverables.${delivIndex}.isPreview`] = false;
        updateQuery[`milestones.${milestoneIndex}.deliverables.${delivIndex}.fileUrl`] = deliverable.finalUrl || deliverable.fileUrl;
        updateQuery[`milestones.${milestoneIndex}.deliverables.${delivIndex}.fileSize`] = deliverable.finalFileSize || deliverable.fileSize;
      });
    }

    // First, update the specific milestone
    let updatedOrder = await Order.findByIdAndUpdate(
      orderId,
      { $set: updateQuery },
      { new: true, runValidators: true }
    ).exec();

    // Check if all milestones are now completed
    const allMilestonesCompleted = updatedOrder.milestones.every(m => m.status === "approved");
    
    // If all milestones completed, mark entire order as completed
    if (allMilestonesCompleted) {
      const orderCompletionUpdate = {
        status: "completed",
        isCompleted: true,
        escrowStatus: "released", 
        completedAt: new Date(),
        releasedAt: new Date()
      };

      updatedOrder = await Order.findByIdAndUpdate(
        orderId, 
        { $set: orderCompletionUpdate }, 
        { new: true, runValidators: true }
      ).exec();
    }

    // Update freelancer stats for milestone completion
    await User.findByIdAndUpdate(order.sellerId, {
      $inc: { 
        totalOrders: allMilestonesCompleted ? 1 : 0 // Only increment when entire project completes
      }
    });

    const approvedMilestone = updatedOrder.milestones[milestoneIndex];
    const responseMessage = allMilestonesCompleted 
      ? "Final milestone approved! Project completed and full payment released."
      : `Milestone ${parseInt(milestoneIndex) + 1} approved! Payment of ₦${approvedMilestone.amount} released.`;

    res.status(200).json({
      message: responseMessage,
      order: updatedOrder,
      milestone: approvedMilestone,
      projectCompleted: allMilestonesCompleted,
      remainingMilestones: updatedOrder.milestones.filter(m => m.status === "pending" || m.status === "in_progress").length
    });

  } catch (err) {
    next(err);
  }
};

// 10. Request milestone revision (Client)
export const requestMilestoneRevision = async (req, res, next) => {
  try {
    const { orderId, milestoneIndex } = req.params;
    const { reason, details } = req.body;

    const order = await Order.findById(orderId);
    if (!order) return next(createError(404, "Order not found"));

    // Verify client owns this order
    if (order.buyerId !== req.userId) {
      return next(createError(403, "You are not authorized to request revisions for this order"));
    }

    // Verify milestone exists and work has been submitted
    const milestone = order.milestones[milestoneIndex];
    if (!milestone) {
      return next(createError(404, "Milestone not found"));
    }

    if (milestone.status !== "submitted") {
      return next(createError(400, "No work has been submitted for this milestone"));
    }

    // Use $set to properly update the specific milestone status (same fix as approveMilestone)
    const milestoneUpdateQuery = {};
    milestoneUpdateQuery[`milestones.${milestoneIndex}.status`] = "in_progress";

    // Add revision request to main order  
    const revisionRequest = {
      reason: `Milestone ${parseInt(milestoneIndex) + 1}: ${reason}`,
      details,
      requestedAt: new Date(),
      requestedBy: req.userId
    };

    const updatedOrder = await Order.findByIdAndUpdate(
      orderId,
      {
        $set: milestoneUpdateQuery,
        $push: { revisionRequests: revisionRequest }
      },
      { new: true, runValidators: true }
    ).exec();

    const revisedMilestone = updatedOrder.milestones[milestoneIndex];

    res.status(200).json({
      message: `Revision requested for milestone ${parseInt(milestoneIndex) + 1}. Freelancer will be notified.`,
      order: updatedOrder,
      milestone: revisedMilestone
    });

  } catch (err) {
    next(err);
  }
};