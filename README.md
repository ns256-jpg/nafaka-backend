# NAFAKA Wallet — Backend Setup & Deployment Guide

## Project Structure

```
nafaka-backend/
├── prisma/
│   ├── schema.prisma       # Database schema
│   └── seed.ts             # Default rewards seed
├── src/
│   ├── index.ts            # Express server entry
│   ├── middleware/
│   │   └── auth.middleware.ts
│   ├── routes/
│   │   ├── auth.routes.ts
│   │   ├── wallet.routes.ts
│   │   ├── mpesa.routes.ts
│   │   ├── transaction.routes.ts
│   │   ├── notification.routes.ts
│   │   ├── analytics.routes.ts
│   │   ├── reward.routes.ts
│   │   └── settings.routes.ts
│   ├── services/
│   │   ├── mpesa.service.ts
│   │   └── email.service.ts
│   └── utils/
│       └── prisma.ts
├── App.tsx                 # Updated frontend (replace your existing one)
├── App.additional.css      # New CSS classes (append to your App.css)
├── .env.example
├── render.yaml
└── package.json
```

---

## Step 1 — Install Dependencies

```bash
cd nafaka-backend
npm install
```

---

## Step 2 — Set Up Environment Variables

Copy `.env.example` to `.env` and fill in your values:

```bash
cp .env.example .env
```

### DATABASE_URL (MySQL)
Format: `mysql://USER:PASSWORD@HOST:3306/nafaka_db`

For local development, install MySQL and create the database:
```sql
CREATE DATABASE nafaka_db;
```

### JWT_SECRET
Generate a strong random string:
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

### Gmail App Password (SMTP)
1. Go to your Google Account → Security
2. Enable 2-Step Verification
3. Search "App passwords" → Create one for "Mail"
4. Copy the 16-character password into `SMTP_PASS`

### M-Pesa Sandbox Credentials
From your Safaricom Daraja developer portal:
- `MPESA_CONSUMER_KEY` and `MPESA_CONSUMER_SECRET` — from your app
- `MPESA_SHORTCODE` — sandbox shortcode (e.g. `174379`)
- `MPESA_PASSKEY` — from Daraja sandbox
- `MPESA_CALLBACK_URL` — your Render URL + `/api/mpesa/callback`
- `MPESA_B2C_RESULT_URL` — your Render URL + `/api/mpesa/b2c/result`
- `MPESA_B2C_QUEUE_TIMEOUT_URL` — your Render URL + `/api/mpesa/b2c/timeout`

---

## Step 3 — Run Database Migrations

```bash
npx prisma migrate dev --name init
npx prisma generate
```

Seed default rewards:
```bash
npx ts-node prisma/seed.ts
```

---

## Step 4 — Run Locally

```bash
npm run dev
```

API runs at: `http://localhost:5000`
Health check: `http://localhost:5000/health`

---

## Step 5 — Update Your Frontend

1. **Replace** your `src/App.tsx` with the new `App.tsx` from this package
2. **Append** the contents of `App.additional.css` to the bottom of your `App.css`
3. Install new frontend dependencies:

```bash
npm install recharts
```

4. Create a `.env` file in your frontend root:

```
VITE_API_URL=http://localhost:5000/api
```

For production, change this to your Render URL:
```
VITE_API_URL=https://your-nafaka-app.onrender.com/api
```

---

## Step 6 — Deploy to Render

### A. Push to GitHub

```bash
git init
git add .
git commit -m "Initial NAFAKA backend"
git remote add origin https://github.com/YOUR_USERNAME/nafaka-backend.git
git push -u origin main
```

### B. Create Render Web Service

1. Go to [render.com](https://render.com) → New → Web Service
2. Connect your GitHub repo
3. Settings:
   - **Build Command:** `npm install && npx prisma generate && npx prisma migrate deploy && npm run build`
   - **Start Command:** `npm start`
   - **Environment:** Node

### C. Add a MySQL Database

1. On Render → New → MySQL (or use PlanetScale / Railway MySQL)
2. Copy the connection string into the `DATABASE_URL` env var

### D. Add All Environment Variables

In Render dashboard → Your Service → Environment, add all variables from `.env.example`.

### E. Update M-Pesa Callback URLs

Once deployed, update these in your Render env vars:
```
MPESA_CALLBACK_URL=https://your-nafaka-app.onrender.com/api/mpesa/callback
MPESA_B2C_RESULT_URL=https://your-nafaka-app.onrender.com/api/mpesa/b2c/result
MPESA_B2C_QUEUE_TIMEOUT_URL=https://your-nafaka-app.onrender.com/api/mpesa/b2c/timeout
```

Also update these in the Safaricom Daraja portal under your app's callback settings.

---

## API Reference

### Auth
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/register` | Register new user |
| GET | `/api/auth/verify-email?token=` | Verify email |
| POST | `/api/auth/login` | Login → returns JWT |
| POST | `/api/auth/forgot-password` | Send reset email |
| POST | `/api/auth/reset-password` | Reset password |

### Wallet
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/wallet` | ✅ | Get balance |

### M-Pesa
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/mpesa/deposit` | ✅ | Initiate STK Push |
| POST | `/api/mpesa/withdraw` | ✅ | Initiate B2C withdrawal |
| POST | `/api/mpesa/callback` | ❌ | M-Pesa STK callback |
| POST | `/api/mpesa/b2c/result` | ❌ | M-Pesa B2C result |

### Transactions
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/transactions` | ✅ | List all transactions |
| GET | `/api/transactions/:id` | ✅ | Get single + receipt data |

### Notifications
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/notifications` | ✅ | List notifications |
| PATCH | `/api/notifications/mark-all-read` | ✅ | Mark all read |
| PATCH | `/api/notifications/:id/read` | ✅ | Mark one read |

### Analytics
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/analytics/overview` | ✅ | Summary + daily + monthly data |

### Rewards
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/rewards` | ✅ | List user rewards |
| POST | `/api/rewards/:id/redeem` | ✅ | Redeem a reward |

### Settings
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/settings/profile` | ✅ | Get profile |
| PATCH | `/api/settings/profile` | ✅ | Update name/phone |
| PATCH | `/api/settings/security` | ✅ | Change password |

---

## M-Pesa Flow Explained

### Deposit (STK Push)
1. User enters amount → clicks "Deposit via M-Pesa"
2. Backend calls Safaricom STK Push API
3. User gets a prompt on their phone → enters M-Pesa PIN
4. Safaricom calls `/api/mpesa/callback` with result
5. If success → wallet balance is credited + email sent
6. If failed → transaction marked FAILED + notification created

### Withdrawal (B2C)
1. User enters amount → clicks "Withdraw to M-Pesa"
2. Backend checks sufficient balance → deducts immediately
3. Calls Safaricom B2C API
4. Safaricom calls `/api/mpesa/b2c/result` with result
5. If success → transaction marked SUCCESS + email sent
6. If failed → balance is refunded + notification created

---

## Troubleshooting

**"Cannot find module" errors**
```bash
npx prisma generate
```

**Database connection errors**
- Check `DATABASE_URL` format: `mysql://user:pass@host:3306/dbname`
- Ensure MySQL is running locally

**M-Pesa callback not received locally**
- Use [ngrok](https://ngrok.com) to expose localhost:
```bash
ngrok http 5000
```
- Use the ngrok URL as your `MPESA_CALLBACK_URL`

**Email not sending**
- Confirm Gmail 2FA is enabled
- Confirm App Password (not your Gmail password) is used
- Check `SMTP_USER` matches the Gmail account
