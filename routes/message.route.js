import express from "express";
import {
  createMessage,
  getMessages,
  addReaction,
  editMessage,
  deleteMessage,
  searchMessages,
} from "../controllers/message.controller.js";
import { verifyToken } from "../middleware/jwt.js";
import { uploadMultiple, handleUploadError } from "../middleware/upload.js";

const router = express.Router();

// Create message (with optional file attachments)
router.post("/", verifyToken, uploadMultiple, handleUploadError, createMessage);

// Get messages for a conversation
router.get("/:id", verifyToken, getMessages);

// Search messages
router.get("/search/all", verifyToken, searchMessages);

// Add/remove reaction to/from a message
router.post("/:messageId/react", verifyToken, addReaction);

// Edit a message
router.put("/:messageId", verifyToken, editMessage);

// Delete a message
router.delete("/:messageId", verifyToken, deleteMessage);

export default router;