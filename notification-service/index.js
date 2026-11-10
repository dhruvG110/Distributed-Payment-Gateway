import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import prisma from "./db.js";
import notificationRoutes from "./routes/notification.route.js";

const app = express();
const port = process.env.PORT || 4004;

app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(cookieParser());

app.get("/health", (_req, res) => {
  return res.status(200).json({
    success: true,
    service: "Notification Service",
    status: "Running",
  });
});
app.use("/api/notifications", notificationRoutes);

try {
  await prisma.$connect();
} catch (error) {
  console.error("Notification database connection failed:", error);
  process.exit(1);
}

const server = app.listen(port, () => {
  console.log(`Notification Service running on port ${port}`);
});

const shutdown = async () => {
  server.close(async (error) => {
    if (error) {
      console.error("Notification Service HTTP shutdown failed:", error);
      process.exitCode = 1;
    }
    await prisma.$disconnect();
  });
};

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
