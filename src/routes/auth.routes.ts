import { Router, Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { v4 as uuidv4 } from "uuid";
import prisma from "../utils/prisma";
import {
  sendVerificationEmail,
  sendPasswordResetEmail,
} from "../services/email.service";

const router = Router();

// ─── Register ────────────────────────────────────────────────
router.post("/register", async (req: Request, res: Response): Promise<void> => {
  try {
    const { fullName, email, phone, password } = req.body;

    if (!fullName || !email || !phone || !password) {
      res.status(400).json({ error: "All fields are required" });
      return;
    }

    const existingUser = await prisma.user.findFirst({
      where: { OR: [{ email }, { phone }] },
    });

    if (existingUser) {
      res.status(409).json({ error: "Email or phone already registered" });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const emailVerifyToken = uuidv4();

    const user = await prisma.user.create({
      data: {
        fullName,
        email,
        phone,
        passwordHash,
        emailVerifyToken,
        wallet: { create: { balance: 0 } },
      },
    });

    // Seed default rewards for new user
    const rewards = await prisma.reward.findMany({ where: { isActive: true } });
    if (rewards.length > 0) {
      await prisma.userReward.createMany({
        data: rewards.map((r) => ({ userId: user.id, rewardId: r.id })),
      });
    }

try {
  await sendVerificationEmail(email, fullName, emailVerifyToken);
} catch (emailError) {
  console.error("Email sending failed:", emailError);
}
    res.status(201).json({
      message: "Account created. Please check your email to verify your account.",
    });
  } catch (err) {
    console.error("Register error:", err);
    res.status(500).json({ error: "Registration failed" });
  }
});

// ─── Verify Email ────────────────────────────────────────────
router.get("/verify-email", async (req: Request, res: Response): Promise<void> => {
  try {
    const { token } = req.query;

    const user = await prisma.user.findFirst({
      where: { emailVerifyToken: token as string },
    });

    if (!user) {
      res.status(400).json({ error: "Invalid or expired verification token" });
      return;
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { isEmailVerified: true, emailVerifyToken: null },
    });

    res.json({ message: "Email verified successfully. You can now log in." });
  } catch (err) {
    console.error("Verify email error:", err);
    res.status(500).json({ error: "Email verification failed" });
  }
});

// ─── Login ───────────────────────────────────────────────────
router.post("/login", async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      res.status(400).json({ error: "Email and password are required" });
      return;
    }

    const user = await prisma.user.findUnique({ where: { email } });

    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      res.status(401).json({ error: "Invalid email or password" });
      return;
    }

    if (!user.isEmailVerified) {
      res.status(403).json({ error: "Please verify your email before logging in" });
      return;
    }

    const token = jwt.sign(
  { userId: user.id },
  process.env.JWT_SECRET as string,
  { expiresIn: "7d" }
);

    res.json({
      token,
      user: {
        id: user.id,
        fullName: user.fullName,
        email: user.email,
        phone: user.phone,
      },
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ error: "Login failed" });
  }
});

// ─── Forgot Password ─────────────────────────────────────────
router.post("/forgot-password", async (req: Request, res: Response): Promise<void> => {
  try {
    const { email } = req.body;
    const user = await prisma.user.findUnique({ where: { email } });

    // Always return success to prevent email enumeration
    if (!user) {
      res.json({ message: "If that email exists, a reset link has been sent." });
      return;
    }

    const resetToken = uuidv4();
    const expiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await prisma.user.update({
      where: { id: user.id },
      data: { resetPasswordToken: resetToken, resetPasswordExpiry: expiry },
    });

    await sendPasswordResetEmail(email, user.fullName, resetToken);

    res.json({ message: "If that email exists, a reset link has been sent." });
  } catch (err) {
    console.error("Forgot password error:", err);
    res.status(500).json({ error: "Failed to process request" });
  }
});

// ─── Reset Password ──────────────────────────────────────────
router.post("/reset-password", async (req: Request, res: Response): Promise<void> => {
  try {
    const { token, newPassword } = req.body;

    const user = await prisma.user.findFirst({
      where: {
        resetPasswordToken: token,
        resetPasswordExpiry: { gt: new Date() },
      },
    });

    if (!user) {
      res.status(400).json({ error: "Invalid or expired reset token" });
      return;
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        resetPasswordToken: null,
        resetPasswordExpiry: null,
      },
    });

    res.json({ message: "Password reset successfully. You can now log in." });
  } catch (err) {
    console.error("Reset password error:", err);
    res.status(500).json({ error: "Password reset failed" });
  }
});

export default router;
