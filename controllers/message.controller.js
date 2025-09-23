import createError from "../utils/createError.js";
import Message from "../models/message.model.js";
import Conversation from "../models/conversation.model.js";
import User from "../models/user.model.js";
import fileUploadService from "../services/fileUploadService.js";
import socketService from "../services/socketService.js";
import notificationService from "../services/notificationService.js";
import contentFilterService from "../services/contentFilterService.js";

export const createMessage = async (req, res, next) => {
  try {
    let attachments = [];
    let messageType = 'text';

    // Handle file attachments if present
    if (req.files && req.files.length > 0) {
      try {
        const uploadResults = await fileUploadService.uploadMultipleFiles(req.files, 'messages');
        attachments = uploadResults;
        
        // Determine message type based on first attachment
        if (uploadResults.length > 0) {
          const firstFileType = uploadResults[0].fileType;
          if (firstFileType.startsWith('image/')) {
            messageType = 'image';
          } else if (firstFileType.startsWith('video/')) {
            messageType = 'video';
          } else if (firstFileType.startsWith('audio/')) {
            messageType = 'audio';
          } else {
            messageType = 'file';
          }
        }
      } catch (uploadError) {
        console.error('File upload error:', uploadError);
        return next(createError(400, "Failed to upload files"));
      }
    }

    // Create message object
    const messageData = {
      conversationId: req.body.conversationId,
      userId: req.userId,
      messageType: messageType,
    };

    // Filter and validate message content
    let filterResult = { isAllowed: true, filteredContent: req.body.desc };
    if (req.body.desc) {
      try {
        // Get user's filtering preferences
        const currentUser = await User.findById(req.userId);
        const filteringOptions = {
          strictMode: currentUser?.contentFilteringLevel === 'strict'
        };

        // Apply content filtering
        filterResult = await contentFilterService.filterContent(
          req.body.desc, 
          req.userId, 
          filteringOptions
        );

        // Handle blocked messages
        if (!filterResult.isAllowed) {
          return res.status(400).json({
            error: "Message blocked",
            reason: filterResult.warning || "Your message contains prohibited content.",
            violations: filterResult.violations,
            severity: filterResult.severity
          });
        }

        // Set the (potentially filtered) content
        messageData.desc = filterResult.filteredContent;

        // Add filtering metadata if content was modified
        if (filterResult.action === 'filter' && filterResult.filteredContent !== req.body.desc) {
          messageData.isFiltered = true;
          messageData.originalContent = req.body.desc;
          messageData.filteringDetails = {
            violations: filterResult.violations,
            action: filterResult.action,
            filteredAt: new Date()
          };
        }
      } catch (filterError) {
        console.error('Content filtering error:', filterError);
        // On filtering service error, allow message but log the error
        messageData.desc = req.body.desc;
      }
    }

    // Add attachments if any
    if (attachments.length > 0) {
      messageData.attachments = attachments;
    }

    // Add reply information if provided
    if (req.body.replyTo) {
      try {
        const replyData = JSON.parse(req.body.replyTo);
        messageData.replyTo = replyData;
      } catch (parseError) {
        console.error('Reply data parse error:', parseError);
      }
    }

    const newMessage = new Message(messageData);
    const savedMessage = await newMessage.save();

    // Get sender user info for broadcasting
    const senderUser = await User.findById(req.userId, "img username");

    // Update conversation with last message
    let lastMessageText = req.body.desc || '';
    if (attachments.length > 0 && !lastMessageText) {
      if (messageType === 'image') {
        lastMessageText = `📷 ${attachments.length} image${attachments.length > 1 ? 's' : ''}`;
      } else if (messageType === 'video') {
        lastMessageText = `🎥 ${attachments.length} video${attachments.length > 1 ? 's' : ''}`;
      } else if (messageType === 'audio') {
        lastMessageText = `🎵 ${attachments.length} audio file${attachments.length > 1 ? 's' : ''}`;
      } else {
        lastMessageText = `📎 ${attachments.length} file${attachments.length > 1 ? 's' : ''}`;
      }
    }

    await Conversation.findOneAndUpdate(
      { id: req.body.conversationId },
      {
        $set: {
          readBySeller: req.isSeller,
          readByBuyer: !req.isSeller,
          lastMessage: lastMessageText,
        },
      },
      { new: true }
    );

    // Broadcast new message via WebSocket (client-seller specific)
    try {
      socketService.broadcastNewMessage(req.body.conversationId, savedMessage, senderUser);
      console.log(`Message broadcast sent for conversation ${req.body.conversationId}`);
    } catch (socketError) {
      console.log('WebSocket broadcast failed:', socketError.message);
    }

    // Send notification to recipient
    try {
      const conversation = await Conversation.findOne({ id: req.body.conversationId });
      if (conversation) {
        const recipientId = req.isSeller ? conversation.buyerId : conversation.sellerId;
        
        // Check recipient's notification preferences
        const recipient = await User.findById(recipientId);
        if (recipient && recipient.notificationSettings && recipient.notificationSettings.newMessages) {
          let messagePreview = req.body.desc || '';
          
          // Create preview for attachment messages
          if (attachments.length > 0 && !messagePreview) {
            if (messageType === 'image') {
              messagePreview = `📷 Sent ${attachments.length} image${attachments.length > 1 ? 's' : ''}`;
            } else if (messageType === 'video') {
              messagePreview = `🎥 Sent ${attachments.length} video${attachments.length > 1 ? 's' : ''}`;
            } else if (messageType === 'audio') {
              messagePreview = `🎵 Sent ${attachments.length} audio file${attachments.length > 1 ? 's' : ''}`;
            } else {
              messagePreview = `📎 Sent ${attachments.length} file${attachments.length > 1 ? 's' : ''}`;
            }
          }
          
          // Limit preview length
          if (messagePreview.length > 100) {
            messagePreview = messagePreview.substring(0, 97) + '...';
          }
          
          await notificationService.notifyNewMessage(
            recipientId,
            req.userId,
            senderUser.username,
            messagePreview,
            req.body.conversationId
          );
        }
      }
    } catch (notificationError) {
      console.log('Notification failed:', notificationError.message);
    }

    // Prepare response with potential filtering warning
    const response = {
      ...savedMessage.toObject(),
      userImg: senderUser?.img || null,
      username: senderUser?.username || "Unknown"
    };

    // Add filtering warning if content was filtered
    if (filterResult.action === 'filter' || filterResult.action === 'warn') {
      response.contentWarning = {
        message: filterResult.warning,
        action: filterResult.action,
        isFiltered: filterResult.action === 'filter'
      };
    }

    res.status(201).send(response);
  } catch (err) {
    next(err);
  }
};


