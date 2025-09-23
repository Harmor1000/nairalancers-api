import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import User from '../models/user.model.js';
import Conversation from '../models/conversation.model.js';
import notificationService from './notificationService.js';

class SocketService {
  constructor() {
    this.io = null;
    this.users = new Map(); // Map of userId to socket information
    this.clientSellerRooms = new Map(); // Map of conversationId to {clientId, sellerId, clientSocket?, sellerSocket?}
    this.userSockets = new Map(); // Map of userId to socketId for direct messaging
  }

  init(server) {
    // Build allowed origins list (supports wildcards like *.netlify.app)
    const defaults = [
      'http://localhost:5173',
      'http://localhost:5174',
    ];
    const envList = (process.env.SOCKET_CORS_ORIGINS || process.env.ALLOWED_ORIGINS || '')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);
    const extra = process.env.CLIENT_URL ? [process.env.CLIENT_URL.trim()] : [];
    const allowed = [...new Set([...defaults, ...extra, ...envList])].map(o => o.replace(/\/$/, ''));

    const isOriginAllowed = (origin) => {
      try {
        const o = String(origin || '').replace(/\/$/, '');
        for (const item of allowed) {
          if (item.startsWith('*')) {
            const suffix = item.slice(1);
            if (o.endsWith(suffix)) return true;
          } else if (item.startsWith('http')) {
            if (o === item) return true;
          }
        }
      } catch (_) {}
      return false;
    };

    this.io = new Server(server, {
      cors: {
        origin: (origin, callback) => {
          if (!origin) return callback(null, true);
          if (isOriginAllowed(origin)) return callback(null, true);
          return callback(new Error('Not allowed by Socket.IO CORS'));
        },
        credentials: true
      }
    });

    this.io.use((socket, next) => {
      // Authenticate socket connection
      const token = socket.handshake.auth.token;
      
      if (!token) {
        return next(new Error('Authentication error'));
      }

      try {
        const payload = jwt.verify(token, process.env.JWT_KEY);
        socket.userId = payload.id;
        socket.isSeller = payload.isSeller;
        next();
      } catch (err) {
        next(new Error('Authentication error'));
      }
    });

