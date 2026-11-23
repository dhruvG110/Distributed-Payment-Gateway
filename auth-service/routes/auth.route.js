
import express from "express";
import rateLimiter from "../middleware/rateLimiter.js";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { z } from "zod";
import prisma from "../db.js";
import authMiddleware from "../middleware/auth.middleware.js";

const router = express.Router();


// Register validation schema
const registerSchema = z.object({
    name: z.string()
        .trim()
        .min(2, "Name must contain at least 2 characters")
        .max(100, "Name is too long"),

    email: z.string()
        .trim()
        .email("Invalid email address")
        .max(255)
        .transform(value => value.toLowerCase()),

    password: z.string()
        .min(8, "Password must be at least 8 characters")
        .max(72, "Password cannot exceed 72 characters")
}).strict();


// Sign in validation schema
const signinSchema = z.object({
    email: z.string()
        .trim()
        .email("Invalid email address")
        .max(255)
        .transform(value => value.toLowerCase()),

    password: z.string()
        .min(1, "Password is required")
        .max(72, "Invalid password")
}).strict();
// REGISTER API
router.post("/register", rateLimiter, async (req, res) => {
    try {
        const validation = registerSchema.safeParse(req.body);
        if (!validation.success) {
            return res.status(400).json({
                success: false,
                message: validation.error.issues[0].message
            });
        }

        const { name, email, password } = validation.data;
        const normalizedEmail = email.trim().toLowerCase();

        // Check existing user
        const existingUser = await prisma.users.findUnique({
            where: {
                email: normalizedEmail
            }
        });

        if (existingUser) {
            return res.status(409).json({
                success: false,
                message: "Email already registered"
            });
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 12);

        // Create user
        const user = await prisma.users.create({
            data: {
                name: name.trim(),
                email: normalizedEmail,
                password_hash: hashedPassword
            },
            select: {
                id: true,
                name: true,
                email: true,
                role: true,
                created_at: true
            }
        });

        return res.status(201).json({
            success: true,
            message: "Registration successful",
            user
        });

    } catch (error) {
        console.error("Register Error:", error);

        if (error.code === "P2002") {
            return res.status(409).json({
                success: false,
                message: "Email already registered"
            });
        }

        return res.status(500).json({
            success: false,
            message: "Internal server error"
        });
    }
});


// SIGN IN API
router.post("/signin", rateLimiter, async (req, res) => {
    try {
        const validation = signinSchema.safeParse(req.body);
        if (!validation.success) {
            return res.status(400).json({
                success: false,
                message: validation.error.issues[0].message
            });
        }

        const { email, password } = validation.data;
        const normalizedEmail = email.trim().toLowerCase();

        // Find user
        const user = await prisma.users.findUnique({
            where: {
                email: normalizedEmail
            }
        });

        if (!user) {
            return res.status(401).json({
                success: false,
                message: "Invalid email or password"
            });
        }

        // Compare password
        const isPasswordValid = await bcrypt.compare(
            password,
            user.password_hash
        );

        if (!isPasswordValid) {
            return res.status(401).json({
                success: false,
                message: "Invalid email or password"
            });
        }

        // Generate JWT
        const token = jwt.sign(
            {
                sub: user.id,
                role: user.role
            },
            process.env.JWT_SECRET,
            {
                expiresIn: "15m"
            }
        );

        // Set HTTP-only cookie
        res.cookie("access_token", token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            maxAge: 15 * 60 * 1000
        });

        return res.status(200).json({
            success: true,
            message: "Sign in successful",
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role
            }
        });

    } catch (error) {
        console.error("Signin Error:", error);

        return res.status(500).json({
            success: false,
            message: "Internal server error"
        });
    }
});
// LOGOUT API
router.post("/logout", authMiddleware, (req, res) => {
    try {
        res.clearCookie("access_token", {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            path: "/"
        });

        return res.status(200).json({
            success: true,
            message: "Logged out successfully"
        });

    } catch (error) {
        console.error("Logout Error:", error);

        return res.status(500).json({
            success: false,
            message: "Internal server error"
        });
    }
});

// GET CURRENT AUTHENTICATED USER
router.get("/me", authMiddleware, async (req, res) => {
    try {
        const user = await prisma.users.findUnique({
            where: {
                id: req.user.id
            },
            select: {
                id: true,
                name: true,
                email: true,
                role: true,
                created_at: true
            }
        });

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found"
            });
        }

        return res.status(200).json({
            success: true,
            user
        });

    } catch (error) {
        console.error("Get Current User Error:", error);

        return res.status(500).json({
            success: false,
            message: "Internal server error"
        });
    }
});

export default router;
