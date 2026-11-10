import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import prisma from "./db.js";
import authRoutes from "./routes/auth.route.js";
dotenv.config();
const app = express();
app.use(cookieParser());
try {
  const result = await prisma.$connect();
  console.log("Database connected:", result);
} catch (error) {
  console.error("Database connection failed:", error);
}

app.use(helmet());

app.use(cors());

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use("/api/auth", authRoutes);
app.get("/health",  (req, res) => {
  res.status(200).send("Auth service is running , Health Check Confirmed");
});
app.listen(process.env.PORT, (req) => {
  console.log(`Auth service is running on port ${process.env.PORT} `);
});
