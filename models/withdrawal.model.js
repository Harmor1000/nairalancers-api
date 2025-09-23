import mongoose from 'mongoose';
const { Schema } = mongoose;

const WithdrawalSchema = new Schema({
  freelancerId: {
    type: String,
    required: true,
    index: true
  },
  amount: {
    type: Number,
    required: true,
    min: 1000 // Minimum withdrawal amount: ₦1,000
  },
  bankDetails: {
    accountNumber: {
      type: String,
      required: true,
      validate: {
        validator: function(v) {
          return /^\d{10}$/.test(v); // Nigerian account numbers are 10 digits
        },
        message: 'Account number must be 10 digits'
      }
    },
    bankName: {
      type: String,
      required: true,
      enum: [
        'Access Bank', 'GTBank', 'First Bank', 'UBA', 'Zenith Bank',
        'Fidelity Bank', 'FCMB', 'Sterling Bank', 'Union Bank', 
        'Keystone Bank', 'Wema Bank', 'Polaris Bank', 'Stanbic IBTC',
        'Ecobank', 'Heritage Bank', 'Standard Chartered'
      ]
    },
    accountName: {
      type: String,
      required: true,
      trim: true
    }
  },
  status: {
    type: String,
    enum: ['pending', 'processing', 'completed', 'failed', 'cancelled'],
    default: 'pending'
  },
  processingFee: {
    type: Number,
    default: function() {
      return this.amount * 0.02; // 2% processing fee
    }
  },
  netAmount: {
    type: Number,
    default: function() {
      return this.amount - this.processingFee;
    }
  },
  requestedAt: {
    type: Date,
    default: Date.now
  },
  processedAt: {
    type: Date
  },
  processedBy: {
    type: String // Admin user ID who processed the withdrawal
  },
  transactionReference: {
    type: String,
    unique: true,
    sparse: true // Allow multiple null values but unique non-null values
  },
  paymentGatewayResponse: {
    type: Schema.Types.Mixed // Store payment gateway response
  },
  failureReason: {
    type: String
  },
  notes: {
    type: String // Admin notes
  }
}, {
  timestamps: true
});

// Indexes for efficient queries
WithdrawalSchema.index({ freelancerId: 1, createdAt: -1 });
WithdrawalSchema.index({ status: 1, createdAt: -1 });

// Pre-save middleware to calculate processing fee and net amount
WithdrawalSchema.pre('save', function(next) {
  if (this.isModified('amount')) {
    this.processingFee = Math.round(this.amount * 0.02); // 2% fee, rounded
    this.netAmount = this.amount - this.processingFee;
  }
  next();
});

// Generate unique transaction reference
WithdrawalSchema.pre('save', function(next) {
  if (this.isNew && !this.transactionReference) {
    this.transactionReference = `WDR_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
  next();
});

// Update processedAt when status changes to completed or failed
WithdrawalSchema.pre('save', function(next) {
  if (this.isModified('status') && ['completed', 'failed'].includes(this.status)) {
    if (!this.processedAt) {
      this.processedAt = new Date();
    }
  }
  next();
});

export default mongoose.model("Withdrawal", WithdrawalSchema);

