import { Router, Response } from "express";
import { authenticate, AuthRequest } from "../middleware/auth.middleware";
import prisma from "../utils/prisma";

const router = Router();

// ─── GET /api/analytics/overview ─────────────────────────────
router.get("/overview", authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);

    const [monthlyTxns, lastMonthTxns, allTxns] = await Promise.all([
      prisma.transaction.findMany({
        where: { userId: req.userId, createdAt: { gte: startOfMonth }, status: "SUCCESS" },
      }),
      prisma.transaction.findMany({
        where: {
          userId: req.userId,
          createdAt: { gte: startOfLastMonth, lte: endOfLastMonth },
          status: "SUCCESS",
        },
      }),
      prisma.transaction.findMany({
        where: { userId: req.userId, status: "SUCCESS" },
        orderBy: { createdAt: "asc" },
      }),
    ]);

    const totalDeposited = allTxns
      .filter((t) => t.type === "DEPOSIT" || t.type === "RECEIVE")
      .reduce((s, t) => s + Number(t.amount), 0);

    const totalWithdrawn = allTxns
      .filter((t) => t.type === "WITHDRAWAL" || t.type === "SEND")
      .reduce((s, t) => s + Number(t.amount), 0);

    const monthlySpend = monthlyTxns
      .filter((t) => t.type === "WITHDRAWAL" || t.type === "SEND")
      .reduce((s, t) => s + Number(t.amount), 0);

    const lastMonthSpend = lastMonthTxns
      .filter((t) => t.type === "WITHDRAWAL" || t.type === "SEND")
      .reduce((s, t) => s + Number(t.amount), 0);

    // Daily spending for current month (grouped by day)
    const dailyMap: Record<string, number> = {};
    monthlyTxns
      .filter((t) => t.type === "WITHDRAWAL" || t.type === "SEND")
      .forEach((t) => {
        const day = t.createdAt.toISOString().slice(0, 10);
        dailyMap[day] = (dailyMap[day] || 0) + Number(t.amount);
      });

    const dailySpending = Object.entries(dailyMap).map(([date, amount]) => ({
      date,
      amount,
    }));

    // Monthly spending for last 6 months
    const monthlyMap: Record<string, number> = {};
    allTxns
      .filter((t) => t.type === "WITHDRAWAL" || t.type === "SEND")
      .forEach((t) => {
        const month = t.createdAt.toISOString().slice(0, 7);
        monthlyMap[month] = (monthlyMap[month] || 0) + Number(t.amount);
      });

    const monthlySpending = Object.entries(monthlyMap)
      .slice(-6)
      .map(([month, amount]) => ({ month, amount }));

    res.json({
      summary: {
        totalDeposited,
        totalWithdrawn,
        monthlySpend,
        lastMonthSpend,
        spendChange:
          lastMonthSpend > 0
            ? (((monthlySpend - lastMonthSpend) / lastMonthSpend) * 100).toFixed(1)
            : "0",
      },
      dailySpending,
      monthlySpending,
    });
  } catch (err) {
    console.error("Analytics error:", err);
    res.status(500).json({ error: "Failed to fetch analytics" });
  }
});

export default router;
