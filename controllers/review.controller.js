import createError from "../utils/createError.js";
import Review from "../models/review.model.js";
import Gig from "../models/gig.model.js";
import Order from "../models/order.model.js";

export const createReview = async (req, res, next)=>{
    if (req.isSeller)
    return next(createError(403, "Sellers can't create a review!"));

    try {
       const alreadyReviewed = await Review.findOne({
        gigId: req.body.gigId,
        userId: req.userId,
       });

       if (alreadyReviewed) return next(createError(403, "You have already created a review for this gig!"));

        //TODO: check if the user purchased the gig.
         const ordered = await Order.findOne({
            gigId: req.body.gigId,
            buyerId: req.userId,
        });

        if (!ordered) {            
            return next(createError(403, "You can only review gigs you have ordered."));
        }


        // Get gig to find seller ID
        const gig = await Gig.findById(req.body.gigId);
        if (!gig) {
            return next(createError(404, "Gig not found"));
        }

        const newReview = new Review({
          userId: req.userId,
          gigId: req.body.gigId,
          sellerId: gig.userId,
          desc: req.body.desc,
          star: req.body.star,
        });
   
       const savedReview = await newReview.save();

       await Gig.findByIdAndUpdate(req.body.gigId, {
        $inc: {totalStars : req.body.star, starNumber:1},
    });
       res.status(201).send(savedReview);
    } catch (err) {
        next(err);
    }
}
export const getReviews = async (req, res, next)=>{
    try {
        const reviews = await Review.find({ gigId: req.params.gigId});
        console.log(reviews);
        res.status(200).send(reviews);
    } catch (err) {
        next(err);
    }
}
export const deleteReview = async (req, res, next)=>{
    try {
        const review = await Review.findById(req.params.id);
        if (!review) {
            return next(createError(404, "Review not found"));
        }

        if (review.userId !== req.userId) {
            return next(createError(403, "You can only delete your own reviews"));
        }

        await Review.findByIdAndDelete(req.params.id);
        res.status(200).send("Review deleted successfully");
    } catch (err) {
        next(err);
    }
}

// Vote on review helpfulness
export const voteHelpful = async (req, res, next) => {
    try {
        const { reviewId } = req.params;
        const { vote } = req.body; // 'yes' or 'no'
        const userId = req.userId;

        if (!['yes', 'no'].includes(vote)) {
            return next(createError(400, "Vote must be 'yes' or 'no'"));
        }

        const review = await Review.findById(reviewId);
        if (!review) {
            return next(createError(404, "Review not found"));
        }

        // Check if user already voted
        const existingVoteIndex = review.helpfulVotes.findIndex(v => v.userId === userId);
        
        if (existingVoteIndex !== -1) {
            // User already voted, update their vote
            const previousVote = review.helpfulVotes[existingVoteIndex].vote;
            
            // Remove previous vote from score
            review.helpfulScore[previousVote]--;
            
            // Update vote
            review.helpfulVotes[existingVoteIndex].vote = vote;
            review.helpfulVotes[existingVoteIndex].createdAt = new Date();
        } else {
            // New vote
            review.helpfulVotes.push({ userId, vote });
        }

        // Update score
        review.helpfulScore[vote]++;

        await review.save();

        res.status(200).json({
            helpfulScore: review.helpfulScore,
            userVote: vote
        });
    } catch (err) {
        next(err);
    }
};

// Report a review
export const reportReview = async (req, res, next) => {
    try {
        const { reviewId } = req.params;
        const { reason, description } = req.body;
        const userId = req.userId;

        if (!['spam', 'inappropriate', 'fake', 'harassment', 'other'].includes(reason)) {
            return next(createError(400, "Invalid report reason"));
        }

        const review = await Review.findById(reviewId);
        if (!review) {
            return next(createError(404, "Review not found"));
        }

        // Check if user already reported this review
        const existingReport = review.reports.find(r => r.userId === userId);
        if (existingReport) {
            return next(createError(400, "You have already reported this review"));
        }

        // Add report
        review.reports.push({
            userId,
            reason,
            description: description || "",
        });

        review.isReported = true;

        await review.save();

        res.status(200).json({ message: "Review reported successfully" });
    } catch (err) {
        next(err);
    }
};

// Get user's vote on a review
export const getUserVote = async (req, res, next) => {
    try {
        const { reviewId } = req.params;
        const userId = req.userId;

        const review = await Review.findById(reviewId);
        if (!review) {
            return next(createError(404, "Review not found"));
        }

        const userVote = review.helpfulVotes.find(v => v.userId === userId);

        res.status(200).json({
            helpfulScore: review.helpfulScore,
            userVote: userVote ? userVote.vote : null
        });
    } catch (err) {
        next(err);
    }
};