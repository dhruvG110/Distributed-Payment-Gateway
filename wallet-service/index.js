
import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import helmet from "helmet";
import prisma from "./db.js";
import cookieParser from "cookie-parser";
import walletRoutes from "./routes/wallet.route.js";
dotenv.config();

const app = express();
const PORT = process.env.PORT || 4001;
app.use(cookieParser());
try {
    await prisma.$connect();
    console.log("Database connected successfully");
} catch (error) {
    console.error("Database connection failed:", error);
    process.exit(1);
}
// Middlewares
app.use(helmet());
app.use(cors({
    credentials:true,
    origin:process.env.FRONTEND_URL
}));
app.use(express.json());

// Health Check
app.get("/health", (req, res) => {
    res.status(200).json({
        success: true,
        service: "Wallet Service",
        status: "Running"
    });
});
app.use("/api/wallet", walletRoutes);
// Start Server
app.listen(PORT, () => {
    console.log(`Wallet Service running on port ${PORT}`);
});
