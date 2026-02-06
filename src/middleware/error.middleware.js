const logger = require("../config/logger");
const ApiError = require("../utils/ApiError");

/**
 * Global error handler middleware
 */
const errorHandler = (err, req, res, next) => {
  // Log the error
  logger.error("Error:", {
    message: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
  });

  // Handle known API errors
  if (err instanceof ApiError) {
    return res.status(err.statusCode).json({
      success: false,
      error: err.message,
      details: err.details,
    });
  }

  // Handle Prisma errors
  if (err.code) {
    switch (err.code) {
      case "P2002":
        return res.status(409).json({
          success: false,
          error: "A record with this value already exists",
          details: err.meta,
        });
      case "P2025":
        return res.status(404).json({
          success: false,
          error: "Record not found",
        });
      default:
        break;
    }
  }

  // Handle validation errors
  if (err.name === "ValidationError") {
    return res.status(400).json({
      success: false,
      error: "Validation failed",
      details: err.errors,
    });
  }

  // Default server error
  res.status(500).json({
    success: false,
    error:
      process.env.NODE_ENV === "production"
        ? "Internal server error"
        : err.message,
  });
};

/**
 * 404 handler for undefined routes
 */
const notFoundHandler = (req, res) => {
  res.status(404).json({
    success: false,
    error: `Route not found: ${req.method} ${req.path}`,
  });
};

module.exports = {
  errorHandler,
  notFoundHandler,
};
