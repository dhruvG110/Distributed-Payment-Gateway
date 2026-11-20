
import "dotenv/config";
import { Ratelimit } from "@upstash/ratelimit";
import redis from "../config/redis.js";

const ledgerRateLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(100, "1 m"),
  prefix: "paymesh:ledger",
});

const rateLimiter = async (req, res, next) => {
  try {
    const identifier = req.ip || "unknown";

    const { success, limit, remaining, reset } =
      await ledgerRateLimiter.limit(identifier);

    res.set("RateLimit-Limit", String(limit));
    res.set("RateLimit-Remaining", String(remaining));
    res.set("RateLimit-Reset", String(Math.ceil(reset / 1000)));

    if (!success) {
      return res.status(429).json({
        success: false,
        message: "Too many ledger requests. Try again later.",
      });
    }

    next();
  } catch (error) {
    console.error("Ledger rate limiter error:", error);

    return res.status(503).json({
      success: false,
      message: "Rate limiting service unavailable.",
    });
  }
};

export default rateLimiter;