    this.io.on('connection', async (socket) => {
      // console.log(`User ${socket.userId} connected`);
      
      try {
        // Update user status in database
        await User.findByIdAndUpdate(socket.userId, {
          isOnline: true,
          status: 'online',
          lastSeen: new Date()
        });

        // Store user connection
        this.users.set(socket.userId, {
          socketId: socket.id,
          isOnline: true,
          lastSeen: new Date()
        });

        // Send queued notifications to user
        const queuedNotifications = notificationService.getQueuedNotifications(socket.userId);
        if (queuedNotifications.length > 0) {
          socket.emit('queued-notifications', queuedNotifications);
        }

        // Notify others about user coming online
        this.broadcastUserStatus(socket.userId, true);
      } catch (error) {
        // console.error('Error updating user online status:', error);
      }

      // Handle joining client-seller conversation rooms
      socket.on('join-conversation', async (conversationId) => {
        socket.join(`conversation-${conversationId}`);
        
        try {
          // Get conversation details to identify client and seller
          const conversation = await Conversation.findOne({ id: conversationId });
          if (!conversation) {
            // console.error(`Conversation ${conversationId} not found`);
            return;
          }

          const isClient = socket.userId === conversation.buyerId;
          const isSeller = socket.userId === conversation.sellerId;
          
          if (!isClient && !isSeller) {
            // console.error(`User ${socket.userId} is not part of conversation ${conversationId}`);
            return;
          }

          // Initialize or update client-seller room tracking
          if (!this.clientSellerRooms.has(conversationId)) {
            this.clientSellerRooms.set(conversationId, {
              clientId: conversation.buyerId,
              sellerId: conversation.sellerId,
              clientSocket: null,
              sellerSocket: null,
              conversationId: conversationId
            });
          }

          const room = this.clientSellerRooms.get(conversationId);
          
          if (isClient) {
            room.clientSocket = socket.id;
            // console.log(`Client ${socket.userId} joined conversation ${conversationId}`);
            
            // Notify seller that client joined
            if (room.sellerSocket) {
              this.io.to(room.sellerSocket).emit('user-joined-conversation', {
                userId: socket.userId,
                role: 'client',
                isOnline: true
              });
            }
          } else if (isSeller) {
            room.sellerSocket = socket.id;
            // console.log(`Seller ${socket.userId} joined conversation ${conversationId}`);
            
            // Notify client that seller joined
            if (room.clientSocket) {
              this.io.to(room.clientSocket).emit('user-joined-conversation', {
                userId: socket.userId,
                role: 'seller',
                isOnline: true
              });
            }
          }

          // Store socket reference for direct messaging
          this.userSockets.set(socket.userId, socket.id);
          socket.currentConversationId = conversationId;
          
        } catch (error) {
          // console.error('Error joining conversation:', error);
        }
      });

      // Handle leaving client-seller conversation rooms
      socket.on('leave-conversation', (conversationId) => {
        socket.leave(`conversation-${conversationId}`);
        
        if (this.clientSellerRooms.has(conversationId)) {
          const room = this.clientSellerRooms.get(conversationId);
          
          if (socket.userId === room.clientId) {
            room.clientSocket = null;
            // console.log(`Client ${socket.userId} left conversation ${conversationId}`);
            
            // Notify seller that client left
            if (room.sellerSocket) {
              this.io.to(room.sellerSocket).emit('user-left-conversation', {
                userId: socket.userId,
                role: 'client',
                isOnline: false
              });
            }
          } else if (socket.userId === room.sellerId) {
            room.sellerSocket = null;
            // console.log(`Seller ${socket.userId} left conversation ${conversationId}`);
            
            // Notify client that seller left
            if (room.clientSocket) {
              this.io.to(room.clientSocket).emit('user-left-conversation', {
                userId: socket.userId,
                role: 'seller',
                isOnline: false
              });
            }
          }

          // Clean up room if both users left
          if (!room.clientSocket && !room.sellerSocket) {
            this.clientSellerRooms.delete(conversationId);
          }
        }
        
        socket.currentConversationId = null;
        this.userSockets.delete(socket.userId);
      });

      // Handle typing indicators for client-seller chats
      socket.on('typing-start', (conversationId) => {
        if (this.clientSellerRooms.has(conversationId)) {
          const room = this.clientSellerRooms.get(conversationId);
          const isClient = socket.userId === room.clientId;
          const targetSocketId = isClient ? room.sellerSocket : room.clientSocket;
          
          if (targetSocketId) {
            this.io.to(targetSocketId).emit('user-typing', {
              userId: socket.userId,
              role: isClient ? 'client' : 'seller',
              isTyping: true,
              conversationId: conversationId
            });
          }
        }
      });

      socket.on('typing-stop', (conversationId) => {
        if (this.clientSellerRooms.has(conversationId)) {
          const room = this.clientSellerRooms.get(conversationId);
          const isClient = socket.userId === room.clientId;
          const targetSocketId = isClient ? room.sellerSocket : room.clientSocket;
          
          if (targetSocketId) {
            this.io.to(targetSocketId).emit('user-typing', {
              userId: socket.userId,
              role: isClient ? 'client' : 'seller',
              isTyping: false,
              conversationId: conversationId
            });
          }
        }
      });

      // Handle message read status for client-seller chats
      socket.on('message-read', async (data) => {
        const { conversationId, messageId } = data;
        
        try {
          if (this.clientSellerRooms.has(conversationId)) {
            const room = this.clientSellerRooms.get(conversationId);
            const isClient = socket.userId === room.clientId;
            const targetSocketId = isClient ? room.sellerSocket : room.clientSocket;
            
            if (targetSocketId) {
              this.io.to(targetSocketId).emit('message-read-update', {
                messageId,
                readBy: socket.userId,
                readByRole: isClient ? 'client' : 'seller',
                readAt: new Date(),
                conversationId: conversationId
              });
            }

            // Update conversation read status in database
            const updateField = isClient ? 'readByBuyer' : 'readBySeller';
            await Conversation.findOneAndUpdate(
              { id: conversationId },
              { [updateField]: true }
            );
          }
        } catch (error) {
          // console.error('Error updating message read status:', error);
        }
      });

      // Handle disconnection
      socket.on('disconnect', async () => {
        // console.log(`User ${socket.userId} disconnected`);
        
        try {
          // Update user status in database
          await User.findByIdAndUpdate(socket.userId, {
            isOnline: false,
            status: 'offline',
            lastSeen: new Date()
          });

          // Update user status in memory
          if (this.users.has(socket.userId)) {
            this.users.set(socket.userId, {
              ...this.users.get(socket.userId),
              isOnline: false,
              lastSeen: new Date()
            });
          }

          // Notify others about user going offline
          this.broadcastUserStatus(socket.userId, false);

          // Clean up client-seller room memberships
          this.clientSellerRooms.forEach((room, conversationId) => {
            if (room.clientId === socket.userId) {
              // Client disconnected - notify seller
              if (room.sellerSocket) {
                this.io.to(room.sellerSocket).emit('user-left-conversation', {
                  userId: socket.userId,
                  role: 'client',
                  isOnline: false,
                  disconnected: true
                });
              }
              room.clientSocket = null;
            } else if (room.sellerId === socket.userId) {
              // Seller disconnected - notify client
              if (room.clientSocket) {
                this.io.to(room.clientSocket).emit('user-left-conversation', {
                  userId: socket.userId,
                  role: 'seller',
                  isOnline: false,
                  disconnected: true
                });
              }
              room.sellerSocket = null;
            }

            // Clean up room if both users disconnected
            if (!room.clientSocket && !room.sellerSocket) {
              this.clientSellerRooms.delete(conversationId);
            }
          });

          // Remove user socket mapping
          this.userSockets.delete(socket.userId);
          
        } catch (error) {
          // console.error('Error updating user offline status:', error);
        }
      });
    });

