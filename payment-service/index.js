import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import paymentRoutes from "./routes/payment.route.js";
import {
  startPaymentWorker,
  stopPaymentWorker,
} from "./service/paymentWorker.js";
dotenv.config();

const app = express();
const port = process.env.PORT || 4002;

app.use(cors({
  origin:process.env.FRONTEND_URL,
  credentials:true,
  
}));
app.use(helmet());
app.use(express.json());
app.use(cookieParser());
app.use("/api/payments", paymentRoutes);
app.get("/health", (_req, res) =>
  res.status(200).json({
    success: true,
    service: "Payment Service",
    status: "Running",
  }),
);

const server = app.listen(port, () => {
  console.log(`Payment Service running on port ${port}`);
  startPaymentWorker();
});
process.on("SIGTERM", () => {
  stopPaymentWorker();
  process.exit(0);
});
