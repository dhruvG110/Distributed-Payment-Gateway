import { Ratelimit } from "@upstash/ratelimit";
import redis from "../config/redis.js";
import "dotenv/config";
const ratelimit = new Ratelimit({
  redis: redis,
  limiter: Ratelimit.slidingWindow(10, "15 m"),
  prefix: "paymesh:auth",
});
const rateLimiter = async (req, res, next) => {
  try {
    const identifier = req.ip || "unknown";

    const { success, limit, remaining, reset } =
      await ratelimit.limit(identifier);

    res.set("RateLimit-Limit", String(limit));
    res.set("RateLimit-Remaining", String(remaining));
    res.set("RateLimit-Reset", String(Math.ceil(reset / 1000)));

    if (!success) {
      return res.status(429).json({
        success: false,
        message: "Kindly try again later.",
      });
    }

    next();
  } catch (error) {
    console.error("Rate limiter error:", error);

    return res.status(503).json({
      success: false,
      message: "Rate limiting service unavailable.",
    });
  }
};
export default rateLimiter;
