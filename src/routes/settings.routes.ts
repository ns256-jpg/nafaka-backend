import { Router, Response } from "express";
import bcrypt from "bcryptjs";
import { authenticate, AuthRequest } from "../middleware/auth.middleware";
import prisma from "../utils/prisma";

const router = Router();

// ─── GET /api/settings/profile ────────────────────────────────
router.get("/profile", authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { id: true, fullName: true, email: true, phone: true, username: true, createdAt: true },
    });
    if (!user) { res.status(404).json({ error: "User not found" }); return; }
    res.json({ user });
  } catch (err) {
    console.error("Get profile error:", err);
    res.status(500).json({ error: "Failed to fetch profile" });
  }
});

// ─── PATCH /api/settings/profile ─────────────────────────────
router.patch("/profile", authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { fullName, phone, username } = req.body;

    if (username) {
      const existing = await prisma.user.findFirst({
        where: { username: username.toLowerCase(), NOT: { id: req.userId } },
      });
      if (existing) { res.status(409).json({ error: "Username already taken" }); return; }
    }

    const updated = await prisma.user.update({
      where: { id: req.userId },
      data: {
        ...(fullName && { fullName }),
        ...(phone && { phone }),
        ...(username && { username: username.toLowerCase() }),
      },
      select: { id: true, fullName: true, email: true, phone: true, username: true },
    });

    res.json({ message: "Profile updated successfully", user: updated });
  } catch (err) {
    console.error("Update profile error:", err);
    res.status(500).json({ error: "Failed to update profile" });
  }
});

// ─── PATCH /api/settings/security ────────────────────────────
router.patch("/security", authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { currentPassword, newPassword } = req.body;
    const user = await prisma.user.findUnique({ where: { id: req.userId } });
    if (!user) { res.status(404).json({ error: "User not found" }); return; }

    const isValid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!isValid) { res.status(400).json({ error: "Current password is incorrect" }); return; }

    const passwordHash = await bcrypt.hash(newPassword, 12);
    await prisma.user.update({ where: { id: req.userId }, data: { passwordHash } });

    res.json({ message: "Password updated successfully" });
  } catch (err) {
    console.error("Update security error:", err);
    res.status(500).json({ error: "Failed to update password" });
  }
});

// ─── GET /api/settings/limits ────────────────────────────────
router.get("/limits", authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const wallet = await prisma.wallet.findUnique({ where: { userId: req.userId } });
    if (!wallet) { res.status(404).json({ error: "Wallet not found" }); return; }

    res.json({
      dailyLimit: wallet.dailyLimit ? Number(wallet.dailyLimit) : null,
      monthlyLimit: wallet.monthlyLimit ? Number(wallet.monthlyLimit) : null,
    });
  } catch (err) {
    console.error("Get limits error:", err);
    res.status(500).json({ error: "Failed to fetch limits" });
  }
});

// ─── PATCH /api/settings/limits ──────────────────────────────
router.patch("/limits", authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { dailyLimit, monthlyLimit } = req.body;

    await prisma.wallet.update({
      where: { userId: req.userId },
      data: {
        ...(dailyLimit !== undefined && { dailyLimit: dailyLimit || null }),
        ...(monthlyLimit !== undefined && { monthlyLimit: monthlyLimit || null }),
      },
    });

    await prisma.notification.create({
      data: {
        userId: req.userId as string,
        message: `Spending limits updated. Daily: ${dailyLimit ? `KES ${Number(dailyLimit).toLocaleString()}` : "None"}, Monthly: ${monthlyLimit ? `KES ${Number(monthlyLimit).toLocaleString()}` : "None"}.`,
        type: "INFO",
      },
    });

    res.json({ message: "Spending limits updated successfully" });
  } catch (err) {
    console.error("Update limits error:", err);
    res.status(500).json({ error: "Failed to update limits" });
  }
});

export default router;