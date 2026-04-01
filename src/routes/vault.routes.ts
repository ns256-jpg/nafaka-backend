import { Router, Response } from "express";
import { authenticate, AuthRequest } from "../middleware/auth.middleware";
import prisma from "../utils/prisma";

const router = Router();

// ─── GET /api/vault ───────────────────────────────────────────
router.get("/", authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    let vault = await prisma.savingsVault.findUnique({ where: { userId: req.userId } });
    if (!vault) {
      vault = await prisma.savingsVault.create({ data: { userId: req.userId as string, balance: 0 } });
    }
    res.json({ balance: Number(vault.balance), goal: vault.goal ? Number(vault.goal) : null, goalName: vault.goalName });
  } catch (err) {
    console.error("Get vault error:", err);
    res.status(500).json({ error: "Failed to fetch vault" });
  }
});

// ─── POST /api/vault/deposit ──────────────────────────────────
router.post("/deposit", authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { amount } = req.body;
    if (!amount || amount < 1) { res.status(400).json({ error: "Minimum vault deposit is KES 1" }); return; }

    const wallet = await prisma.wallet.findUnique({ where: { userId: req.userId } });
    if (!wallet || Number(wallet.balance) < amount) {
      res.status(400).json({ error: "Insufficient wallet balance" });
      return;
    }

    await prisma.$transaction([
      prisma.wallet.update({ where: { userId: req.userId as string }, data: { balance: { decrement: amount } } }),
      prisma.savingsVault.update({ where: { userId: req.userId as string }, data: { balance: { increment: amount } } }),
      prisma.transaction.create({
        data: {
          userId: req.userId as string,
          type: "VAULT_DEPOSIT",
          amount,
          fee: 0,
          description: "Savings Vault Deposit",
          status: "SUCCESS",
        },
      }),
      prisma.notification.create({
        data: {
          userId: req.userId as string,
          message: `🏦 KES ${Number(amount).toLocaleString()} moved to your Savings Vault.`,
          type: "INFO",
        },
      }),
    ]);

    res.json({ message: `KES ${Number(amount).toLocaleString()} added to your Savings Vault!` });
  } catch (err) {
    console.error("Vault deposit error:", err);
    res.status(500).json({ error: "Vault deposit failed" });
  }
});

// ─── POST /api/vault/withdraw ─────────────────────────────────
router.post("/withdraw", authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { amount } = req.body;
    if (!amount || amount < 1) { res.status(400).json({ error: "Minimum vault withdrawal is KES 1" }); return; }

    const vault = await prisma.savingsVault.findUnique({ where: { userId: req.userId } });
    if (!vault || Number(vault.balance) < amount) {
      res.status(400).json({ error: "Insufficient vault balance" });
      return;
    }

    await prisma.$transaction([
      prisma.savingsVault.update({ where: { userId: req.userId as string }, data: { balance: { decrement: amount } } }),
      prisma.wallet.update({ where: { userId: req.userId as string }, data: { balance: { increment: amount } } }),
      prisma.transaction.create({
        data: {
          userId: req.userId as string,
          type: "VAULT_WITHDRAWAL",
          amount,
          fee: 0,
          description: "Savings Vault Withdrawal",
          status: "SUCCESS",
        },
      }),
      prisma.notification.create({
        data: {
          userId: req.userId as string,
          message: `🏦 KES ${Number(amount).toLocaleString()} withdrawn from your Savings Vault to wallet.`,
          type: "INFO",
        },
      }),
    ]);

    res.json({ message: `KES ${Number(amount).toLocaleString()} withdrawn from Savings Vault to your wallet!` });
  } catch (err) {
    console.error("Vault withdrawal error:", err);
    res.status(500).json({ error: "Vault withdrawal failed" });
  }
});

// ─── PATCH /api/vault/goal ────────────────────────────────────
router.patch("/goal", authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { goal, goalName } = req.body;
    await prisma.savingsVault.update({
      where: { userId: req.userId as string },
      data: { goal: goal || null, goalName: goalName || null },
    });
    res.json({ message: "Savings goal updated!" });
  } catch (err) {
    console.error("Update goal error:", err);
    res.status(500).json({ error: "Failed to update goal" });
  }
});

export default router;