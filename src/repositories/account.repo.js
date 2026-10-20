const prisma = require("../config/database");

class AccountRepo {
  findUnique(args) {
    return prisma.mailAccount.findUnique(args);
  }
  findMany(args) {
    return prisma.mailAccount.findMany(args);
  }
  count(args) {
    return prisma.mailAccount.count(args);
  }
  create(args) {
    return prisma.mailAccount.create(args);
  }
  update(args) {
    return prisma.mailAccount.update(args);
  }
  delete(args) {
    return prisma.mailAccount.delete(args);
  }
  aggregate(args) {
    return prisma.mailAccount.aggregate(args);
  }
  findFirst(args) {
    return prisma.mailAccount.findFirst(args);
  }
  upsert(args) {
    return prisma.mailAccount.upsert(args);
  }
  groupBy(args) {
    return prisma.mailAccount.groupBy(args);
  }
}

module.exports = new AccountRepo();
