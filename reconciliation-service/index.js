import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import prisma from "./db.js";
import reconciliationRoutes from "./routes/reconciliation.route.js";

const app = express();
const port = process.env.PORT || 3006;

app.use(helmet());
app.use(cors({
  credentials:true,
  origin:process.env.FRONTEND_URL
}));
app.use(express.json());
app.use(cookieParser());
try {
  await prisma.$connect();
  console.log("DB CONNECTED")
} catch (error) {
  console.log("error")
}
app.get("/health", (_req, res) =>
  res.status(200).json({
    success: true,
    service: "Reconciliation Service",
    status: "Running",
  }),
);
app.use("/api/reconciliation", reconciliationRoutes);

try {
  await prisma.$connect();
} catch (error) {
  console.error("Reconciliation database connection failed:", error);
  process.exit(1);
}

const server = app.listen(port, () => {
  console.log(`Reconciliation Service running on port ${port}`);
});

const shutdown = () => {
  server.close(async (error) => {
    if (error) {
      console.error("Reconciliation Service shutdown failed:", error);
      process.exitCode = 1;
    }
    await prisma.$disconnect();
  });
};

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
