import mongoose from 'mongoose';
const { Schema } = mongoose;

const RefundSchema = new Schema({
  orderId: {
    type: Schema.Types.ObjectId,
    ref: 'Order',
    required: true,
    index: true
  },
  buyerId: {
    type: String,
    ref: 'User',
    required: true,
    index: true
  },
  sellerId: {
    type: String,
    ref: 'User',
    required: true,
    index: true
  },
  amount: {
    type: Number,
    required: true
  },
  reason: {
    type: String,
    required: true
  },
  description: {
    type: String
  },
  status: {
    type: String,
    enum: ['pending', 'processing', 'completed', 'rejected'],
    default: 'pending',
    index: true
  },
  requestedAt: {
    type: Date,
    default: Date.now
  },
  processedAt: {
    type: Date
  },
  processedBy: {
    type: String,
    ref: 'User'
  },
  adminNotes: {
    type: String
  },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'critical'],
    default: 'medium'
  },
  refundMethod: {
    type: String,
    default: 'original_payment'
  },
  transactionId: {
    type: String
  }
}, {
  timestamps: true
});

RefundSchema.index({ status: 1, requestedAt: -1 });
RefundSchema.index({ amount: 1 });

export default mongoose.model('Refund', RefundSchema);
