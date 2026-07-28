import { Router } from "express";
import { validate } from "../../middlewares/validate";
import { authenticate } from "../../middlewares/authenticate";
import { authRateLimiter } from "../../middlewares/rateLimiter";
import {
  registerSchema,
  loginSchema,
  verifyEmailSchema,
  resendCodeSchema,
} from "./auth.schemas";
import * as authController from "./auth.controller";

const router = Router();

router.post("/register", authRateLimiter, validate(registerSchema), authController.register);
router.post("/verify-email", authRateLimiter, validate(verifyEmailSchema), authController.verifyEmail);
router.post("/resend-code", authRateLimiter, validate(resendCodeSchema), authController.resendCode);
router.post("/login", authRateLimiter, validate(loginSchema), authController.login);
// refreshToken pode vir do cookie httpOnly ou do body (ex: apps mobile) — validado no controller
router.post("/refresh", authController.refresh);
router.post("/logout", authController.logout);
router.get("/me", authenticate, authController.me);

router.get("/google", authController.googleRedirect);
router.get("/google/callback", authController.googleCallback);

export default router;