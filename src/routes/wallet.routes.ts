import { Router, Response } from "express";
import { authenticate, AuthRequest } from "../middleware/auth.middleware";
import prisma from "../utils/prisma";

const router = Router();

// ─── GET /api/wallet ─────────────────────────────────────────
router.get("/", authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const wallet = await prisma.wallet.findUnique({
      where: { userId: req.userId },
    });

    if (!wallet) {
      res.status(404).json({ error: "Wallet not found" });
      return;
    }

    res.json({
      balance: Number(wallet.balance),
      currency: "KES",
      updatedAt: wallet.updatedAt,
    });
  } catch (err) {
    console.error("Get wallet error:", err);
    res.status(500).json({ error: "Failed to fetch wallet" });
  }
});

export default router;
