const prisma = require("../config/database");

class TokenRepo {
  upsert(args) {
    return prisma.mailToken.upsert(args);
  }
  findUnique(args) {
    return prisma.mailToken.findUnique(args);
  }
}

module.exports = new TokenRepo();
