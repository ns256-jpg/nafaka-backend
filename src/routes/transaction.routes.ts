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
        fee: Number(tx.fee),
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
      fee: Number(transaction.fee),
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
        fee: `KES ${Number(transaction.fee).toLocaleString()}`,
        total: `KES ${(Number(transaction.amount) + Number(transaction.fee)).toLocaleString()}`,
        status: transaction.status,
        accountName: user?.fullName || "N/A",
        username: `@${user?.username || "N/A"}`,
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
    const { username, amount, note } = req.body;

    if (!username || !amount || amount < 1) {
      res.status(400).json({ error: "Username and amount are required" });
      return;
    }

    const sender = await prisma.user.findUnique({
      where: { id: req.userId },
      include: { wallet: true },
    });
    if (!sender || !sender.wallet) { res.status(404).json({ error: "Sender not found" }); return; }

    // Calculate fee: 0.5% minimum KES 2
    const fee = Math.max(Math.ceil(amount * 0.005), 2);
    const totalDeduction = amount + fee;

    if (Number(sender.wallet.balance) < totalDeduction) {
      res.status(400).json({ error: `Insufficient balance. Amount: KES ${amount} + Fee: KES ${fee} = KES ${totalDeduction}` });
      return;
    }

    // Check daily limit
    if (sender.wallet.dailyLimit) {
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const dailySpent = await prisma.transaction.aggregate({
        where: { userId: sender.id, type: { in: ["WITHDRAWAL", "SEND"] }, status: "SUCCESS", createdAt: { gte: today } },
        _sum: { amount: true },
      });
      if (Number(dailySpent._sum.amount || 0) + amount > Number(sender.wallet.dailyLimit)) {
        res.status(400).json({ error: `Daily spending limit of KES ${Number(sender.wallet.dailyLimit).toLocaleString()} exceeded` });
        return;
      }
    }

    // Check monthly limit
    if (sender.wallet.monthlyLimit) {
      const startOfMonth = new Date(); startOfMonth.setDate(1); startOfMonth.setHours(0, 0, 0, 0);
      const monthlySpent = await prisma.transaction.aggregate({
        where: { userId: sender.id, type: { in: ["WITHDRAWAL", "SEND"] }, status: "SUCCESS", createdAt: { gte: startOfMonth } },
        _sum: { amount: true },
      });
      if (Number(monthlySpent._sum.amount || 0) + amount > Number(sender.wallet.monthlyLimit)) {
        res.status(400).json({ error: `Monthly spending limit of KES ${Number(sender.wallet.monthlyLimit).toLocaleString()} exceeded` });
        return;
      }
    }

    const cleanUsername = username.toLowerCase().replace("@", "");
    const recipient = await prisma.user.findUnique({
      where: { username: cleanUsername },
      include: { wallet: true },
    });

    if (!recipient || !recipient.wallet) {
      res.status(404).json({ error: `User @${cleanUsername} not found on NAFAKA` });
      return;
    }
    if (recipient.id === req.userId) {
      res.status(400).json({ error: "You cannot send money to yourself" });
      return;
    }

    await prisma.$transaction([
      prisma.wallet.update({ where: { userId: sender.id }, data: { balance: { decrement: totalDeduction } } }),
      prisma.wallet.update({ where: { userId: recipient.id }, data: { balance: { increment: amount } } }),
      prisma.transaction.create({
        data: {
          userId: sender.id,
          type: "SEND",
          amount,
          fee,
          description: note || `Sent to @${recipient.username}`,
          status: "SUCCESS",
          counterparty: `@${recipient.username}`,
        },
      }),
      prisma.transaction.create({
        data: {
          userId: recipient.id,
          type: "RECEIVE",
          amount,
          fee: 0,
          description: note || `Received from @${sender.username}`,
          status: "SUCCESS",
          counterparty: `@${sender.username}`,
        },
      }),
      prisma.notification.create({
        data: {
          userId: sender.id,
          message: `✅ You sent KES ${Number(amount).toLocaleString()} to @${recipient.username}. Fee: KES ${fee}.`,
          type: "TRANSACTION",
          link: "/transactions",
        },
      }),
      prisma.notification.create({
        data: {
          userId: recipient.id,
          message: `💰 You received KES ${Number(amount).toLocaleString()} from @${sender.username}.`,
          type: "TRANSACTION",
          link: "/transactions",
        },
      }),
    ]);

    res.json({ message: `KES ${Number(amount).toLocaleString()} sent to @${recipient.username} successfully! Fee charged: KES ${fee}.` });
  } catch (err) {
    console.error("Send error:", err);
    res.status(500).json({ error: "Failed to send money" });
  }
});

// ─── POST /api/transactions/request ──────────────────────────
router.post("/request", authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { username, amount, note } = req.body;

    if (!username || !amount || amount < 1) {
      res.status(400).json({ error: "Username and amount are required" });
      return;
    }

    const requester = await prisma.user.findUnique({ where: { id: req.userId } });
    if (!requester) { res.status(404).json({ error: "User not found" }); return; }

    const cleanUsername = username.toLowerCase().replace("@", "");
    const target = await prisma.user.findUnique({ where: { username: cleanUsername } });
    if (!target) { res.status(404).json({ error: `User @${cleanUsername} not found on NAFAKA` }); return; }
    if (target.id === req.userId) { res.status(400).json({ error: "You cannot request money from yourself" }); return; }

    await prisma.notification.create({
      data: {
        userId: target.id,
        message: `📨 @${requester.username} is requesting KES ${Number(amount).toLocaleString()} from you.${note ? ` Note: "${note}"` : ""} Go to your wallet to send.`,
        type: "REQUEST",
        link: "/transactions",
      },
    });

    res.json({ message: `Money request of KES ${Number(amount).toLocaleString()} sent to @${target.username} successfully!` });
  } catch (err) {
    console.error("Request error:", err);
    res.status(500).json({ error: "Failed to send request" });
  }
});

export default router;