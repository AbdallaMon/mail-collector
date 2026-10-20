const prisma = require("../config/database");
class SystemRepo {
  ping() {
    return prisma.$queryRaw`SELECT 1`;
  }
}
module.exports = new SystemRepo();
