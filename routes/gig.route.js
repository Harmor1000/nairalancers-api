import express from "express";
import {
    createGig,
    deleteGig,
    getGig,
    getGigs,
    updateGig,
    getCategories,
    pauseGig,
    resumeGig
} from "../controllers/gig.controller.js";
import { verifyToken } from "../middleware/jwt.js";

const router = express.Router();

router.post("/", verifyToken, createGig );
router.put("/:id", verifyToken, updateGig );
router.put("/:id/pause", verifyToken, pauseGig );
router.put("/:id/resume", verifyToken, resumeGig );
router.delete("/:id", verifyToken, deleteGig );
router.get("/categories", getCategories );
router.get("/single/:id", getGig );
router.get("/", getGigs );

export default router;