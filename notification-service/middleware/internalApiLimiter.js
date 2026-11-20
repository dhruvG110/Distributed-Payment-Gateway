import "dotenv/config";
import { Ratelimit } from "@upstash/ratelimit";
import redis from "../config/redis.js";

const internalNotificationRateLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(100, "1 m"),
  prefix: "paymesh:notification:internal",
});

const internalRateLimiter = async (req, res, next) => {
  try {
    const identifier = req.ip || "unknown";

    const { success, limit, remaining, reset } =
      await internalNotificationRateLimiter.limit(identifier);

    res.set("RateLimit-Limit", String(limit));
    res.set("RateLimit-Remaining", String(remaining));
    res.set("RateLimit-Reset", String(Math.ceil(reset / 1000)));

    if (!success) {
      return res.status(429).json({
        success: false,
        message: "Too many internal notification requests.",
      });
    }

    next();
  } catch (error) {
    console.error("Internal notification rate limiter error:", error);

    return res.status(503).json({
      success: false,
      message: "Rate limiting service unavailable.",
    });
  }
};

export default internalRateLimiter;