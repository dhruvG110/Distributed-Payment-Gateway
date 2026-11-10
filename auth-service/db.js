import { PrismaClient } from "./generated/prisma/client.ts";
import { PrismaPg } from "@prisma/adapter-pg";
import dotenv from "dotenv";

dotenv.config();

const adapter = new PrismaPg({
  connectionString: process.env.DB_URL,
});

const prisma = new PrismaClient({
  adapter,
});

try {
  await prisma.$connect();
  console.log("Prisma connected successfully");
} catch (error) {
  console.error("Prisma connection failed:", error);
  process.exit(1);
}

export default prisma;