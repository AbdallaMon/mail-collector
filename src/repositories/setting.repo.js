const prisma = require("../config/database");

class SettingRepo {
  findUnique(args) {
    return prisma.systemSetting.findUnique(args);
  }
  upsert(args) {
    return prisma.systemSetting.upsert(args);
  }
}

module.exports = new SettingRepo();
