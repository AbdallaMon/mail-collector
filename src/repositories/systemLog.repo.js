const prisma = require("../config/database");

class SystemLogRepo {
  create(args) {
    return prisma.systemLog.create(args);
  }
  findMany(args) {
    return prisma.systemLog.findMany(args);
  }
  deleteMany(args) {
    return prisma.systemLog.deleteMany(args);
  }
}

module.exports = new SystemLogRepo();
