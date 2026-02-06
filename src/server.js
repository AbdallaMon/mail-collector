require("dotenv").config();

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const cookieParser = require("cookie-parser");
const rateLimit = require("express-rate-limit");
const path = require("path");

const config = require("./config");
const logger = require("./config/logger");
const prisma = require("./config/database");
const {
  errorHandler,
  notFoundHandler,
} = require("./middleware/error.middleware");

// Import routes
const authRoutes = require("./routes/auth.routes");
const accountsRoutes = require("./routes/accounts.routes");
const dashboardRoutes = require("./routes/dashboard.routes");
const logsRoutes = require("./routes/logs.routes");

const app = express();

// Security middleware
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
  }),
);

// CORS
app.use(
  cors({
    origin: config.frontendUrl,
    credentials: true,
  }),
);

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: {
    success: false,
    error: "Too many requests, please try again later.",
  },
});
app.use("/api", limiter);

// Body parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Logging
if (config.nodeEnv === "development") {
  app.use(morgan("dev"));
} else {
  app.use(
    morgan("combined", {
      stream: { write: (message) => logger.info(message.trim()) },
    }),
  );
}

// Health check endpoint (public)
app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// API routes
app.use("/api/auth", authRoutes);
app.use("/api/accounts", accountsRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/logs", logsRoutes);

// Serve static files from public folder
app.use(express.static(path.join(__dirname, "../public")));

// Route specific pages
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "../public/index.html"));
});

app.get("/dashboard", (req, res) => {
  res.sendFile(path.join(__dirname, "../public/dashboard.html"));
});

app.get("/accounts", (req, res) => {
  res.sendFile(path.join(__dirname, "../public/accounts.html"));
});

app.get("/logs", (req, res) => {
  res.sendFile(path.join(__dirname, "../public/logs.html"));
});

app.get("/settings", (req, res) => {
  res.sendFile(path.join(__dirname, "../public/settings.html"));
});

app.get("/oauth-callback", (req, res) => {
  res.sendFile(path.join(__dirname, "../public/oauth-callback.html"));
});

app.get("/oauth/callback", (req, res) => {
  res.sendFile(path.join(__dirname, "../public/oauth-callback.html"));
});

// Error handling
app.use(notFoundHandler);
app.use(errorHandler);

// Start server
const startServer = async () => {
  try {
    // Test database connection
    await prisma.$connect();
    logger.info("Database connected successfully");

    // Create default admin user if not exists
    await createDefaultAdmin();

    app.listen(config.port, () => {
      logger.info(
        `Server running on port ${config.port} in ${config.nodeEnv} mode`,
      );
      logger.info(`API URL: ${config.apiUrl}`);
      logger.info(`Frontend URL: ${config.frontendUrl}`);
    });
  } catch (error) {
    logger.error("Failed to start server:", error);
    process.exit(1);
  }
};

// Create default admin user
const createDefaultAdmin = async () => {
  const bcrypt = require("bcryptjs");

  const existingAdmin = await prisma.adminUser.findUnique({
    where: { email: config.admin.email },
  });

  if (!existingAdmin) {
    const hashedPassword = await bcrypt.hash(config.admin.password, 10);

    await prisma.adminUser.create({
      data: {
        email: config.admin.email,
        password: hashedPassword,
        name: "Admin",
        role: "admin",
      },
    });

    logger.info(`Default admin user created: ${config.admin.email}`);
  }
};

// Graceful shutdown
process.on("SIGINT", async () => {
  logger.info("Shutting down gracefully...");
  await prisma.$disconnect();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  logger.info("Shutting down gracefully...");
  await prisma.$disconnect();
  process.exit(0);
});

startServer();

module.exports = app;
