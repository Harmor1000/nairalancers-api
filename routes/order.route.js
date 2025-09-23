import express from "express";
import {verifyToken} from "../middleware/jwt.js";
import { validateTransactionLimit } from "../utils/transactionLimits.js";
import {
  getOrders, 
  intent, 
  verifyPayment, 
  submitWork, 
  approveWork, 
  requestRevision, 
  initiateDispute, 
  checkAutoRelease, 
  getOrderDetails,
  createMilestones,
  submitMilestoneWork,
  approveMilestone,
  requestMilestoneRevision,
  resetOrderForResubmission
} from "../controllers/order.controller.js"

const router = express.Router();

// EXISTING PAYMENT ROUTES
router.get("/", verifyToken, getOrders);
router.post("/transaction/initialize/:id", verifyToken, validateTransactionLimit, intent);
router.post("/verify/:reference", verifyToken, verifyPayment);

// FRAUD PREVENTION & ESCROW ROUTES
router.get("/:orderId/details", verifyToken, getOrderDetails); // Get order details
router.post("/:orderId/submit-work", verifyToken, submitWork); // Freelancer submits deliverables
router.post("/:orderId/approve", verifyToken, approveWork); // Client approves work and releases payment
router.post("/:orderId/request-revision", verifyToken, requestRevision); // Client requests changes
router.post("/:orderId/dispute", verifyToken, initiateDispute); // Either party initiates dispute

// MILESTONE PAYMENT ROUTES (FRAUD PREVENTION FOR LARGE PROJECTS)
router.post("/:orderId/milestones", verifyToken, createMilestones); // Client creates project milestones
router.post("/:orderId/milestones/:milestoneIndex/submit", verifyToken, submitMilestoneWork); // Submit milestone work
router.post("/:orderId/milestones/:milestoneIndex/approve", verifyToken, approveMilestone); // Approve milestone
router.post("/:orderId/milestones/:milestoneIndex/revise", verifyToken, requestMilestoneRevision); // Request milestone revision

// RECOVERY ROUTES
router.post("/:orderId/reset-for-resubmission", verifyToken, resetOrderForResubmission); // Reset stuck order for re-submission

// ADMIN/SYSTEM ROUTES
router.post("/auto-release/check", checkAutoRelease); // System endpoint for auto-releasing payments

export default router;