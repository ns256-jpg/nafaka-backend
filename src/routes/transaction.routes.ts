import { Router, Response } from "express";
import { authenticate, AuthRequest } from "../middleware/auth.middleware";
import prisma from "../utils/prisma";

const router = Router();

// ─── GET /api/transactions ────────────────────────────────────
router.get("/", authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const skip = (page - 1) * limit;

    const [transactions, total] = await Promise.all([
      prisma.transaction.findMany({
        where: { userId: req.userId },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.transaction.count({ where: { userId: req.userId } }),
    ]);

    res.json({
      transactions: transactions.map((tx) => ({
        id: tx.id,
        type: tx.type,
        amount: Number(tx.amount),
        description: tx.description,
        status: tx.status,
        mpesaRef: tx.mpesaRef,
        counterparty: tx.counterparty,
        createdAt: tx.createdAt,
      })),
      pagination: {
        total,
        page,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    console.error("Get transactions error:", err);
    res.status(500).json({ error: "Failed to fetch transactions" });
  }
});

// ─── GET /api/transactions/:id ────────────────────────────────
router.get("/:id", authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const transaction = await prisma.transaction.findFirst({
      where: { id: req.params.id, userId: req.userId },
    });

    if (!transaction) {
      res.status(404).json({ error: "Transaction not found" });
      return;
    }

    const user = await prisma.user.findUnique({ where: { id: req.userId } });

    res.json({
      id: transaction.id,
      type: transaction.type,
      amount: Number(transaction.amount),
      description: transaction.description,
      status: transaction.status,
      mpesaRef: transaction.mpesaRef,
      counterparty: transaction.counterparty,
      createdAt: transaction.createdAt,
      receipt: {
        transactionId: transaction.id,
        date: transaction.createdAt.toLocaleString("en-KE"),
        type: transaction.type,
        amount: `KES ${Number(transaction.amount).toLocaleString()}`,
        status: transaction.status,
        mpesaRef: transaction.mpesaRef || "N/A",
        accountName: user?.fullName || "N/A",
        phone: user?.phone || "N/A",
      },
    });
  } catch (err) {
    console.error("Get transaction error:", err);
    res.status(500).json({ error: "Failed to fetch transaction" });
  }
});

export default router;
