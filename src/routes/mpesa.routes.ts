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
    const user = await prisma.user.findUnique({ where: { id: req.userId } });
    if (!user) { res.status(404).json({ error: "User not found" }); return; }

    await prisma.$transaction([
      prisma.wallet.update({ where: { userId: user.id }, data: { balance: { increment: amount } } }),
      prisma.transaction.create({ data: { userId: user.id, type: "DEPOSIT", amount, description: "M-Pesa Deposit", status: "SUCCESS" } }),
      prisma.notification.create({ data: { userId: user.id, message: `Deposit of KES ${Number(amount).toLocaleString()} successful.` } }),
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
    const user = await prisma.user.findUnique({ where: { id: req.userId } });
    if (!user) { res.status(404).json({ error: "User not found" }); return; }

    const wallet = await prisma.wallet.findUnique({ where: { userId: user.id } });
    if (!wallet || Number(wallet.balance) < amount) {
      res.status(400).json({ error: "Insufficient wallet balance" });
      return;
    }

    await prisma.$transaction([
      prisma.wallet.update({ where: { userId: user.id }, data: { balance: { decrement: amount } } }),
      prisma.transaction.create({ data: { userId: user.id, type: "WITHDRAWAL", amount, description: "M-Pesa Withdrawal", status: "SUCCESS" } }),
      prisma.notification.create({ data: { userId: user.id, message: `Withdrawal of KES ${Number(amount).toLocaleString()} to M-Pesa successful.` } }),
    ]);

    res.json({ message: "Withdrawal initiated. Funds will be sent to your M-Pesa shortly." });
  } catch (err) {
    console.error("Withdraw error:", err);
    res.status(500).json({ error: "Withdrawal failed" });
  }
});

// ─── CALLBACKS ────────────────────────────────────────────────
router.post("/callback", async (_req: Request, res: Response): Promise<void> => { res.json({ ResultCode: 0, ResultDesc: "Accepted" }); });
router.post("/b2c/result", async (_req: Request, res: Response): Promise<void> => { res.json({ ResultCode: 0, ResultDesc: "Accepted" }); });
router.post("/b2c/timeout", async (_req: Request, res: Response): Promise<void> => { res.json({ ResultCode: 0, ResultDesc: "Accepted" }); });

export default router;