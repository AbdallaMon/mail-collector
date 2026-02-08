/**
 * Rate Limit Test Script
 * يبعت رسائل تجريبية من SMTP لحساب Outlook علشان نختبر الـ webhook والـ forwarding
 *
 * Usage:
 *   node scripts/test-rate-limit.js <target-outlook-email> <count> <delay-ms>
 *
 * Example:
 *   node scripts/test-rate-limit.js myaccount@outlook.com 50 1000
 *   (يبعت 50 رسالة لحساب Outlook، رسالة كل ثانية)
 */

require("dotenv").config();
const nodemailer = require("nodemailer");

// SMTP Configuration from .env
const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = parseInt(process.env.SMTP_PORT, 10) || 465;
const SMTP_SECURE = process.env.SMTP_SECURE === "true";
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const SMTP_FROM = process.env.SMTP_FROM || SMTP_USER;

// ============ Configuration ============
const TARGET_EMAIL = process.argv[2] || "test@outlook.com";
const MESSAGE_COUNT = parseInt(process.argv[3], 10) || 10;
const DELAY_MS = parseInt(process.argv[4], 10) || 1000;

// ============ Helpers ============
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function timestamp() {
  return new Date().toISOString().slice(11, 23);
}

// ============ Main ============
async function main() {
  console.log("=".repeat(50));
  console.log("📧 SMTP Rate Limit Test Script");
  console.log("=".repeat(50));
  console.log(`SMTP Host: ${SMTP_HOST}:${SMTP_PORT}`);
  console.log(`From: ${SMTP_FROM}`);
  console.log(`Target Email: ${TARGET_EMAIL}`);
  console.log(`Messages to send: ${MESSAGE_COUNT}`);
  console.log(`Delay between messages: ${DELAY_MS}ms`);
  console.log("=".repeat(50));

  // Create SMTP transporter
  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_SECURE,
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS,
    },
  });

  // Verify connection
  try {
    await transporter.verify();
    console.log("\n✅ SMTP connection verified!\n");
  } catch (error) {
    console.error("❌ SMTP connection failed:", error.message);
    process.exit(1);
  }

  let successCount = 0;
  let failCount = 0;
  const errors = [];

  for (let i = 1; i <= MESSAGE_COUNT; i++) {
    const startTime = Date.now();

    try {
      // Send test email via SMTP
      await transporter.sendMail({
        from: SMTP_FROM,
        to: TARGET_EMAIL,
        subject: `🧪 Steam Guard Code Test #${i} - ${timestamp()}`,
        html: `
          <div style="font-family: Arial, sans-serif; padding: 20px;">
            <h2>Steam Guard Code Test #${i}</h2>
            <p>This is a test message to verify webhook forwarding.</p>
            <table style="border-collapse: collapse; margin-top: 20px;">
              <tr>
                <td style="padding: 8px; border: 1px solid #ddd;"><strong>Message #</strong></td>
                <td style="padding: 8px; border: 1px solid #ddd;">${i} of ${MESSAGE_COUNT}</td>
              </tr>
              <tr>
                <td style="padding: 8px; border: 1px solid #ddd;"><strong>Sent From</strong></td>
                <td style="padding: 8px; border: 1px solid #ddd;">${SMTP_FROM}</td>
              </tr>
              <tr>
                <td style="padding: 8px; border: 1px solid #ddd;"><strong>Sent To</strong></td>
                <td style="padding: 8px; border: 1px solid #ddd;">${TARGET_EMAIL}</td>
              </tr>
              <tr>
                <td style="padding: 8px; border: 1px solid #ddd;"><strong>Timestamp</strong></td>
                <td style="padding: 8px; border: 1px solid #ddd;">${new Date().toISOString()}</td>
              </tr>
              <tr>
                <td style="padding: 8px; border: 1px solid #ddd;"><strong>Delay</strong></td>
                <td style="padding: 8px; border: 1px solid #ddd;">${DELAY_MS}ms</td>
              </tr>
            </table>
          </div>
        `,
      });

      const elapsed = Date.now() - startTime;
      successCount++;
      console.log(
        `[${timestamp()}] ✅ Message ${i}/${MESSAGE_COUNT} sent (${elapsed}ms)`,
      );
    } catch (error) {
      const elapsed = Date.now() - startTime;
      failCount++;

      console.log(
        `[${timestamp()}] ❌ Message ${i}/${MESSAGE_COUNT} FAILED (${elapsed}ms) - ${error.message}`,
      );

      errors.push({
        messageNum: i,
        message: error.message.substring(0, 100),
      });
    }

    // Wait before next message (except for last one)
    if (i < MESSAGE_COUNT) {
      await sleep(DELAY_MS);
    }
  }

  // Close transporter
  transporter.close();

  // Print summary
  console.log("\n" + "=".repeat(50));
  console.log("📊 TEST SUMMARY");
  console.log("=".repeat(50));
  console.log(`✅ Successful: ${successCount}`);
  console.log(`❌ Failed: ${failCount}`);
  console.log(`📧 Total attempted: ${successCount + failCount}`);
  console.log(
    `⏱️ Total time: ${((MESSAGE_COUNT * DELAY_MS) / 1000).toFixed(1)}s (approx)`,
  );

  if (errors.length > 0) {
    console.log("\n❌ Errors:");
    errors.forEach((e) => {
      console.log(`   Message #${e.messageNum}: ${e.message}`);
    });
  }

  if (failCount === 0) {
    console.log("\n🎉 All messages sent successfully!");
    console.log("Now check the webhook logs to see if forwarding works.");
  }

  console.log("=".repeat(50));
  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
