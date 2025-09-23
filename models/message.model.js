import mongoose from 'mongoose';
const { Schema } = mongoose;

const MessageSchema = new Schema({
    conversationId:{
        type:String,
        required:true,
    },
    userId:{
        type:String,
        required:true,
    },
    desc:{
        type:String,
        required:false,
    },
    messageType:{
        type:String,
        enum: ['text', 'image', 'file', 'audio', 'video'],
        default: 'text'
    },
    attachments:[{
        fileName: String,
        fileUrl: String,
        fileType: String,
        fileSize: Number,
        publicId: String // For Cloudinary
    }],
    replyTo:{
        messageId: String,
        text: String,
        userId: String
    },
    reactions:[{
        userId: String,
        emoji: String,
        createdAt: {
            type: Date,
            default: Date.now
        }
    }],
    isEdited:{
        type: Boolean,
        default: false
    },
    editedAt: Date,
    isDeleted:{
        type: Boolean,
        default: false
    },
    deletedAt: Date,
    
    // Content filtering fields
    isFiltered: {
        type: Boolean,
        default: false
    },
    originalContent: {
        type: String,
        required: false // Only stored if content was filtered
    },
    filteringDetails: {
        violations: [{
            type: String,
            match: String,
            severity: {
                type: String,
                enum: ['low', 'medium', 'high']
            }
        }],
        action: {
            type: String,
            enum: ['none', 'filter', 'block', 'warn']
        },
        filteredAt: {
            type: Date,
            default: Date.now
        }
    }
},{
    timestamps:true
});

export default mongoose.model("Message", MessageSchema)