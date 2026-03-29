import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding rewards...");

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
        description: "Get 5% cashback on deposits above KES 10,000",
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
