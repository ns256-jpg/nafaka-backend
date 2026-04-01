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
      pagination: { total, page, pages: Math.ceil(total / limit) },
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
    if (!transaction) { res.status(404).json({ error: "Transaction not found" }); return; }

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

// ─── POST /api/transactions/send ─────────────────────────────
router.post("/send", authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { phone, amount, note } = req.body;

    if (!phone || !amount || amount < 1) {
      res.status(400).json({ error: "Phone and amount are required" });
      return;
    }

    const sender = await prisma.user.findUnique({
      where: { id: req.userId },
      include: { wallet: true },
    });

    if (!sender || !sender.wallet) {
      res.status(404).json({ error: "Sender not found" });
      return;
    }

    if (Number(sender.wallet.balance) < amount) {
      res.status(400).json({ error: "Insufficient wallet balance" });
      return;
    }

    const recipient = await prisma.user.findUnique({
      where: { phone },
      include: { wallet: true },
    });

    if (!recipient || !recipient.wallet) {
      res.status(404).json({ error: "Recipient not found on NAFAKA" });
      return;
    }

    if (recipient.id === req.userId) {
      res.status(400).json({ error: "You cannot send money to yourself" });
      return;
    }

    await prisma.$transaction([
      prisma.wallet.update({ where: { userId: sender.id }, data: { balance: { decrement: amount } } }),
      prisma.wallet.update({ where: { userId: recipient.id }, data: { balance: { increment: amount } } }),
      prisma.transaction.create({
        data: {
          userId: sender.id,
          type: "SEND",
          amount,
          description: note || `Sent to ${recipient.fullName}`,
          status: "SUCCESS",
          counterparty: recipient.phone,
        },
      }),
      prisma.transaction.create({
        data: {
          userId: recipient.id,
          type: "RECEIVE",
          amount,
          description: note || `Received from ${sender.fullName}`,
          status: "SUCCESS",
          counterparty: sender.phone,
        },
      }),
      prisma.notification.create({
        data: {
          userId: sender.id,
          message: `You sent KES ${Number(amount).toLocaleString()} to ${recipient.fullName}.`,
        },
      }),
      prisma.notification.create({
        data: {
          userId: recipient.id,
          message: `You received KES ${Number(amount).toLocaleString()} from ${sender.fullName}.`,
        },
      }),
    ]);

    res.json({ message: `KES ${Number(amount).toLocaleString()} sent to ${recipient.fullName} successfully!` });
  } catch (err) {
    console.error("Send error:", err);
    res.status(500).json({ error: "Failed to send money" });
  }
});

// ─── POST /api/transactions/request ──────────────────────────
router.post("/request", authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { phone, amount, note } = req.body;

    if (!phone || !amount || amount < 1) {
      res.status(400).json({ error: "Phone and amount are required" });
      return;
    }

    const requester = await prisma.user.findUnique({ where: { id: req.userId } });
    if (!requester) { res.status(404).json({ error: "User not found" }); return; }

    const target = await prisma.user.findUnique({ where: { phone } });
    if (!target) { res.status(404).json({ error: "User not found on NAFAKA" }); return; }

    if (target.id === req.userId) {
      res.status(400).json({ error: "You cannot request money from yourself" });
      return;
    }

    await prisma.notification.create({
      data: {
        userId: target.id,
        message: `${requester.fullName} is requesting KES ${Number(amount).toLocaleString()} from you. ${note ? `Note: ${note}` : ""}`,
      },
    });

    res.json({ message: `Money request sent to ${target.fullName} successfully!` });
  } catch (err) {
    console.error("Request error:", err);
    res.status(500).json({ error: "Failed to send request" });
  }
});

export default router;