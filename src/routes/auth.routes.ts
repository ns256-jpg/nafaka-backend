import { Router, Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { v4 as uuidv4 } from "uuid";
import prisma from "../utils/prisma";
import { sendVerificationEmail, sendPasswordResetEmail } from "../services/email.service";

const router = Router();

// ─── Register ────────────────────────────────────────────────
router.post("/register", async (req: Request, res: Response): Promise<void> => {
  try {
    const { fullName, email, phone, username, password } = req.body;

    if (!fullName || !email || !phone || !username || !password) {
      res.status(400).json({ error: "All fields are required" });
      return;
    }

    // Validate username format
    const usernameRegex = /^[a-zA-Z0-9_]{3,20}$/;
    if (!usernameRegex.test(username)) {
      res.status(400).json({ error: "Username must be 3-20 characters, letters, numbers and underscores only" });
      return;
    }

    const existingUser = await prisma.user.findFirst({
      where: { OR: [{ email }, { phone }, { username }] },
    });

    if (existingUser) {
      if (existingUser.email === email) {
        res.status(409).json({ error: "Email already registered" });
      } else if (existingUser.phone === phone) {
        res.status(409).json({ error: "Phone number already registered" });
      } else {
        res.status(409).json({ error: "Username already taken" });
      }
      return;
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const emailVerifyToken = uuidv4();

    const user = await prisma.user.create({
      data: {
        fullName,
        email,
        phone,
        username: username.toLowerCase(),
        passwordHash,
        emailVerifyToken,
        isEmailVerified: true,
        wallet: { create: { balance: 0 } },
      },
    });

    // Seed rewards for new user
    const rewards = await prisma.reward.findMany({ where: { isActive: true } });
    if (rewards.length > 0) {
      await prisma.userReward.createMany({
        data: rewards.map((r) => ({ userId: user.id, rewardId: r.id })),
        skipDuplicates: true,
      });
    }

    try {
      await sendVerificationEmail(email, fullName, emailVerifyToken);
    } catch {
      console.error("Email sending failed — continuing registration");
    }

    res.status(201).json({ message: "Account created successfully. You can now log in." });
  } catch (err) {
    console.error("Register error:", err);
    res.status(500).json({ error: "Registration failed" });
  }
});

// ─── Verify Email ────────────────────────────────────────────
router.get("/verify-email", async (req: Request, res: Response): Promise<void> => {
  try {
    const { token } = req.query;
    const user = await prisma.user.findFirst({ where: { emailVerifyToken: token as string } });
    if (!user) { res.status(400).json({ error: "Invalid or expired token" }); return; }
    await prisma.user.update({
      where: { id: user.id },
      data: { isEmailVerified: true, emailVerifyToken: null },
    });
    res.json({ message: "Email verified successfully." });
  } catch (err) {
    console.error("Verify email error:", err);
    res.status(500).json({ error: "Verification failed" });
  }
});

// ─── Login ───────────────────────────────────────────────────
router.post("/login", async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password } = req.body;
    if (!email || !password) { res.status(400).json({ error: "Email and password are required" }); return; }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      res.status(401).json({ error: "Invalid email or password" });
      return;
    }

    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET as string, { expiresIn: "7d" });

    res.json({
      token,
      user: {
        id: user.id,
        fullName: user.fullName,
        email: user.email,
        phone: user.phone,
        username: user.username,
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
    if (!user) { res.json({ message: "If that email exists, a reset link has been sent." }); return; }

    const resetToken = uuidv4();
    const expiry = new Date(Date.now() + 60 * 60 * 1000);

    await prisma.user.update({
      where: { id: user.id },
      data: { resetPasswordToken: resetToken, resetPasswordExpiry: expiry },
    });

    try {
      await sendPasswordResetEmail(email, user.fullName, resetToken);
    } catch {
      console.error("Password reset email failed");
    }

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
      where: { resetPasswordToken: token, resetPasswordExpiry: { gt: new Date() } },
    });
    if (!user) { res.status(400).json({ error: "Invalid or expired reset token" }); return; }

    const passwordHash = await bcrypt.hash(newPassword, 12);
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash, resetPasswordToken: null, resetPasswordExpiry: null },
    });

    res.json({ message: "Password reset successfully." });
  } catch (err) {
    console.error("Reset password error:", err);
    res.status(500).json({ error: "Password reset failed" });
  }
});

export default router;