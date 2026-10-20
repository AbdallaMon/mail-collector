const adminRepo = require("../repositories/admin.repo");
const config = require("../config");
const logger = require("../config/logger");
class AdminService {
  async ensureDefaultAdmin() {
    const bcrypt = require("bcryptjs");

    const existingAdmin = await adminRepo.findUnique({
      where: { email: config.admin.email },
    });

    if (!existingAdmin) {
      const hashedPassword = await bcrypt.hash(config.admin.password, 10);

      await adminRepo.create({
        data: {
          email: config.admin.email,
          password: hashedPassword,
          name: "Admin",
          role: "admin",
        },
      });

      logger.info(`Default admin user created: ${config.admin.email}`);
    }
  }
}
module.exports = new AdminService();
