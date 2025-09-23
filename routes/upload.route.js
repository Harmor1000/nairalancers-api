import express from "express";
import { verifyToken } from "../middleware/jwt.js";
import { uploadMultiple, handleUploadError } from "../middleware/upload.js";
import fileUploadService from "../services/fileUploadService.js";
import Order from "../models/order.model.js";
import { 
  checkDeliverableAccess, 
  checkMilestoneDeliverableAccess, 
  generateSecureDownloadUrl 
} from "../middleware/deliverableAccess.js";

const router = express.Router();

// Upload multiple files endpoint (private by default)
router.post("/files", verifyToken, uploadMultiple, handleUploadError, async (req, res, next) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        error: "No files uploaded"
      });
    }

    // Determine folder and privacy based on request context
    const folder = req.query.folder || 'general';
    const isPrivate = req.query.private !== 'false'; // Private by default
    
    // Upload files using the file upload service
    const uploadResults = await fileUploadService.uploadMultipleFiles(req.files, folder, isPrivate);

    res.status(200).json({
      message: "Files uploaded successfully",
      files: uploadResults,
      privacy: {
        isPrivate: isPrivate,
        accessType: isPrivate ? 'private' : 'public'
      }
    });

  } catch (error) {
    console.error("❌ Upload error:", error);
    
    // Provide user-friendly error messages based on error type
    let userMessage = "Failed to upload files";
    let errorCode = "UPLOAD_FAILED";
    
    if (error.message.includes("File size too large")) {
      userMessage = error.message; // Use the detailed file size message
      errorCode = "FILE_TOO_LARGE";
    } else if (error.message.includes("public_id") && error.message.includes("is invalid")) {
      userMessage = "Invalid filename. Please rename your file to use only letters, numbers, dots, and hyphens.";
      errorCode = "INVALID_FILENAME";
    } else if (error.message.includes("Failed to process")) {
      userMessage = "File processing failed. The file may be corrupted or in an unsupported format.";
      errorCode = "PROCESSING_FAILED";
    } else if (error.message.includes("Cloudinary") || error.http_code) {
      // Include specific Cloudinary error details
      userMessage = `Upload failed: ${error.message || 'Storage service error'}`;
      errorCode = "STORAGE_FAILED";
    } else if (error.message.includes("ENOSPC")) {
      userMessage = "Server storage is full. Please contact support.";
      errorCode = "STORAGE_FULL";
    } else if (error.message.includes("timeout")) {
      userMessage = "Upload timeout. File may be too large or connection is slow.";
      errorCode = "TIMEOUT";
    } else {
      // For unknown errors, include the actual error message
      userMessage = `Upload failed: ${error.message}`;
    }
    
    res.status(500).json({
      error: userMessage,
      errorCode: errorCode,
      technical: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Upload single file endpoint (private by default)
router.post("/file", verifyToken, uploadMultiple, handleUploadError, async (req, res, next) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        error: "No file uploaded"
      });
    }

    // Determine folder and privacy based on request context
    const folder = req.query.folder || 'general';
    const isPrivate = req.query.private !== 'false'; // Private by default
    
    // Upload single file using the file upload service
    const file = req.files[0];
    const uploadResult = await fileUploadService.uploadFile(
      file.buffer, 
      file.originalname, 
      file.mimetype,
      folder,
      isPrivate
    );

    res.status(200).json({
      message: "File uploaded successfully",
      file: uploadResult,
      privacy: {
        isPrivate: isPrivate,
        accessType: isPrivate ? 'private' : 'public'
      }
    });

  } catch (error) {
    console.error("Upload error:", error);
    
    // Provide user-friendly error messages based on error type
    let userMessage = "Failed to upload file";
    let errorCode = "UPLOAD_FAILED";
    
    if (error.message.includes("File size too large")) {
      userMessage = error.message; // Use the detailed file size message
      errorCode = "FILE_TOO_LARGE";
    } else if (error.message.includes("public_id") && error.message.includes("is invalid")) {
      userMessage = "Invalid filename. Please rename your file to use only letters, numbers, dots, and hyphens.";
      errorCode = "INVALID_FILENAME";
    } else if (error.message.includes("Failed to process")) {
      userMessage = "File processing failed. The file may be corrupted or in an unsupported format.";
      errorCode = "PROCESSING_FAILED";
    } else if (error.message.includes("Cloudinary") || error.http_code) {
      // Include specific Cloudinary error details
      userMessage = `Upload failed: ${error.message || 'Storage service error'}`;
      errorCode = "STORAGE_FAILED";
    } else if (error.message.includes("ENOSPC")) {
      userMessage = "Server storage is full. Please contact support.";
      errorCode = "STORAGE_FULL";
    } else if (error.message.includes("timeout")) {
      userMessage = "Upload timeout. File may be too large or connection is slow.";
      errorCode = "TIMEOUT";
    } else {
      // For unknown errors, include the actual error message
      userMessage = `Upload failed: ${error.message}`;
    }
    
    res.status(500).json({
      error: userMessage,
      errorCode: errorCode,
      technical: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Upload deliverables with preview protection (for freelancer work submissions)
router.post("/deliverables", verifyToken, uploadMultiple, handleUploadError, async (req, res, next) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        error: "No files uploaded"
      });
    }

    const folder = 'deliverables';
    const deliverableResults = [];
    const failedUploads = [];

    // Process each file to create both preview and final versions
    for (const file of req.files) {
      try {
        const result = await fileUploadService.uploadDeliverable(
          file.buffer,
          file.originalname,
          file.mimetype,
          folder
        );

        deliverableResults.push({
          originalName: result.preview.originalFileName || file.originalname,
          filename: result.preview.fileName,
          // Return preview data for client display
          fileUrl: result.preview.fileUrl,
          previewUrl: result.preview.fileUrl,
          originalUrl: result.original.fileUrl,
          fileSize: result.preview.fileSize,
          previewFileSize: result.preview.fileSize,
          originalFileSize: result.original.fileSize,
          fileType: result.preview.fileType,
          originalFileType: file.mimetype,
          isPreview: true,
          isWatermarked: result.preview.isWatermarked,
          accessLevel: 'preview_only',
          accessType: 'public', // Preview is public
          originalAccessType: 'private', // Original is private
          publicId: result.preview.publicId,
          originalPublicId: result.original.publicId
        });
      } catch (uploadError) {
        console.error(`❌ Failed to upload ${file.originalname}:`, uploadError);
        
        // Provide specific error details for each failed file
        let specificError = uploadError.message || 'Upload failed';
        if (uploadError.message.includes("File size too large")) {
          specificError = `File too large: ${uploadError.message.split('File is ')[1] || 'exceeds 10MB limit'}`;
        } else if (uploadError.message.includes("public_id") && uploadError.message.includes("is invalid")) {
          specificError = "Invalid filename - please use only letters, numbers, dots, and hyphens";
        } else if (uploadError.http_code) {
          specificError = `Storage error: ${uploadError.message}`;
        }
        
        failedUploads.push({
          filename: file.originalname,
          error: specificError,
          fileSize: file.size ? `${(file.size / 1024 / 1024).toFixed(2)}MB` : 'unknown'
        });
      }
    }

    // If ANY uploads failed, return error and don't allow work submission
    if (failedUploads.length > 0) {
      console.error(`❌ Upload failed for ${failedUploads.length} out of ${req.files.length} files`);
      return res.status(400).json({
        error: `Upload failed for ${failedUploads.length} file(s). All files must upload successfully before submitting work.`,
        failedFiles: failedUploads,
        successfulUploads: deliverableResults.length,
        totalFiles: req.files.length
      });
    }

    // All uploads successful
    console.log(`✅ Successfully uploaded ${deliverableResults.length} deliverable files`);
    res.status(200).json({
      message: "All deliverables uploaded successfully with preview protection",
      files: deliverableResults,
      protection: {
        previewsGenerated: true,
        finalFilesProtected: true,
        accessPolicy: "Clients can only access previews until payment is approved"
      }
    });

  } catch (error) {
    console.error("❌ Deliverable upload error:", error);
    
    // Provide user-friendly error messages based on error type
    let userMessage = "Failed to upload deliverable files";
    let errorCode = "DELIVERABLE_UPLOAD_FAILED";
    
    if (error.message.includes("File size too large")) {
      userMessage = error.message; // Use the detailed file size message
      errorCode = "FILE_TOO_LARGE";
    } else if (error.message.includes("public_id") && error.message.includes("is invalid")) {
      userMessage = "Invalid filename. Please rename your file to use only letters, numbers, dots, and hyphens.";
      errorCode = "INVALID_FILENAME";
    } else if (error.message.includes("Failed to process")) {
      userMessage = "File processing failed. Please check that your files are not corrupted and are in supported formats.";
      errorCode = "PROCESSING_FAILED";
    } else if (error.message.includes("Cloudinary") || error.http_code) {
      // Include specific Cloudinary error details
      userMessage = `Upload failed: ${error.message || 'Storage service error'}`;
      errorCode = "STORAGE_FAILED";
    } else if (error.message.includes("watermark")) {
      userMessage = "Failed to create file preview. The file may be in an unsupported format for preview generation.";
      errorCode = "WATERMARK_FAILED";
    } else if (error.message.includes("ENOSPC")) {
      userMessage = "Server storage is full. Please contact support immediately.";
      errorCode = "STORAGE_FULL";
    } else if (error.message.includes("timeout")) {
      userMessage = "Upload timeout. Your files may be too large or your connection is slow. Try uploading smaller files or check your internet connection.";
      errorCode = "TIMEOUT";
    } else if (error.message.includes("Order not found")) {
      userMessage = "The specified order could not be found. Please verify the order ID and try again.";
      errorCode = "ORDER_NOT_FOUND";
    } else if (error.message.includes("permission") || error.message.includes("unauthorized")) {
      userMessage = "You don't have permission to upload to this order. Please contact the order owner.";
      errorCode = "PERMISSION_DENIED";
    } else {
      // For unknown errors, include the actual error message
      userMessage = `Upload failed: ${error.message}`;
    }
    
    res.status(500).json({
      error: userMessage,
      errorCode: errorCode,
      suggestion: "If the problem persists, try uploading files one at a time or contact support for assistance.",
      technical: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Secure file access routes
router.get("/deliverable/:orderId/:deliverableIndex/download", 
  verifyToken, 
  checkDeliverableAccess, 
  generateSecureDownloadUrl
);

router.get("/milestone/:orderId/:milestoneIndex/:deliverableIndex/download",
  verifyToken,
  checkMilestoneDeliverableAccess,
  generateSecureDownloadUrl
);

// Check file access permissions (without downloading)
router.get("/deliverable/:orderId/:deliverableIndex/access", verifyToken, async (req, res, next) => {
  try {
    const { orderId, deliverableIndex } = req.params;
    const userId = req.userId;

    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }

    const isClient = order.buyerId === userId;
    const isFreelancer = order.sellerId === userId;
    
    if (!isClient && !isFreelancer) {
      return res.status(403).json({ error: "Access denied" });
    }

    const deliverable = order.deliverables[deliverableIndex];
    if (!deliverable) {
      return res.status(404).json({ error: "Deliverable not found" });
    }

    const hasFullAccess = isFreelancer || 
      (order.escrowStatus === "released" && order.isCompleted === true);

    res.json({
      orderId: orderId,
      deliverableIndex: deliverableIndex,
      accessLevel: deliverable.accessLevel,
      canAccessFinal: hasFullAccess,
      canAccessPreview: true,
      paymentStatus: order.escrowStatus,
      orderCompleted: order.isCompleted,
      userRole: isClient ? 'client' : 'freelancer',
      previewUrl: deliverable.previewUrl || deliverable.fileUrl,
      finalAvailable: hasFullAccess,
      downloadCount: deliverable.downloadCount || 0
    });

  } catch (error) {
    console.error('Error checking file access:', error);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
