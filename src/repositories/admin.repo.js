const prisma = require("../config/database");

class AdminRepo {
  findUnique(args) {
    return prisma.adminUser.findUnique(args);
  }
  create(args) {
    return prisma.adminUser.create(args);
  }
  update(args) {
    return prisma.adminUser.update(args);
  }
}

module.exports = new AdminRepo();
