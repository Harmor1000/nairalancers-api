import express from "express";
import {
  requestRegistrationVerification,
  verifyRegistrationEmail,
  resendRegistrationVerification,
  changeRegistrationEmail,
} from "../controllers/registrationVerification.controller.js";

const router = express.Router();

// Request registration email verification
router.post("/request", requestRegistrationVerification);

// Verify registration email code
router.post("/verify", verifyRegistrationEmail);

// Resend registration verification code
router.post("/resend", resendRegistrationVerification);

// Change email during registration verification
router.post("/change-email", changeRegistrationEmail);

export default router;
