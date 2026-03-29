import { Router, Request, Response } from "express";
import { authenticate, AuthRequest } from "../middleware/auth.middleware";
import { initiateSTKPush, initiateB2C } from "../services/mpesa.service";
import { sendTransactionEmail } from "../services/email.service";
import prisma from "../utils/prisma";

const router = Router();

// ─── POST /api/mpesa/deposit ──────────────────────────────────
// Initiates STK Push for deposit
router.post("/deposit", authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { amount } = req.body;

    if (!amount || amount < 10) {
      res.status(400).json({ error: "Minimum deposit amount is KES 10" });
      return;
    }

    const user = await prisma.user.findUnique({ where: { id: req.userId } });
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const stkResponse = await initiateSTKPush(
      user.phone,
      amount,
      `NAFAKA-${user.id.slice(0, 8).toUpperCase()}`,
      "NAFAKA Wallet Deposit"
    );

    if (stkResponse.ResponseCode !== "0") {
      res.status(400).json({ error: "Failed to initiate M-Pesa payment" });
      return;
    }

    // Create a PENDING transaction
    const transaction = await prisma.transaction.create({
      data: {
        userId: user.id,
        type: "DEPOSIT",
        amount,
        description: "M-Pesa Deposit",
        status: "PENDING",
        checkoutRequestId: stkResponse.CheckoutRequestID,
      },
    });

    res.json({
      message: stkResponse.CustomerMessage,
      checkoutRequestId: stkResponse.CheckoutRequestID,
      transactionId: transaction.id,
    });
  } catch (err) {
    console.error("Deposit error:", err);
    res.status(500).json({ error: "Deposit initiation failed" });
  }
});

// ─── POST /api/mpesa/withdraw ─────────────────────────────────
// Initiates B2C withdrawal to user's phone
router.post("/withdraw", authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { amount } = req.body;

    if (!amount || amount < 10) {
      res.status(400).json({ error: "Minimum withdrawal amount is KES 10" });
      return;
    }

    const user = await prisma.user.findUnique({ where: { id: req.userId } });
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const wallet = await prisma.wallet.findUnique({ where: { userId: user.id } });
    if (!wallet || Number(wallet.balance) < amount) {
      res.status(400).json({ error: "Insufficient wallet balance" });
      return;
    }

    const b2cResponse = await initiateB2C(
      user.phone,
      amount,
      "NAFAKA Wallet Withdrawal"
    );

    // Deduct balance immediately and create PENDING transaction
    await prisma.$transaction([
      prisma.wallet.update({
        where: { userId: user.id },
        data: { balance: { decrement: amount } },
      }),
      prisma.transaction.create({
        data: {
          userId: user.id,
          type: "WITHDRAWAL",
          amount,
          description: "M-Pesa Withdrawal",
          status: "PENDING",
          mpesaRef: b2cResponse.ConversationID,
        },
      }),
    ]);

    res.json({
      message: "Withdrawal initiated. Funds will be sent to your M-Pesa shortly.",
      conversationId: b2cResponse.ConversationID,
    });
  } catch (err) {
    console.error("Withdraw error:", err);
    res.status(500).json({ error: "Withdrawal failed" });
  }
});

