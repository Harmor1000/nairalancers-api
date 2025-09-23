import express from "express";
import { verifyToken } from "../middleware/jwt.js";
import {
    createReview,
    getReviews,
    deleteReview,
    voteHelpful,
    reportReview,
    getUserVote,
} from "../controllers/review.controller.js";

const router = express.Router();

router.post("/", verifyToken, createReview)
router.get("/:gigId", getReviews)
router.delete("/:id", verifyToken, deleteReview)

// Review helpfulness and reporting
router.post("/:reviewId/vote", verifyToken, voteHelpful)
router.post("/:reviewId/report", verifyToken, reportReview)
router.get("/:reviewId/vote", verifyToken, getUserVote)

export default router;