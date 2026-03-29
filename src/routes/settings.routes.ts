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
      select: { id: true, fullName: true, email: true, phone: true, createdAt: true },
    });

    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    res.json({ user });
  } catch (err) {
    console.error("Get profile error:", err);
    res.status(500).json({ error: "Failed to fetch profile" });
  }
});

// ─── PATCH /api/settings/profile ─────────────────────────────
router.patch("/profile", authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { fullName, phone } = req.body;

    const updated = await prisma.user.update({
      where: { id: req.userId },
      data: {
        ...(fullName && { fullName }),
        ...(phone && { phone }),
      },
      select: { id: true, fullName: true, email: true, phone: true },
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
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const isValid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!isValid) {
      res.status(400).json({ error: "Current password is incorrect" });
      return;
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);
    await prisma.user.update({
      where: { id: req.userId },
      data: { passwordHash },
    });

    res.json({ message: "Password updated successfully" });
  } catch (err) {
    console.error("Update security error:", err);
    res.status(500).json({ error: "Failed to update password" });
  }
});

export default router;
