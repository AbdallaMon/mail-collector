/**
 * Initial Setup Script
 * Run this after installing dependencies to set up the database
 */

const bcrypt = require("bcryptjs");
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

const { PrismaClient } = require("@prisma/client");

async function setup() {
  console.log("\n🚀 Mail Collector Service - Initial Setup\n");

  // Check if .env exists
  const envPath = path.join(__dirname, "../.env");
  const envExamplePath = path.join(__dirname, "../.env.example");

  if (!fs.existsSync(envPath)) {
    console.log("⚠️  No .env file found. Creating from .env.example...");
    if (fs.existsSync(envExamplePath)) {
      fs.copyFileSync(envExamplePath, envPath);
      console.log("✅ Created .env file. Please edit it with your settings.");
      console.log("\n📝 Required settings:");
      console.log("   - DATABASE_URL (MySQL connection)");
      console.log("   - MICROSOFT_CLIENT_ID (Azure App)");
      console.log("   - MICROSOFT_CLIENT_SECRET (Azure App)");
      console.log("   - SMTP settings (for email forwarding)");
      console.log("\nRun this script again after configuring .env\n");
      process.exit(0);
    } else {
      console.error("❌ .env.example not found!");
      process.exit(1);
    }
  }

  // Check required env vars
  const required = ["DATABASE_URL"];
  const missing = required.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    console.error(
      `❌ Missing required environment variables: ${missing.join(", ")}`,
    );
    console.log("Please edit your .env file and try again.");
    process.exit(1);
  }

  // Generate Prisma client
  console.log("📦 Generating Prisma client...");
  try {
    execSync("npx prisma generate", { stdio: "inherit" });
    console.log("✅ Prisma client generated\n");
  } catch (error) {
    console.error("❌ Failed to generate Prisma client");
    process.exit(1);
  }

  // Push database schema
  console.log("🗄️  Setting up database...");
  try {
    execSync("npx prisma db push", { stdio: "inherit" });
    console.log("✅ Database schema created\n");
  } catch (error) {
    console.error("❌ Failed to setup database. Check your DATABASE_URL.");
    process.exit(1);
  }

  // Create admin user
  console.log("👤 Creating admin user...");
  const prisma = new PrismaClient();

  try {
    const adminEmail = process.env.ADMIN_EMAIL || "admin@dmstoresa2.pro";
    const adminPassword = process.env.ADMIN_PASSWORD || "change-this-password";

    const existing = await prisma.adminUser.findUnique({
      where: { email: adminEmail },
    });

    if (existing) {
      console.log(`✅ Admin user already exists: ${adminEmail}\n`);
    } else {
      const hashedPassword = await bcrypt.hash(adminPassword, 10);

      await prisma.adminUser.create({
        data: {
          email: adminEmail,
          password: hashedPassword,
          name: "Admin",
          role: "admin",
        },
      });

      console.log(`✅ Admin user created: ${adminEmail}`);
      console.log(`   Password: ${adminPassword}`);
      console.log("   ⚠️  Please change this password after first login!\n");
    }

    await prisma.$disconnect();
  } catch (error) {
    console.error("❌ Failed to create admin user:", error.message);
    await prisma.$disconnect();
    process.exit(1);
  }

  // Create logs directory
  const logsDir = path.join(__dirname, "../logs");
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
    console.log("✅ Created logs directory\n");
  }

  // Summary
  console.log("═══════════════════════════════════════════════════");
  console.log("✅ Setup Complete!\n");
  console.log("Next steps:");
  console.log("1. Configure Microsoft OAuth in Azure Portal");
  console.log("   (See README.md for detailed instructions)");
  console.log("2. Configure SMTP settings in .env");
  console.log("3. Start the services:\n");
  console.log("   npm run dev              # Start API server");
  console.log("   npm run dev:worker:simple  # Start worker (no Redis)");
  console.log("   cd client && npm start   # Start frontend\n");
  console.log("4. Access dashboard at http://localhost:3000");
  console.log("═══════════════════════════════════════════════════\n");
}

setup().catch(console.error);
