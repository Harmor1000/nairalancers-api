import Order from '../models/order.model.js';
import createError from '../utils/createError.js';
import fileUploadService from '../services/fileUploadService.js';

/**
 * Middleware to control access to deliverable files
 * Prevents clients from accessing final versions until payment is approved
 */
export const checkDeliverableAccess = async (req, res, next) => {
  try {
    const { orderId, deliverableIndex } = req.params;
    const { fileType = 'preview' } = req.query; // 'preview' or 'final'
    const userId = req.userId;

    // Find the order
    const order = await Order.findById(orderId);
    if (!order) {
      return next(createError(404, "Order not found"));
    }

    // Check if user is part of this order
    const isClient = order.buyerId === userId;
    const isFreelancer = order.sellerId === userId;
    
    if (!isClient && !isFreelancer) {
      return next(createError(403, "You are not authorized to access these files"));
    }

    // Get the specific deliverable
    const deliverable = order.deliverables[deliverableIndex];
    if (!deliverable) {
      return next(createError(404, "Deliverable not found"));
    }

    // ACCESS CONTROL LOGIC
    
    // Freelancers always have full access to their own uploads
    if (isFreelancer) {
      // Generate secure URL for private files if needed
      let fileUrl = deliverable.finalUrl || deliverable.fileUrl;
      
      // If this is a private file (originalPublicId exists), generate signed URL
      if (deliverable.originalPublicId) {
        fileUrl = fileUploadService.generateSecureDownloadUrl(
          deliverable.originalPublicId, 
          'auto', 
          3600 // 1 hour expiration
        ) || fileUrl;
      }
      
      req.fileAccess = {
        canAccessFinal: true,
        fileUrl: fileUrl,
        deliverable: deliverable,
        isPrivateFile: !!deliverable.originalPublicId
      };
      return next();
    }

    // For clients, check payment status and access level
    if (isClient) {
      const hasFullAccess = order.escrowStatus === "released" && 
                           order.isCompleted === true && 
                           deliverable.accessLevel === "full_access";

      if (fileType === 'final' && !hasFullAccess) {
        return next(createError(403, 
          "Access to final deliverables requires payment approval. You can only view previews until payment is released."
        ));
      }

      // Determine which file URL to provide
      let fileUrl;
      if (fileType === 'final' && hasFullAccess) {
        fileUrl = deliverable.finalUrl || deliverable.fileUrl;
        
        // Generate secure URL for private files
        if (deliverable.originalPublicId) {
          fileUrl = fileUploadService.generateSecureDownloadUrl(
            deliverable.originalPublicId, 
            'auto', 
            3600 // 1 hour expiration
          ) || fileUrl;
        }
      } else {
        // Preview files are public, use direct URL
        fileUrl = deliverable.previewUrl || deliverable.fileUrl;
        
        // Ensure preview URL is publicly accessible
        if (deliverable.publicId) {
          fileUrl = fileUploadService.generatePreviewUrl(
            deliverable.publicId,
            'auto'
          ) || fileUrl;
        }
      }

      req.fileAccess = {
        canAccessFinal: hasFullAccess,
        fileUrl: fileUrl,
        deliverable: deliverable,
        accessLevel: deliverable.accessLevel
      };

      // Log access attempt
      if (fileType === 'final' && hasFullAccess) {
        await Order.findByIdAndUpdate(orderId, {
          $inc: { [`deliverables.${deliverableIndex}.downloadCount`]: 1 },
          $set: { [`deliverables.${deliverableIndex}.lastAccessedAt`]: new Date() }
        });
      }

      return next();
    }

    // Should not reach here, but safety fallback
    return next(createError(403, "Access denied"));

  } catch (error) {
    console.error('Error in deliverable access control:', error);
    return next(createError(500, "Internal server error"));
  }
};

/**
 * Middleware to control milestone deliverable access
 */
export const checkMilestoneDeliverableAccess = async (req, res, next) => {
  try {
    const { orderId, milestoneIndex, deliverableIndex } = req.params;
    const { fileType = 'preview' } = req.query;
    const userId = req.userId;

    const order = await Order.findById(orderId);
    if (!order) {
      return next(createError(404, "Order not found"));
    }

    const isClient = order.buyerId === userId;
    const isFreelancer = order.sellerId === userId;
    
    if (!isClient && !isFreelancer) {
      return next(createError(403, "You are not authorized to access these files"));
    }

    const milestone = order.milestones[milestoneIndex];
    if (!milestone) {
      return next(createError(404, "Milestone not found"));
    }

    const deliverable = milestone.deliverables[deliverableIndex];
    if (!deliverable) {
      return next(createError(404, "Deliverable not found"));
    }

    // Freelancers always have full access
    if (isFreelancer) {
      let fileUrl = deliverable.finalUrl || deliverable.fileUrl;
      
      // Generate secure URL for private files if needed
      if (deliverable.originalPublicId) {
        fileUrl = fileUploadService.generateSecureDownloadUrl(
          deliverable.originalPublicId, 
          'auto', 
          3600
        ) || fileUrl;
      }
      
      req.fileAccess = {
        canAccessFinal: true,
        fileUrl: fileUrl,
        deliverable: deliverable,
        isPrivateFile: !!deliverable.originalPublicId
      };
      return next();
    }

    // For clients, check if milestone is approved and paid
    if (isClient) {
      const hasFullAccess = milestone.status === "paid" && 
                           deliverable.accessLevel === "full_access";

      if (fileType === 'final' && !hasFullAccess) {
        return next(createError(403, 
          "Access to final milestone deliverables requires milestone payment approval."
        ));
      }

      let fileUrl;
      if (fileType === 'final' && hasFullAccess) {
        fileUrl = deliverable.finalUrl || deliverable.fileUrl;
      } else {
        fileUrl = deliverable.previewUrl || deliverable.fileUrl;
      }

      req.fileAccess = {
        canAccessFinal: hasFullAccess,
        fileUrl: fileUrl,
        deliverable: deliverable,
        accessLevel: deliverable.accessLevel
      };

      return next();
    }

    return next(createError(403, "Access denied"));

  } catch (error) {
    console.error('Error in milestone deliverable access control:', error);
    return next(createError(500, "Internal server error"));
  }
};

/**
 * Generate secure download URL with access control
 */
export const generateSecureDownloadUrl = async (req, res, next) => {
  try {
    const { fileAccess } = req;
    
    if (!fileAccess) {
      return next(createError(500, "File access information missing"));
    }

    // For preview files, return direct URL (public access)
    if (!fileAccess.canAccessFinal || fileAccess.isPreviewFile) {
      return res.json({
        downloadUrl: fileAccess.fileUrl,
        fileType: 'preview',
        expiresIn: null,
        accessLevel: fileAccess.accessLevel || 'preview_only',
        isWatermarked: true,
        isPublic: true
      });
    }

    // For final files, return signed URL (private access)
    return res.json({
      downloadUrl: fileAccess.fileUrl,
      fileType: 'final',
      expiresIn: fileAccess.isPrivateFile ? 3600 : null, // 1 hour for private files
      accessLevel: 'full_access',
      downloadCount: fileAccess.deliverable.downloadCount || 0,
      isWatermarked: false,
      isPrivate: fileAccess.isPrivateFile,
      isSignedUrl: fileAccess.isPrivateFile
    });

  } catch (error) {
    console.error('Error generating secure download URL:', error);
    return next(createError(500, "Failed to generate download URL"));
  }
};
