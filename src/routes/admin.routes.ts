import { Router, Response, NextFunction } from "express";
import { authenticate, AuthRequest } from "../middleware/auth.middleware";
import prisma from "../utils/prisma";

const router = Router();

// ─── Admin middleware ─────────────────────────────────────────
const adminOnly = (req: AuthRequest, res: Response, next: NextFunction): void => {
  if ((req as AuthRequest & { role?: string }).role !== "ADMIN") {
    res.status(403).json({ error: "Admin access required" });
    return;
  }
  next();
};

// ─── GET /api/admin/stats ─────────────────────────────────────
router.get("/stats", authenticate, adminOnly, async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const [totalUsers, totalTransactions, wallets, flaggedCount] = await Promise.all([
      prisma.user.count({ where: { role: "USER" } }),
      prisma.transaction.count(),
      prisma.wallet.aggregate({ _sum: { balance: true } }),
      prisma.transaction.count({ where: { flagged: true } }),
    ]);

    const totalVolume = await prisma.transaction.aggregate({
      where: { status: "SUCCESS" },
      _sum: { amount: true, fee: true },
    });

    const recentTransactions = await prisma.transaction.findMany({
      orderBy: { createdAt: "desc" },
      take: 10,
      include: { user: { select: { fullName: true, username: true, email: true } } },
    });

    res.json({
      totalUsers,
      totalTransactions,
      totalWalletBalance: Number(wallets._sum.balance || 0),
      totalVolume: Number(totalVolume._sum.amount || 0),
      totalFees: Number(totalVolume._sum.fee || 0),
      flaggedCount,
      recentTransactions: recentTransactions.map(tx => ({
        id: tx.id,
        type: tx.type,
        amount: Number(tx.amount),
        fee: Number(tx.fee),
        status: tx.status,
        flagged: tx.flagged,
        createdAt: tx.createdAt,
        user: tx.user,
      })),
    });
  } catch (err) {
    console.error("Admin stats error:", err);
    res.status(500).json({ error: "Failed to fetch stats" });
  }
});

// ─── GET /api/admin/users ─────────────────────────────────────
router.get("/users", authenticate, adminOnly, async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const users = await prisma.user.findMany({
      where: { role: "USER" },
      include: { wallet: true },
      orderBy: { createdAt: "desc" },
    });

    res.json({
      users: users.map(u => ({
        id: u.id,
        fullName: u.fullName,
        email: u.email,
        phone: u.phone,
        username: u.username,
        balance: Number(u.wallet?.balance || 0),
        createdAt: u.createdAt,
      })),
    });
  } catch (err) {
    console.error("Admin users error:", err);
    res.status(500).json({ error: "Failed to fetch users" });
  }
});

// ─── GET /api/admin/transactions ──────────────────────────────
router.get("/transactions", authenticate, adminOnly, async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const transactions = await prisma.transaction.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { user: { select: { fullName: true, username: true } } },
    });

    res.json({
      transactions: transactions.map(tx => ({
        id: tx.id,
        type: tx.type,
        amount: Number(tx.amount),
        fee: Number(tx.fee),
        description: tx.description,
        status: tx.status,
        flagged: tx.flagged,
        counterparty: tx.counterparty,
        createdAt: tx.createdAt,
        user: tx.user,
      })),
    });
  } catch (err) {
    console.error("Admin transactions error:", err);
    res.status(500).json({ error: "Failed to fetch transactions" });
  }
});

// ─── GET /api/admin/flagged ───────────────────────────────────
router.get("/flagged", authenticate, adminOnly, async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    // Flag large transactions above KES 50,000
    await prisma.transaction.updateMany({
      where: { amount: { gte: 50000 }, flagged: false },
      data: { flagged: true },
    });

    const flagged = await prisma.transaction.findMany({
      where: { flagged: true },
      include: { user: { select: { fullName: true, username: true, email: true } } },
      orderBy: { createdAt: "desc" },
    });

    res.json({
      flagged: flagged.map(tx => ({
        id: tx.id,
        type: tx.type,
        amount: Number(tx.amount),
        status: tx.status,
        createdAt: tx.createdAt,
        user: tx.user,
        reason: Number(tx.amount) >= 50000 ? "Large transaction above KES 50,000" : "Manually flagged",
      })),
    });
  } catch (err) {
    console.error("Admin flagged error:", err);
    res.status(500).json({ error: "Failed to fetch flagged transactions" });
  }
});

export default router;