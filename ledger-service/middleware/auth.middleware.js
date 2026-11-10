
const internalAuth = (req, res, next) => {
    const secret = req.headers["x-internal-secret"];

    if (
        !secret ||
        secret !== process.env.INTERNAL_API_SECRET
    ) {
        return res.status(401).json({
            success: false,
            message: "Unauthorized internal request"
        });
    }

    next();
};

export default internalAuth;
