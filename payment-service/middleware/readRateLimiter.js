
import "dotenv/config";
import { Ratelimit } from "@upstash/ratelimit";
import redis from "../config/redis.js";

const paymentReadLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(60, "1 m"),
  prefix: "paymesh:payment:read",
});

const readRateLimiter = async (req, res, next) => {
  try {
    const identifier = req.user.id;

    const { success, limit, remaining, reset } =
      await paymentReadLimiter.limit(identifier);

    res.set("RateLimit-Limit", String(limit));
    res.set("RateLimit-Remaining", String(remaining));
    res.set("RateLimit-Reset", String(Math.ceil(reset / 1000)));

    if (!success) {
      return res.status(429).json({
        success: false,
        message: "Too many payment read requests. Try again later.",
      });
    }

    next();
  } catch (error) {
    console.error("Payment read rate limiter error:", error);

    return res.status(503).json({
      success: false,
      message: "Rate limiting service unavailable.",
    });
  }
};

export default readRateLimiter;
