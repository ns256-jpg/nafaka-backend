import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding database...");

  // ─── Admin User ───────────────────────────────────────────
  const adminPassword = await bcrypt.hash("Admin@Nafaka2026", 12);
  const admin = await prisma.user.upsert({
    where: { email: "admin@nafaka.co.ke" },
    update: {},
    create: {
      fullName: "NAFAKA Admin",
      email: "admin@nafaka.co.ke",
      phone: "0700000000",
      username: "nafaka_admin",
      passwordHash: adminPassword,
      role: "ADMIN",
      isEmailVerified: true,
    },
  });
  console.log("✅ Admin user created:", admin.email);

  // ─── Rewards ──────────────────────────────────────────────
  await prisma.reward.createMany({
    data: [
      {
        name: "Energy Reward",
        description: "Earn 500 points for daily transactions",
        points: 500,
        type: "POINTS",
        isActive: true,
      },
      {
        name: "Referral Bonus",
        description: "Invite a friend and get KES 100",
        points: 100,
        type: "REFERRAL",
        isActive: true,
      },
      {
        name: "Cashback Offer",
        description: "Get 5% cashback on your total deposits",
        points: 500,
        type: "CASHBACK",
        isActive: true,
      },
    ],
    skipDuplicates: true,
  });
  console.log("✅ Rewards seeded.");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());