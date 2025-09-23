import mongoose from 'mongoose';
const { Schema } = mongoose;

const GigSchema = new Schema({
    userId:{
        type: String,
        required: true
    },
    title:{
        type: String,
        required: true
    },
    desc:{
        type: String,
        required: true
    },
    totalStars:{
        type: Number,
        default: 0,
    },
    starNumber:{
        type: Number,
        default: 0,
    },
    cat:{
        type: String,
        required: true
    },
    subcategory:{
        type: String,
        required: true
    },
    price:{
        type: Number,
        required: true
    },
    cover:{
        type: String,
        required: true
    },
    images:{
        type: [String],
        required: false,
    },
    shortTitle:{
        type: String,
        required: true
    },
    shortDesc:{
        type: String,
        required: true
    },
    deliveryTime:{
        type: Number,
        required: function() { return !this.hasPackages && !this.hasMilestones; },
        min: 1
    },
    revisionNumber:{
        type: Number,
        required: function() { return !this.hasPackages && !this.hasMilestones; },
        min: 0,
        max: 10
    },
    features:{
        type: [String],
        required: false
    },
    sales:{
        type: Number,
        default: 0,
    },
    
    // Package System
    hasPackages: {
        type: Boolean,
        default: false
    },
    packages: {
        basic: {
            enabled: {
                type: Boolean,
                default: false
            },
            title: String,
            description: String,
            price: { type: Number, min: 1 },
            deliveryTime: { type: Number, min: 1 },
            revisions: { type: Number, min: 0, max: 10 },
            features: [String]
        },
        standard: {
            enabled: {
                type: Boolean,
                default: false
            },
            title: String,
            description: String,
            price: { type: Number, min: 1 },
            deliveryTime: { type: Number, min: 1 },
            revisions: { type: Number, min: 0, max: 10 },
            features: [String]
        },
        premium: {
            enabled: {
                type: Boolean,
                default: false
            },
            title: String,
            description: String,
            price: { type: Number, min: 1 },
            deliveryTime: { type: Number, min: 1 },
            revisions: { type: Number, min: 0, max: 10 },
            features: [String]
        }
    },
    
    // Milestone System
    hasMilestones: {
        type: Boolean,
        default: false
    },
    milestones: [{
        title: {
            type: String,
            required: function() { return this.parent().hasMilestones; }
        },
        description: String,
        price: {
            type: Number,
            required: function() { return this.parent().hasMilestones; },
            min: 1
        },
        deliveryTime: {
            type: Number,
            required: function() { return this.parent().hasMilestones; },
            min: 1
        },
        order: {
            type: Number,
            default: 1
        }
    }],
    
    // Admin management fields
    status: {
        type: String,
        enum: ['active', 'paused', 'pending', 'rejected', 'suspended', 'draft'],
        default: 'pending'
    },
    featured: {
        type: Boolean,
        default: false
    },
    adminNotes: {
        type: String,
        required: false
    },
    // Admin action tracking
    approvedBy: {
        type: String,
        required: false
    },
    approvedAt: {
        type: Date,
        required: false
    },
    rejectedBy: {
        type: String,
        required: false
    },
    rejectedAt: {
        type: Date,
        required: false
    },
    suspendedBy: {
        type: String,
        required: false
    },
    suspendedAt: {
        type: Date,
        required: false
    },
    featuredBy: {
        type: String,
        required: false
    },
    featuredAt: {
        type: Date,
        required: false
    },
    restoredBy: {
        type: String,
        required: false
    },
    restoredAt: {
        type: Date,
        required: false
    }
},{
    timestamps:true
});

export default mongoose.model("Gig", GigSchema)