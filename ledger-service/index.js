import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import prisma from "./db.js";
import ledgerRoutes from "./routes/ledger.route.js";
dotenv.config();

const app = express();
app.use(cors());
app.use(helmet());
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const PORT = process.env.PORT || 4000;
app.get("/health", (req, res) => {
    res.send({
        success: true,
        service: "Ledger Service",
        status: "Running"
    });
});
app.use("/api/ledger", ledgerRoutes);
app.listen(PORT, () => {
    console.log(`Ledger Service running on port ${PORT}`);
});