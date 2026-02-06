const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

const prisma = new PrismaClient();

async function main() {
  // Default admin credentials
  const defaultEmail = "admin@dmstoresa2.pro";
  const defaultPassword = "admin123";

  // Check if admin already exists
  const existingAdmin = await prisma.adminUser.findUnique({
    where: { email: defaultEmail },
  });

  if (existingAdmin) {
    console.log("✅ Admin user already exists:");
    console.log(`   Email: ${defaultEmail}`);
    console.log(`   Password: ${defaultPassword}`);
    return;
  }

  // Hash password
  const hashedPassword = await bcrypt.hash(defaultPassword, 12);

  // Create admin user
  const admin = await prisma.adminUser.create({
    data: {
      email: defaultEmail,
      password: hashedPassword,
      name: "Administrator",
      role: "SUPER_ADMIN",
      isActive: true,
    },
  });

  console.log("✅ Default admin user created successfully!");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`   Email:    ${defaultEmail}`);
  console.log(`   Password: ${defaultPassword}`);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("⚠️  Please change the password after first login!");
}

main()
  .catch((e) => {
    console.error("❌ Error seeding database:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
