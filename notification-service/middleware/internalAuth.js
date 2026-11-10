const internalAuth = (req, res, next) => {
  const expectedSecret = process.env.INTERNAL_API_SECRET;
  const suppliedSecret = req.headers["x-internal-secret"];

  if (!expectedSecret) {
    return res.status(503).json({
      success: false,
      message: "Internal authentication is not configured",
    });
  }

  if (
    typeof suppliedSecret !== "string" ||
    suppliedSecret.length === 0 ||
    suppliedSecret !== expectedSecret
  ) {
    return res.status(401).json({
      success: false,
      message: "Unauthorized internal request",
    });
  }

  return next();
};

export default internalAuth;