export const getMessages = async (req, res, next) => {
  try {
    // Get all messages for the conversation, excluding deleted messages, sorted chronologically
    const messages = await Message.find({ 
      conversationId: req.params.id,
      isDeleted: { $ne: true }
    }).sort({ createdAt: 1 }); // Ascending order (oldest first)

    // Extract unique userIds
    const userIds = [...new Set(messages.map(msg => msg.userId))];

    // Fetch users by IDs
    const users = await User.find({ _id: { $in: userIds } }, "img");

    // Map userId to img
    const userImageMap = {};
    users.forEach(user => {
      userImageMap[user._id] = user.img;
    });

    // Add userImg and additional data to each message
    const formattedMessages = messages.map(msg => ({
      _id: msg._id,
      conversationId: msg.conversationId,
      userId: msg.userId,
      userImg: userImageMap[msg.userId] || null,
      desc: msg.desc,
      messageType: msg.messageType,
      attachments: msg.attachments,
      replyTo: msg.replyTo,
      reactions: msg.reactions,
      isEdited: msg.isEdited,
      editedAt: msg.editedAt,
      createdAt: msg.createdAt,
      updatedAt: msg.updatedAt,
    }));

    res.status(200).send(formattedMessages);
  } catch (err) {
    next(err);
  }
};

