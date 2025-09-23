import mongoose from 'mongoose';
const { Schema } = mongoose;

const AdminLogSchema = new Schema({
  adminId: {
    type: String,
    required: true,
    index: true
  },
  adminUsername: {
    type: String,
    required: true
  },
  action: {
    type: String,
    required: true,
    enum: [
      'user_created', 'user_updated', 'user_deleted', 'user_suspended', 'user_unsuspended',
      'gig_approved', 'gig_rejected', 'gig_deleted', 'gig_featured',
      'order_refunded', 'order_cancelled', 'order_completed',
      'dispute_resolved', 'dispute_escalated', 'dashboard_accessed',
      'withdrawal_approved', 'withdrawal_rejected',
      'verification_approved', 'verification_rejected',
      'trust_score_adjusted', 'user_flagged', 'user_unflagged',
      'admin_created', 'admin_removed',
      'system_settings_changed', 'bulk_action_performed',
      'login', 'logout', 'failed_login_attempt', 'gig_updated', 'order_updated'
    ]
  },
  targetType: {
    type: String,
    enum: ['user', 'gig', 'order', 'dispute', 'withdrawal', 'review', 'system', 'auth'],
    required: true
  },
  targetId: {
    type: String, // ID of the affected resource
    required: false
  },
  targetName: {
    type: String, // Name/title of affected resource for easy reading
    required: false
  },
  details: {
    type: Schema.Types.Mixed, // Store additional details about the action
    required: false
  },
  oldValues: {
    type: Schema.Types.Mixed, // Store previous values for audit trail
    required: false
  },
  newValues: {
    type: Schema.Types.Mixed, // Store new values for audit trail
    required: false
  },
  ipAddress: {
    type: String,
    required: false
  },
  userAgent: {
    type: String,
    required: false
  },
  severity: {
    type: String,
    enum: ['low', 'medium', 'high', 'critical'],
    default: 'medium'
  },
  success: {
    type: Boolean,
    default: true
  },
  errorMessage: {
    type: String,
    required: false
  }
}, {
  timestamps: true
});

// Indexes for efficient querying
AdminLogSchema.index({ adminId: 1, createdAt: -1 });
AdminLogSchema.index({ action: 1, createdAt: -1 });
AdminLogSchema.index({ targetType: 1, targetId: 1 });
AdminLogSchema.index({ severity: 1, createdAt: -1 });
AdminLogSchema.index({ createdAt: -1 }); // For recent logs

export default mongoose.model("AdminLog", AdminLogSchema);
