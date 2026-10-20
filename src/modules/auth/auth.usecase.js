const adminRepo = require("../../repositories/admin.repo");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const config = require("../../config");
const ApiError = require("../../utils/ApiError");

class AuthUsecase {
  async login({ email, password }) {
    if (!email || !password)
      throw ApiError.badRequest("Email and password are required");
    const user = await adminRepo.findUnique({ where: { email } });
    if (!user || !user.isActive)
      throw ApiError.unauthorized("Invalid credentials");
    if (!(await bcrypt.compare(password, user.password)))
      throw ApiError.unauthorized("Invalid credentials");
    const token = jwt.sign(
      { userId: user.id, email: user.email, role: user.role },
      config.jwt.secret,
      { expiresIn: config.jwt.expiresIn },
    );
    return {
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    };
  }

  me(id) {
    return adminRepo.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        createdAt: true,
      },
    });
  }

  async changePassword(id, { currentPassword, newPassword }) {
    if (!currentPassword || !newPassword)
      throw ApiError.badRequest(
        "Current password and new password are required",
      );
    if (newPassword.length < 8)
      throw ApiError.badRequest("New password must be at least 8 characters");
    const user = await adminRepo.findUnique({ where: { id } });
    if (!(await bcrypt.compare(currentPassword, user.password)))
      throw ApiError.badRequest("Current password is incorrect");
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await adminRepo.update({
      where: { id },
      data: { password: hashedPassword },
    });
  }
}

module.exports = new AuthUsecase();
