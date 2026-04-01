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

    // If no rewards found, seed them for this user
    if (userRewards.length === 0) {
      const rewards = await prisma.reward.findMany({ where: { isActive: true } });
      if (rewards.length > 0) {
        await prisma.userReward.createMany({
          data: rewards.map((r) => ({ userId: req.userId as string, rewardId: r.id })),
          skipDuplicates: true,
        });
        const newUserRewards = await prisma.userReward.findMany({
          where: { userId: req.userId },
          include: { reward: true },
        });
        res.json({ rewards: newUserRewards });
        return;
      }
    }

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

    // Calculate reward value
    let cashAmount = 0;
    let message = "";

    if (userReward.reward.type === "POINTS") {
      // Convert points to KES: 100 points = KES 1
      cashAmount = Math.floor(userReward.reward.points / 100);
      message = `Energy Reward redeemed! KES ${cashAmount} added to your wallet.`;
    } else if (userReward.reward.type === "REFERRAL") {
      cashAmount = userReward.reward.points;
      message = `Referral Bonus redeemed! KES ${cashAmount} added to your wallet.`;
    } else if (userReward.reward.type === "CASHBACK") {
      // Calculate 5% of total deposits
      const deposits = await prisma.transaction.aggregate({
        where: { userId: req.userId as string, type: "DEPOSIT", status: "SUCCESS" },
        _sum: { amount: true },
      });
      const totalDeposits = Number(deposits._sum.amount || 0);
      cashAmount = Math.floor(totalDeposits * 0.05);
      if (cashAmount < 1) cashAmount = 1; // minimum KES 1
      message = `Cashback redeemed! KES ${cashAmount} (5% of deposits) added to your wallet.`;
    }

    await prisma.$transaction([
      prisma.userReward.update({
        where: { id: userReward.id },
        data: { redeemed: true, redeemedAt: new Date() },
      }),
      prisma.wallet.update({
        where: { userId: req.userId as string },
        data: { balance: { increment: cashAmount } },
      }),
      prisma.transaction.create({
        data: {
          userId: req.userId as string,
          type: "RECEIVE",
          amount: cashAmount,
          description: `Reward: ${userReward.reward.name}`,
          status: "SUCCESS",
        },
      }),
      prisma.notification.create({
        data: {
          userId: req.userId as string,
          message,
        },
      }),
    ]);

    res.json({ message });
  } catch (err) {
    console.error("Redeem reward error:", err);
    res.status(500).json({ error: "Failed to redeem reward" });
  }
});

export default router;