    return this.io;
  }

  // Broadcast new message specifically for client-seller chat
  broadcastNewMessage(conversationId, message, senderUser) {
    if (this.io && this.clientSellerRooms.has(conversationId)) {
      const room = this.clientSellerRooms.get(conversationId);
      const isClientSender = senderUser._id === room.clientId;
      const targetSocketId = isClientSender ? room.sellerSocket : room.clientSocket;
      
      // Send to the other person in the conversation
      if (targetSocketId) {
        this.io.to(targetSocketId).emit('new-message', {
          ...message,
          userImg: senderUser.img,
          username: senderUser.username,
          senderRole: isClientSender ? 'client' : 'seller'
        });
        
        // console.log(`Message sent from ${isClientSender ? 'client' : 'seller'} to ${isClientSender ? 'seller' : 'client'} in conversation ${conversationId}`);
      } else {
        // console.log(`Target user offline in conversation ${conversationId} - message will be queued`);
        // Queue notification for offline user
        const targetUserId = isClientSender ? room.sellerId : room.clientId;
        notificationService.queueNotification(targetUserId, {
          type: 'new-message',
          conversationId: conversationId,
          message: {
            ...message,
            userImg: senderUser.img,
            username: senderUser.username,
            senderRole: isClientSender ? 'client' : 'seller'
          }
        });
      }
    }
  }

  // Broadcast message reaction update for client-seller chat
  broadcastReactionUpdate(conversationId, messageId, reactions, reactorUserId) {
    if (this.io && this.clientSellerRooms.has(conversationId)) {
      const room = this.clientSellerRooms.get(conversationId);
      const isClientReactor = reactorUserId === room.clientId;
      const targetSocketId = isClientReactor ? room.sellerSocket : room.clientSocket;
      
      if (targetSocketId) {
        this.io.to(targetSocketId).emit('reaction-update', {
          messageId,
          reactions,
          reactorRole: isClientReactor ? 'client' : 'seller',
          conversationId: conversationId
        });
      }
    }
  }

  // Broadcast message edit/delete for client-seller chat
  broadcastMessageUpdate(conversationId, messageId, updateType, data = {}, updaterUserId) {
    if (this.io && this.clientSellerRooms.has(conversationId)) {
      const room = this.clientSellerRooms.get(conversationId);
      const isClientUpdater = updaterUserId === room.clientId;
      const targetSocketId = isClientUpdater ? room.sellerSocket : room.clientSocket;
      
      if (targetSocketId) {
        this.io.to(targetSocketId).emit('message-update', {
          messageId,
          type: updateType, // 'edit' or 'delete'
          updaterRole: isClientUpdater ? 'client' : 'seller',
          conversationId: conversationId,
          ...data
        });
      }
    }
  }

  // Broadcast user status (online/offline)
  broadcastUserStatus(userId, isOnline) {
    if (this.io) {
      this.io.emit('user-status-update', {
        userId,
        isOnline,
        lastSeen: isOnline ? null : new Date()
      });
    }
  }

  // Get user online status
  getUserStatus(userId) {
    return this.users.get(userId) || { isOnline: false, lastSeen: null };
  }

  // Get all online users
  getOnlineUsers() {
    const onlineUsers = [];
    this.users.forEach((userData, userId) => {
      if (userData.isOnline) {
        onlineUsers.push(userId);
      }
    });
    return onlineUsers;
  }

  // Send notification to specific user
  sendNotificationToUser(userId, notification) {
    const socketId = this.userSockets.get(userId);
    if (socketId && this.io) {
      this.io.to(socketId).emit('notification', notification);
      return true; // Successfully sent
    }
    return false; // User offline or not connected
  }

  // Send typing indicator to conversation
  sendTypingIndicator(conversationId, userId, isTyping) {
    if (this.io && this.clientSellerRooms.has(conversationId)) {
      const room = this.clientSellerRooms.get(conversationId);
      const isClient = userId === room.clientId;
      const targetSocketId = isClient ? room.sellerSocket : room.clientSocket;
      
      if (targetSocketId) {
        this.io.to(targetSocketId).emit('user-typing', {
          userId,
          role: isClient ? 'client' : 'seller',
          isTyping,
          conversationId: conversationId
        });
      }
    }
  }

  // Get the other person's status in a client-seller conversation
  getOtherPersonStatus(conversationId, currentUserId) {
    if (this.clientSellerRooms.has(conversationId)) {
      const room = this.clientSellerRooms.get(conversationId);
      const isCurrentUserClient = currentUserId === room.clientId;
      const otherPersonId = isCurrentUserClient ? room.sellerId : room.clientId;
      const otherPersonSocketId = isCurrentUserClient ? room.sellerSocket : room.clientSocket;
      
      return {
        userId: otherPersonId,
        role: isCurrentUserClient ? 'seller' : 'client',
        isOnline: !!otherPersonSocketId,
        isInConversation: !!otherPersonSocketId
      };
    }
    return null;
  }

  // Check if user is online in specific conversation
  isUserOnlineInConversation(conversationId, userId) {
    if (this.clientSellerRooms.has(conversationId)) {
      const room = this.clientSellerRooms.get(conversationId);
      if (userId === room.clientId) {
        return !!room.clientSocket;
      } else if (userId === room.sellerId) {
        return !!room.sellerSocket;
      }
    }
    return false;
  }

  // Get conversation participants status
  getConversationStatus(conversationId) {
    if (this.clientSellerRooms.has(conversationId)) {
      const room = this.clientSellerRooms.get(conversationId);
      return {
        conversationId: conversationId,
        client: {
          id: room.clientId,
          isOnline: !!room.clientSocket,
          socketId: room.clientSocket
        },
        seller: {
          id: room.sellerId,
          isOnline: !!room.sellerSocket,
          socketId: room.sellerSocket
        }
      };
    }
    return null;
  }
}

export default new SocketService();
