import { Router, Request, Response } from "express";
import { authenticate, AuthRequest } from "../middleware/auth.middleware";
import prisma from "../utils/prisma";

const router = Router();

// ─── POST /api/mpesa/deposit ──────────────────────────────────
router.post("/deposit", authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { amount } = req.body;
    if (!amount || amount < 1) {
      res.status(400).json({ error: "Minimum deposit amount is KES 1" });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      include: { wallet: true },
    });
    if (!user || !user.wallet) { res.status(404).json({ error: "User not found" }); return; }

    await prisma.$transaction([
      prisma.wallet.update({
        where: { userId: user.id },
        data: { balance: { increment: amount } },
      }),
      prisma.transaction.create({
        data: {
          userId: user.id,
          type: "DEPOSIT",
          amount,
          fee: 0,
          description: "M-Pesa Deposit",
          status: "SUCCESS",
        },
      }),
      prisma.notification.create({
        data: {
          userId: user.id,
          message: `✅ Deposit of KES ${Number(amount).toLocaleString()} received successfully.`,
          type: "TRANSACTION",
          link: "/transactions",
        },
      }),
    ]);

    res.json({ message: "Processing" });
  } catch (err) {
    console.error("Deposit error:", err);
    res.status(500).json({ error: "Deposit failed" });
  }
});

// ─── POST /api/mpesa/withdraw ─────────────────────────────────
router.post("/withdraw", authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { amount } = req.body;
    if (!amount || amount < 1) {
      res.status(400).json({ error: "Minimum withdrawal amount is KES 1" });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      include: { wallet: true },
    });
    if (!user || !user.wallet) { res.status(404).json({ error: "User not found" }); return; }

    // Calculate fee: 1% of amount, minimum KES 5
    const fee = Math.max(Math.ceil(amount * 0.01), 5);
    const totalDeduction = amount + fee;

    if (Number(user.wallet.balance) < totalDeduction) {
      res.status(400).json({ error: `Insufficient balance. Amount: KES ${amount} + Fee: KES ${fee} = KES ${totalDeduction}` });
      return;
    }

    // Check daily limit
    if (user.wallet.dailyLimit) {
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const dailySpent = await prisma.transaction.aggregate({
        where: { userId: user.id, type: { in: ["WITHDRAWAL", "SEND"] }, status: "SUCCESS", createdAt: { gte: today } },
        _sum: { amount: true },
      });
      if (Number(dailySpent._sum.amount || 0) + amount > Number(user.wallet.dailyLimit)) {
        res.status(400).json({ error: `Daily spending limit of KES ${Number(user.wallet.dailyLimit).toLocaleString()} exceeded` });
        return;
      }
    }

    // Check monthly limit
    if (user.wallet.monthlyLimit) {
      const startOfMonth = new Date(); startOfMonth.setDate(1); startOfMonth.setHours(0, 0, 0, 0);
      const monthlySpent = await prisma.transaction.aggregate({
        where: { userId: user.id, type: { in: ["WITHDRAWAL", "SEND"] }, status: "SUCCESS", createdAt: { gte: startOfMonth } },
        _sum: { amount: true },
      });
      if (Number(monthlySpent._sum.amount || 0) + amount > Number(user.wallet.monthlyLimit)) {
        res.status(400).json({ error: `Monthly spending limit of KES ${Number(user.wallet.monthlyLimit).toLocaleString()} exceeded` });
        return;
      }
    }

    await prisma.$transaction([
      prisma.wallet.update({
        where: { userId: user.id },
        data: { balance: { decrement: totalDeduction } },
      }),
      prisma.transaction.create({
        data: {
          userId: user.id,
          type: "WITHDRAWAL",
          amount,
          fee,
          description: "M-Pesa Withdrawal",
          status: "SUCCESS",
        },
      }),
      prisma.notification.create({
        data: {
          userId: user.id,
          message: `✅ Withdrawal of KES ${Number(amount).toLocaleString()} to M-Pesa successful. Fee charged: KES ${fee}.`,
          type: "TRANSACTION",
          link: "/transactions",
        },
      }),
    ]);

    // Check spending limits after withdrawal and warn if close
    await checkAndWarnLimits(user.id, user.wallet);

    res.json({ message: `Withdrawal initiated. KES ${amount.toLocaleString()} will be sent to your M-Pesa shortly. Fee: KES ${fee}.` });
  } catch (err) {
    console.error("Withdraw error:", err);
    res.status(500).json({ error: "Withdrawal failed" });
  }
});

// ─── Helper: Check and warn spending limits ───────────────────
async function checkAndWarnLimits(userId: string, wallet: { dailyLimit: unknown; monthlyLimit: unknown }) {
  try {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const startOfMonth = new Date(); startOfMonth.setDate(1); startOfMonth.setHours(0, 0, 0, 0);

    if (wallet.dailyLimit) {
      const dailySpent = await prisma.transaction.aggregate({
        where: { userId, type: { in: ["WITHDRAWAL", "SEND"] }, status: "SUCCESS", createdAt: { gte: today } },
        _sum: { amount: true },
      });
      const percentage = (Number(dailySpent._sum.amount || 0) / Number(wallet.dailyLimit)) * 100;
      if (percentage >= 80 && percentage < 100) {
        await prisma.notification.create({
          data: {
            userId,
            message: `⚠️ You have used ${percentage.toFixed(0)}% of your daily spending limit of KES ${Number(wallet.dailyLimit).toLocaleString()}.`,
            type: "WARNING",
          },
        });
      } else if (percentage >= 100) {
        await prisma.notification.create({
          data: {
            userId,
            message: `🚫 You have reached your daily spending limit of KES ${Number(wallet.dailyLimit).toLocaleString()}. Further transactions are blocked until tomorrow.`,
            type: "WARNING",
          },
        });
      }
    }

    if (wallet.monthlyLimit) {
      const monthlySpent = await prisma.transaction.aggregate({
        where: { userId, type: { in: ["WITHDRAWAL", "SEND"] }, status: "SUCCESS", createdAt: { gte: startOfMonth } },
        _sum: { amount: true },
      });
      const percentage = (Number(monthlySpent._sum.amount || 0) / Number(wallet.monthlyLimit)) * 100;
      if (percentage >= 80 && percentage < 100) {
        await prisma.notification.create({
          data: {
            userId,
            message: `⚠️ You have used ${percentage.toFixed(0)}% of your monthly spending limit of KES ${Number(wallet.monthlyLimit).toLocaleString()}.`,
            type: "WARNING",
          },
        });
      }
    }
  } catch {}
}

// ─── CALLBACKS ────────────────────────────────────────────────
router.post("/callback", async (_req: Request, res: Response): Promise<void> => { res.json({ ResultCode: 0, ResultDesc: "Accepted" }); });
router.post("/b2c/result", async (_req: Request, res: Response): Promise<void> => { res.json({ ResultCode: 0, ResultDesc: "Accepted" }); });
router.post("/b2c/timeout", async (_req: Request, res: Response): Promise<void> => { res.json({ ResultCode: 0, ResultDesc: "Accepted" }); });

export default router;