
import "dotenv/config";
import { Ratelimit } from "@upstash/ratelimit";
import redis from "../config/redis.js";

const walletRateLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(1000, "15 m"),
  prefix: "paymesh:wallet",
});

const rateLimiter = async (req, res, next) => {
  try {
    const identifier = req.ip || "unknown";

    const { success, limit, remaining, reset } =
      await walletRateLimiter.limit(identifier);

    res.set("RateLimit-Limit", String(limit));
    res.set("RateLimit-Remaining", String(remaining));
    res.set("RateLimit-Reset", String(Math.ceil(reset / 1000)));

    if (!success) {
      return res.status(429).json({
        success: false,
        message: "Too many wallet requests. Try again later.",
      });
    }

    next();
  } catch (error) {
    console.error("Wallet rate limiter error:", error);

    return res.status(503).json({
      success: false,
      message: "Rate limiting service unavailable.",
    });
  }
};

export default rateLimiter;
