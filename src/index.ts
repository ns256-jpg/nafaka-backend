import express from "express";
import cors from "cors";
import helmet from "helmet";
import dotenv from "dotenv";
import rateLimit from "express-rate-limit";

import authRoutes from "./routes/auth.routes";
import walletRoutes from "./routes/wallet.routes";
import transactionRoutes from "./routes/transaction.routes";
import mpesaRoutes from "./routes/mpesa.routes";
import notificationRoutes from "./routes/notification.routes";
import analyticsRoutes from "./routes/analytics.routes";
import rewardRoutes from "./routes/reward.routes";
import settingsRoutes from "./routes/settings.routes";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// ─── Security ────────────────────────────────────────────────
app.use(helmet());
app.use(
  cors({
    origin: [
      "http://localhost:5173",
      "https://nafaka-wallet.vercel.app",
      process.env.FRONTEND_URL || "",
    ],
    credentials: true,
  })
);

// ─── Rate Limiting ───────────────────────────────────────────
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { error: "Too many requests, please try again later." },
});
app.use("/api", limiter);

// ─── Body Parsing ────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ─── Routes ──────────────────────────────────────────────────
app.use("/api/auth", authRoutes);
app.use("/api/wallet", walletRoutes);
app.use("/api/transactions", transactionRoutes);
app.use("/api/mpesa", mpesaRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/analytics", analyticsRoutes);
app.use("/api/rewards", rewardRoutes);
app.use("/api/settings", settingsRoutes);

// ─── Health Check ────────────────────────────────────────────
app.get("/health", (_req, res) => {
  res.json({ status: "NAFAKA API is running", timestamp: new Date().toISOString() });
});

// ─── Global Error Handler ────────────────────────────────────
app.use(
  (
    err: Error,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction
  ) => {
    console.error("Unhandled error:", err.message);
    res.status(500).json({ error: "Internal server error" });
  }
);

app.listen(PORT, () => {
  console.log(`🚀 NAFAKA API running on port ${PORT}`);
});

export default app;