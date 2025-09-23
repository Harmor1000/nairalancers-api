import mongoose from 'mongoose';
const { Schema } = mongoose;

const OrderSchema = new Schema({
    gigId:{
        type:String,
        required:true,
        ref: 'Gig',
    },
    img:{
        type:String,
        required:false,
    },
    title:{
        type:String,
        required:true,
    },
    price:{
        type:Number,
        required:true,
    },
    sellerId:{
        type:String,
        required:true,
        ref: 'User',
    },
    buyerId:{
        type:String,
        required:true,
        ref: 'User',
    },
    isCompleted:{
        type:Boolean,
        default:false,
    },
    payment_intent:{
        type:String,
        required:false,
    },
    reference: {
      type: String,
      required:true,
      unique: true,
    },
    paymentStatus: {
      type: String,
      enum: ["paid", "failed"], // Removed "pending" - orders only created after successful payment
      default: "paid",
    },
    status: {
      type: String,
      enum: ["pending", "in progress", "completed", "cancelled", "disputed"],
      default: "pending"
    },
    
    // ESCROW SYSTEM FIELDS
    escrowStatus: {
      type: String,
      enum: ["funded", "work_submitted", "approved", "released", "disputed", "refunded"], // Removed "pending" - orders start as "funded"
      default: "funded"
    },
      deliverables: [{
    filename: String,
    originalName: String,
    fileUrl: String,
    fileSize: Number,
    submittedAt: {
      type: Date,
      default: Date.now
    },
    description: String,
    revisionNumber: {
      type: Number,
      default: 1
    },
    // PREVIEW PROTECTION SYSTEM
    isPreview: {
      type: Boolean,
      default: false
    },
    previewUrl: String, // Watermarked/limited preview version
    finalUrl: String,   // Full quality version (only accessible after payment)
    previewFileSize: Number,
    finalFileSize: Number,
    accessLevel: {
      type: String,
      enum: ['preview_only', 'full_access', 'restricted'],
      default: 'preview_only'
    },
    downloadCount: {
      type: Number,
      default: 0
    },
    lastAccessedAt: Date
  }],
    workSubmittedAt: Date,
    clientReviewDeadline: Date, // Auto-release deadline
    expectedDeliveryDate: Date, // Expected delivery date based on gig settings
    
    // MILESTONE SYSTEM
    milestones: [{
      title: String,
      description: String,
      amount: Number,
      dueDate: Date,
      status: {
        type: String,
        enum: ["pending", "in_progress", "submitted", "approved", "paid"],
        default: "pending"
      },
      deliverables: [{
        filename: String,
        originalName: String,
        fileUrl: String,
        fileSize: Number,
        submittedAt: Date,
        description: String,
        // PREVIEW PROTECTION FOR MILESTONES
        isPreview: {
          type: Boolean,
          default: false
        },
        previewUrl: String,
        finalUrl: String,
        previewFileSize: Number,
        finalFileSize: Number,
        accessLevel: {
          type: String,
          enum: ['preview_only', 'full_access', 'restricted'],
          default: 'preview_only'
        },
        downloadCount: {
          type: Number,
          default: 0
        },
        lastAccessedAt: Date
      }],
      submittedAt: Date,
      approvedAt: Date,
      paidAt: Date,
      clientFeedback: String
    }],
    
    // FRAUD PREVENTION
    requiresApproval: {
      type: Boolean,
      default: true
    },
    autoReleaseDate: Date, // Automatic release if no action taken

    revisionRequests: [{
      reason: String,
      details: String,
      requestedAt: {
        type: Date,
        default: Date.now
      },
      requestedBy: String // buyerId
    }],
    
    // DISPUTE SYSTEM
    disputeReason: String,
    disputeDetails: String,
    disputeInitiatedBy: String,
    disputeInitiatedAt: Date,
    disputeStatus: {
      type: String,
      enum: ["none", "pending", "under_review", "resolved"],
      default: "none"
    },
    disputeResolution: String,
    disputeResolvedAt: Date,
    disputeResolvedBy: String, // admin userId
    disputeEvidence: [{
      submittedBy: String,
      userType: {
        type: String,
        enum: ["client", "freelancer"],
        required: true
      },
      evidenceType: {
        type: String,
        enum: ["screenshot", "document", "communication", "video", "other"],
        required: true
      },
      description: String,
      fileUrls: [String],
      submittedAt: {
        type: Date,
        default: Date.now
      }
    }],
    disputeReviewStartedAt: Date,
    disputeReviewedBy: String,
    refundAmount: {
      type: Number,
      default: 0
    },
    
    // COMMUNICATION & NOTES
    clientNotes: String,
    freelancerNotes: String,
    adminNotes: String,
    
    // PROTECTION SETTINGS
    protectionLevel: {
      type: String,
      enum: ["standard", "enhanced", "premium"],
      default: "standard"
    },
    
    // TIMESTAMPS
    paidAt: Date,
    workStartedAt: Date,
    completedAt: Date,
    approvedAt: Date,
    releasedAt: Date

},{
    timestamps:true
});

export default mongoose.model("Order", OrderSchema)