const prisma = require("../config/database");

class SubscriptionRepo {
  upsert(args) {
    return prisma.webhookSubscription.upsert(args);
  }
  findUnique(args) {
    return prisma.webhookSubscription.findUnique(args);
  }
  update(args) {
    return prisma.webhookSubscription.update(args);
  }
  deleteMany(args) {
    return prisma.webhookSubscription.deleteMany(args);
  }
  findMany(args) {
    return prisma.webhookSubscription.findMany(args);
  }
}

module.exports = new SubscriptionRepo();
