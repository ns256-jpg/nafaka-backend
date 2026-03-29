import { Router, Response } from "express";
import { authenticate, AuthRequest } from "../middleware/auth.middleware";
import prisma from "../utils/prisma";

const router = Router();

// ─── GET /api/rewards ─────────────────────────────────────────
router.get("/", authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userRewards = await prisma.userReward.findMany({
      where: { userId: req.userId },
      include: { reward: true },
    });

    res.json({ rewards: userRewards });
  } catch (err) {
    console.error("Get rewards error:", err);
    res.status(500).json({ error: "Failed to fetch rewards" });
  }
});

// ─── POST /api/rewards/:id/redeem ─────────────────────────────
router.post("/:id/redeem", authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userReward = await prisma.userReward.findFirst({
      where: { id: req.params.id, userId: req.userId, redeemed: false },
      include: { reward: true },
    });

    if (!userReward) {
      res.status(404).json({ error: "Reward not found or already redeemed" });
      return;
    }

    await prisma.$transaction(async (tx) => {
      await tx.userReward.update({
        where: { id: userReward.id },
        data: { redeemed: true, redeemedAt: new Date() },
      });

      // If cashback reward, credit wallet
      if (userReward.reward.type === "CASHBACK" || userReward.reward.type === "REFERRAL") {
        const cashAmount = userReward.reward.points;
        await tx.wallet.update({
          where: { userId: req.userId },
          data: { balance: { increment: cashAmount } },
        });
        await tx.transaction.create({
          data: {
            userId: req.userId as string,
            type: "RECEIVE",
            amount: cashAmount,
            description: `Reward redeemed: ${userReward.reward.name}`,
            status: "SUCCESS",
          },
        });
        await tx.notification.create({
          data: {
            userId: req.userId as string,
            message: `Reward "${userReward.reward.name}" redeemed! KES ${cashAmount} added to your wallet.`,
          },
        });
      }
    });

    res.json({ message: "Reward redeemed successfully!" });
  } catch (err) {
    console.error("Redeem reward error:", err);
    res.status(500).json({ error: "Failed to redeem reward" });
  }
});

export default router;