// Add reaction to message
export const addReaction = async (req, res, next) => {
  try {
    const { messageId } = req.params;
    const { emoji } = req.body;
    const userId = req.userId;

    // Check if user already reacted with this emoji
    const message = await Message.findById(messageId);
    if (!message) {
      return next(createError(404, "Message not found"));
    }

    const existingReaction = message.reactions.find(
      r => r.userId === userId && r.emoji === emoji
    );

    if (existingReaction) {
      // Remove existing reaction
      message.reactions = message.reactions.filter(
        r => !(r.userId === userId && r.emoji === emoji)
      );
    } else {
      // Add new reaction
      message.reactions.push({
        userId: userId,
        emoji: emoji
      });
    }

    await message.save();

    // Broadcast reaction update via WebSocket (client-seller specific)
    try {
      socketService.broadcastReactionUpdate(message.conversationId, messageId, message.reactions, req.userId);
      console.log(`Reaction update broadcast sent for message ${messageId} in conversation ${message.conversationId}`);
    } catch (socketError) {
      console.log('WebSocket broadcast failed:', socketError.message);
    }

    // Send notification to message author if reaction was added (not removed)
    try {
      if (!existingReaction && message.userId.toString() !== userId) {
        const reactor = await User.findById(userId);
        const messageAuthor = await User.findById(message.userId);
        
        if (reactor && messageAuthor && messageAuthor.notificationSettings && messageAuthor.notificationSettings.messageReactions) {
          let messagePreview = message.desc || '';
          
          // Create preview for attachment messages
          if (!messagePreview && message.attachments && message.attachments.length > 0) {
            const attachment = message.attachments[0];
            if (attachment.fileType.startsWith('image/')) {
              messagePreview = '📷 Image';
            } else if (attachment.fileType.startsWith('video/')) {
              messagePreview = '🎥 Video';
            } else if (attachment.fileType.startsWith('audio/')) {
              messagePreview = '🎵 Audio';
            } else {
              messagePreview = `📎 ${attachment.fileName}`;
            }
          }
          
          // Limit preview length
          if (messagePreview.length > 50) {
            messagePreview = messagePreview.substring(0, 47) + '...';
          }
          
          await notificationService.notifyMessageReaction(
            message.userId,
            userId,
            reactor.username,
            emoji,
            messagePreview,
            message.conversationId
          );
        }
      }
    } catch (notificationError) {
      console.log('Reaction notification failed:', notificationError.message);
    }

    res.status(200).send(message);
  } catch (err) {
    next(err);
  }
};

  // Edit message
export const editMessage = async (req, res, next) => {
  try {
    const { messageId } = req.params;
    const { desc } = req.body;
    const userId = req.userId;

    const message = await Message.findById(messageId);
    if (!message) {
      return next(createError(404, "Message not found"));
    }

    // Check if user owns the message
    if (message.userId !== userId) {
      return next(createError(403, "You can only edit your own messages"));
    }

    // Filter edited message content
    let filterResult = { isAllowed: true, filteredContent: desc };
    if (desc) {
      try {
        // Get user's filtering preferences
        const currentUser = await User.findById(userId);
        const filteringOptions = {
          strictMode: currentUser?.contentFilteringLevel === 'strict'
        };

        // Apply content filtering
        filterResult = await contentFilterService.filterContent(
          desc, 
          userId, 
          filteringOptions
        );

        // Handle blocked edits
        if (!filterResult.isAllowed) {
          return res.status(400).json({
            error: "Edit blocked",
            reason: filterResult.warning || "Your edited message contains prohibited content.",
            violations: filterResult.violations,
            severity: filterResult.severity
          });
        }
      } catch (filterError) {
        console.error('Content filtering error during edit:', filterError);
        // On filtering service error, allow edit but log the error
        filterResult.filteredContent = desc;
      }
    }

    // Update message with filtered content
    message.desc = filterResult.filteredContent;
    message.isEdited = true;
    message.editedAt = new Date();

    // Update filtering metadata if content was modified
    if (filterResult.action === 'filter' && filterResult.filteredContent !== desc) {
      message.isFiltered = true;
      message.originalContent = desc;
      message.filteringDetails = {
        violations: filterResult.violations,
        action: filterResult.action,
        filteredAt: new Date()
      };
    }

    await message.save();

    // Broadcast message edit via WebSocket (client-seller specific)
    try {
      socketService.broadcastMessageUpdate(message.conversationId, messageId, 'edit', {
        desc: message.desc,
        isEdited: true,
        editedAt: message.editedAt
      }, userId);
      console.log(`Message edit broadcast sent for message ${messageId} in conversation ${message.conversationId}`);
    } catch (socketError) {
      console.log('WebSocket broadcast failed:', socketError.message);
    }

    // Prepare response with potential filtering warning..
    const response = message.toObject();
    if (filterResult.action === 'filter' || filterResult.action === 'warn') {
      response.contentWarning = {
        message: filterResult.warning,
        action: filterResult.action,
        isFiltered: filterResult.action === 'filter'
      };
    }

    res.status(200).send(response);
  } catch (err) {
    next(err);
  }
};

