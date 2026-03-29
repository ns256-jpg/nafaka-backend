import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT),
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

// ─── Verify Email ────────────────────────────────────────────
export const sendVerificationEmail = async (
  to: string,
  name: string,
  token: string
): Promise<void> => {
  const verifyUrl = `${process.env.FRONTEND_URL}/verify-email?token=${token}`;

  await transporter.sendMail({
    from: process.env.EMAIL_FROM,
    to,
    subject: "Verify your NAFAKA account",
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;background:#0f172a;color:#fff;padding:30px;border-radius:12px;">
        <h1 style="color:#3b82f6;">NAFAKA Wallet</h1>
        <h2>Welcome, ${name}! 👋</h2>
        <p>Please verify your email address to activate your account.</p>
        <a href="${verifyUrl}" style="display:inline-block;background:linear-gradient(135deg,#1d4ed8,#9333ea);color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;margin:20px 0;">
          Verify Email
        </a>
        <p style="opacity:0.6;font-size:12px;">This link expires in 24 hours. If you didn't create a NAFAKA account, ignore this email.</p>
      </div>
    `,
  });
};

// ─── Password Reset ──────────────────────────────────────────
export const sendPasswordResetEmail = async (
  to: string,
  name: string,
  token: string
): Promise<void> => {
  const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${token}`;

  await transporter.sendMail({
    from: process.env.EMAIL_FROM,
    to,
    subject: "Reset your NAFAKA password",
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;background:#0f172a;color:#fff;padding:30px;border-radius:12px;">
        <h1 style="color:#3b82f6;">NAFAKA Wallet</h1>
        <h2>Password Reset Request</h2>
        <p>Hi ${name}, click the button below to reset your password.</p>
        <a href="${resetUrl}" style="display:inline-block;background:#ef4444;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;margin:20px 0;">
          Reset Password
        </a>
        <p style="opacity:0.6;font-size:12px;">This link expires in 1 hour. If you didn't request this, ignore this email.</p>
      </div>
    `,
  });
};

// ─── Transaction Confirmation ────────────────────────────────
export const sendTransactionEmail = async (
  to: string,
  name: string,
  type: string,
  amount: number,
  description: string,
  txnId: string
): Promise<void> => {
  const isCredit = ["DEPOSIT", "RECEIVE"].includes(type);
  const color = isCredit ? "#22c55e" : "#ef4444";
  const sign = isCredit ? "+" : "-";

  await transporter.sendMail({
    from: process.env.EMAIL_FROM,
    to,
    subject: `NAFAKA Transaction: ${type} of KES ${amount.toLocaleString()}`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;background:#0f172a;color:#fff;padding:30px;border-radius:12px;">
        <h1 style="color:#3b82f6;">NAFAKA Wallet</h1>
        <h2>Transaction Confirmation</h2>
        <p>Hi ${name}, your transaction was processed successfully.</p>
        <div style="background:#1e293b;padding:20px;border-radius:10px;margin:20px 0;">
          <p><strong>Type:</strong> ${type}</p>
          <p><strong>Amount:</strong> <span style="color:${color};font-size:20px;">${sign}KES ${amount.toLocaleString()}</span></p>
          <p><strong>Description:</strong> ${description}</p>
          <p><strong>Transaction ID:</strong> ${txnId}</p>
          <p><strong>Date:</strong> ${new Date().toLocaleString("en-KE")}</p>
        </div>
        <p style="opacity:0.6;font-size:12px;">If you did not initiate this transaction, contact support immediately.</p>
      </div>
    `,
  });
};

// ─── Notification Email ──────────────────────────────────────
export const sendNotificationEmail = async (
  to: string,
  name: string,
  message: string
): Promise<void> => {
  await transporter.sendMail({
    from: process.env.EMAIL_FROM,
    to,
    subject: "NAFAKA Notification",
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;background:#0f172a;color:#fff;padding:30px;border-radius:12px;">
        <h1 style="color:#3b82f6;">NAFAKA Wallet</h1>
        <h2>New Notification</h2>
        <p>Hi ${name},</p>
        <div style="background:#1e293b;padding:20px;border-radius:10px;margin:20px 0;">
          <p>${message}</p>
        </div>
      </div>
    `,
  });
};