// ─── POST /api/mpesa/callback ─────────────────────────────────
// M-Pesa STK Push callback (Safaricom calls this)
router.post("/callback", async (req: Request, res: Response): Promise<void> => {
  try {
    const body = req.body?.Body?.stkCallback;

    if (!body) {
      res.json({ ResultCode: 0, ResultDesc: "Accepted" });
      return;
    }

    const { CheckoutRequestID, ResultCode, CallbackMetadata } = body;

    const transaction = await prisma.transaction.findFirst({
      where: { checkoutRequestId: CheckoutRequestID },
      include: { user: true },
    });

    if (!transaction) {
      res.json({ ResultCode: 0, ResultDesc: "Accepted" });
      return;
    }

    if (ResultCode === 0) {
      // Payment successful — credit wallet
      const items = CallbackMetadata?.Item || [];
      const mpesaRef = items.find((i: { Name: string }) => i.Name === "MpesaReceiptNumber")?.Value || "";

      await prisma.$transaction([
        prisma.transaction.update({
          where: { id: transaction.id },
          data: { status: "SUCCESS", mpesaRef },
        }),
        prisma.wallet.update({
          where: { userId: transaction.userId },
          data: { balance: { increment: Number(transaction.amount) } },
        }),
        prisma.notification.create({
          data: {
            userId: transaction.userId,
            message: `Deposit of KES ${Number(transaction.amount).toLocaleString()} successful. Ref: ${mpesaRef}`,
          },
        }),
      ]);

      await sendTransactionEmail(
        transaction.user.email,
        transaction.user.fullName,
        "DEPOSIT",
        Number(transaction.amount),
        "M-Pesa Deposit",
        transaction.id
      );
    } else {
      // Payment failed
      await prisma.transaction.update({
        where: { id: transaction.id },
        data: { status: "FAILED" },
      });

      await prisma.notification.create({
        data: {
          userId: transaction.userId,
          message: `Deposit of KES ${Number(transaction.amount).toLocaleString()} failed. Please try again.`,
        },
      });
    }

    res.json({ ResultCode: 0, ResultDesc: "Accepted" });
  } catch (err) {
    console.error("STK Callback error:", err);
    res.json({ ResultCode: 0, ResultDesc: "Accepted" }); // Always acknowledge
  }
});

// ─── POST /api/mpesa/b2c/result ───────────────────────────────
// M-Pesa B2C result callback
router.post("/b2c/result", async (req: Request, res: Response): Promise<void> => {
  try {
    const result = req.body?.Result;

    if (!result) {
      res.json({ ResultCode: 0, ResultDesc: "Accepted" });
      return;
    }

    const { ConversationID, ResultCode } = result;

    const transaction = await prisma.transaction.findFirst({
      where: { mpesaRef: ConversationID },
      include: { user: true },
    });

    if (!transaction) {
      res.json({ ResultCode: 0, ResultDesc: "Accepted" });
      return;
    }

    if (ResultCode === 0) {
      await prisma.transaction.update({
        where: { id: transaction.id },
        data: { status: "SUCCESS" },
      });

      await prisma.notification.create({
        data: {
          userId: transaction.userId,
          message: `Withdrawal of KES ${Number(transaction.amount).toLocaleString()} to M-Pesa successful.`,
        },
      });

      await sendTransactionEmail(
        transaction.user.email,
        transaction.user.fullName,
        "WITHDRAWAL",
        Number(transaction.amount),
        "M-Pesa Withdrawal",
        transaction.id
      );
    } else {
      // Refund balance on failure
      await prisma.$transaction([
        prisma.transaction.update({
          where: { id: transaction.id },
          data: { status: "FAILED" },
        }),
        prisma.wallet.update({
          where: { userId: transaction.userId },
          data: { balance: { increment: Number(transaction.amount) } },
        }),
        prisma.notification.create({
          data: {
            userId: transaction.userId,
            message: `Withdrawal of KES ${Number(transaction.amount).toLocaleString()} failed. Amount refunded to wallet.`,
          },
        }),
      ]);
    }

    res.json({ ResultCode: 0, ResultDesc: "Accepted" });
  } catch (err) {
    console.error("B2C Result error:", err);
    res.json({ ResultCode: 0, ResultDesc: "Accepted" });
  }
});

// ─── POST /api/mpesa/b2c/timeout ──────────────────────────────
router.post("/b2c/timeout", async (_req: Request, res: Response): Promise<void> => {
  console.warn("B2C timeout received");
  res.json({ ResultCode: 0, ResultDesc: "Accepted" });
});

export default router;
