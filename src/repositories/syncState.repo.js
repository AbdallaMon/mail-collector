const prisma = require("../config/database");

class SyncStateRepo {
  update(args) {
    return prisma.mailSyncState.update(args);
  }
  findUnique(args) {
    return prisma.mailSyncState.findUnique(args);
  }
  upsert(args) {
    return prisma.mailSyncState.upsert(args);
  }
}

module.exports = new SyncStateRepo();
