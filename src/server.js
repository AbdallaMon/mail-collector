const config = require("./config");
const logger = require("./config/logger");
const prisma = require("./config/database");
const adminService = require("./services/admin.service");
const app = require("./app");
class Server {
  // Start server
  async start() {
    try {
      // Test database connection
      await prisma.$connect();
      logger.info("Database connected successfully");

      // Create default admin user if not exists
      await adminService.ensureDefaultAdmin();

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
  }

  async shutdown() {
    logger.info("Shutting down gracefully...");
    await prisma.$disconnect();
    process.exit(0);
  }
}
const server = new Server();
process.on("SIGINT", () => server.shutdown());
process.on("SIGTERM", () => server.shutdown());
server.start();
module.exports = app;
