import mongoose from "mongoose";
const { Schema } = mongoose;

const ReviewSchema = new Schema(
  {
    gigId: {
      type: String,
      required: true,
    },
    userId: {
      type: String,
      required: true,
    },
    sellerId: {
      type: String,
      required: true,
    },
    star: {
      type: Number,
      required: true,
      enum:[1,2,3,4,5]
    },
    desc: {
      type: String,
      required: true,
    },
    // Helpfulness tracking
    helpfulVotes: [{
      userId: {
        type: String,
        required: true,
      },
      vote: {
        type: String,
        enum: ['yes', 'no'],
        required: true,
      },
      createdAt: {
        type: Date,
        default: Date.now,
      }
    }],
    helpfulScore: {
      yes: {
        type: Number,
        default: 0,
      },
      no: {
        type: Number,
        default: 0,
      }
    },
    // Reporting
    reports: [{
      userId: {
        type: String,
        required: true,
      },
      reason: {
        type: String,
        enum: ['spam', 'inappropriate', 'fake', 'harassment', 'other'],
        required: true,
      },
      description: {
        type: String,
        maxlength: 500,
      },
      createdAt: {
        type: Date,
        default: Date.now,
      }
    }],
    isReported: {
      type: Boolean,
      default: false,
    },
    isHidden: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

// Index for efficient queries
ReviewSchema.index({ gigId: 1, createdAt: -1 });
ReviewSchema.index({ sellerId: 1, createdAt: -1 });
ReviewSchema.index({ userId: 1 });

export default mongoose.model("Review", ReviewSchema);