// Delete message
export const deleteMessage = async (req, res, next) => {
  try {
    const { messageId } = req.params;
    const userId = req.userId;

    const message = await Message.findById(messageId);
    if (!message) {
      return next(createError(404, "Message not found"));
    }

    // Check if user owns the message
    if (message.userId !== userId) {
      return next(createError(403, "You can only delete your own messages"));
    }

    // Soft delete - don't actually remove from database
    message.isDeleted = true;
    message.deletedAt = new Date();

    // Delete attachments from Cloudinary if any
    if (message.attachments && message.attachments.length > 0) {
      try {
        const publicIds = message.attachments.map(att => att.publicId).filter(Boolean);
        if (publicIds.length > 0) {
          await fileUploadService.deleteMultipleFiles(publicIds);
        }
      } catch (deleteError) {
        console.error('Error deleting attachments:', deleteError);
      }
    }

    await message.save();

    // Broadcast message deletion via WebSocket (client-seller specific)
    try {
      socketService.broadcastMessageUpdate(message.conversationId, messageId, 'delete', {
        isDeleted: true,
        deletedAt: message.deletedAt
      }, userId);
      console.log(`Message deletion broadcast sent for message ${messageId} in conversation ${message.conversationId}`);
    } catch (socketError) {
      console.log('WebSocket broadcast failed:', socketError.message);
    }

    res.status(200).send({ message: "Message deleted successfully" });
  } catch (err) {
    next(err);
  }
};

// Search messages
export const searchMessages = async (req, res, next) => {
  try {
    const { query, conversationId, limit = 50, offset = 0 } = req.query;
    
    if (!query || query.trim().length < 2) {
      return res.status(400).json({ error: "Search query must be at least 2 characters" });
    }

    // Build search filter
    const searchFilter = {
      isDeleted: { $ne: true },
      $or: [
        { desc: { $regex: query.trim(), $options: 'i' } },
        { 'attachments.fileName': { $regex: query.trim(), $options: 'i' } }
      ]
    };

    // Add conversation filter if specified
    if (conversationId) {
      searchFilter.conversationId = conversationId;
    } else {
      // If no conversation specified, only search user's conversations
      const conversations = await Conversation.find(
        req.isSeller ? { sellerId: req.userId } : { buyerId: req.userId }
      ).select('id');
      
      const conversationIds = conversations.map(conv => conv.id);
      searchFilter.conversationId = { $in: conversationIds };
    }

    // Search messages
    const messages = await Message.find(searchFilter)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip(parseInt(offset));

    // Get user images for the messages
    const userIds = [...new Set(messages.map(msg => msg.userId))];
    const users = await User.find({ _id: { $in: userIds } }, "img username");

    const userImageMap = {};
    users.forEach(user => {
      userImageMap[user._id] = {
        img: user.img,
        username: user.username
      };
    });

    // Format messages with user data
    const formattedMessages = messages.map(msg => ({
      _id: msg._id,
      conversationId: msg.conversationId,
      userId: msg.userId,
      userImg: userImageMap[msg.userId]?.img || null,
      username: userImageMap[msg.userId]?.username || "Unknown",
      desc: msg.desc,
      messageType: msg.messageType,
      attachments: msg.attachments,
      createdAt: msg.createdAt,
    }));

    res.status(200).json({
      messages: formattedMessages,
      total: formattedMessages.length,
      hasMore: formattedMessages.length === parseInt(limit)
    });
  } catch (err) {
    next(err);
  }
};
