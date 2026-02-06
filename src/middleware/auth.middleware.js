const jwt = require("jsonwebtoken");
const config = require("../config");
const ApiError = require("../utils/ApiError");
const prisma = require("../config/database");

/**
 * Authentication middleware
 * Verifies JWT token and attaches user to request
 */
const authenticate = async (req, res, next) => {
  try {
    // Get token from header
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      throw ApiError.unauthorized("No token provided");
    }

    const token = authHeader.split(" ")[1];

    // Verify token
    let decoded;
    try {
      decoded = jwt.verify(token, config.jwt.secret);
    } catch (error) {
      if (error.name === "TokenExpiredError") {
        throw ApiError.unauthorized("Token expired");
      }
      throw ApiError.unauthorized("Invalid token");
    }

    // Get user from database
    const user = await prisma.adminUser.findUnique({
      where: { id: decoded.userId },
    });

    if (!user || !user.isActive) {
      throw ApiError.unauthorized("User not found or inactive");
    }

    // Attach user to request
    req.user = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    };

    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Admin-only middleware
 */
const adminOnly = (req, res, next) => {
  if (req.user?.role !== "admin") {
    return next(ApiError.forbidden("Admin access required"));
  }
  next();
};

module.exports = {
  authenticate,
  adminOnly,
};
