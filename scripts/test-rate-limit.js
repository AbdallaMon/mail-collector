/**
 * Rate Limit Test Script
 * يبعت رسائل تجريبية لإيميل معين علشان نختبر الـ forwarding
 *
 * Usage:
 *   node scripts/test-rate-limit.js <target-email> <count> <delay-ms>
 *
 * Example:
 *   node scripts/test-rate-limit.js test@example.com 50 1000
 *   (يبعت 50 رسالة، رسالة كل ثانية)
 */

require("dotenv").config();
const axios = require("axios");
const prisma = require("../src/config/database");
const microsoftAuthService = require("../src/services/microsoftAuth.service");
const config = require("../src/config");

// ============ Configuration ============
const TARGET_EMAIL = process.argv[2] || "test@example.com";
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
  console.log("📧 Rate Limit Test Script");
  console.log("=".repeat(50));
  console.log(`Target Email: ${TARGET_EMAIL}`);
  console.log(`Messages to send: ${MESSAGE_COUNT}`);
  console.log(`Delay between messages: ${DELAY_MS}ms`);
  console.log("=".repeat(50));

  // Find a connected account to send from
  const senderAccount = await prisma.mailAccount.findFirst({
    where: {
      status: "CONNECTED",
      isEnabled: true,
    },
    select: { id: true, email: true },
  });

  if (!senderAccount) {
    console.error("❌ No connected account found to send from!");
    process.exit(1);
  }

  console.log(`\n📤 Sending from: ${senderAccount.email}\n`);

  let successCount = 0;
  let failCount = 0;
  const errors = [];

  for (let i = 1; i <= MESSAGE_COUNT; i++) {
    const startTime = Date.now();

    try {
      // Get fresh access token
      const accessToken = await microsoftAuthService.getValidAccessToken(
        senderAccount.id,
      );

      // Send test email
      await axios.post(
        `${config.microsoft.graphBaseUrl}/me/sendMail`,
        {
          message: {
            subject: `🧪 Test Message #${i} - ${timestamp()}`,
            body: {
              contentType: "HTML",
              content: `
                <div style="font-family: Arial, sans-serif; padding: 20px;">
                  <h2>Test Message #${i}</h2>
                  <p>This is a rate limit test message.</p>
                  <table style="border-collapse: collapse; margin-top: 20px;">
                    <tr>
                      <td style="padding: 8px; border: 1px solid #ddd;"><strong>Message #</strong></td>
                      <td style="padding: 8px; border: 1px solid #ddd;">${i} of ${MESSAGE_COUNT}</td>
                    </tr>
                    <tr>
                      <td style="padding: 8px; border: 1px solid #ddd;"><strong>Sent From</strong></td>
                      <td style="padding: 8px; border: 1px solid #ddd;">${senderAccount.email}</td>
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
            },
            toRecipients: [{ emailAddress: { address: TARGET_EMAIL } }],
          },
        },
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
        },
      );

      const elapsed = Date.now() - startTime;
      successCount++;
      console.log(
        `[${timestamp()}] ✅ Message ${i}/${MESSAGE_COUNT} sent (${elapsed}ms)`,
      );
    } catch (error) {
      const elapsed = Date.now() - startTime;
      failCount++;

      const status = error.response?.status || "N/A";
      const code = error.response?.data?.error?.code || "Unknown";
      const message = error.response?.data?.error?.message || error.message;

      console.log(
        `[${timestamp()}] ❌ Message ${i}/${MESSAGE_COUNT} FAILED (${elapsed}ms) - Status: ${status}, Code: ${code}`,
      );

      errors.push({
        messageNum: i,
        status,
        code,
        message: message.substring(0, 100),
      });

      // If rate limited (429) or suspended (403), stop the test
      if (status === 429 || status === 403) {
        console.log(`\n⚠️ Stopping test due to ${status} error!`);
        console.log(`Error: ${message}\n`);
        break;
      }
    }

    // Wait before next message (except for last one)
    if (i < MESSAGE_COUNT) {
      await sleep(DELAY_MS);
    }
  }

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
      console.log(
        `   Message #${e.messageNum}: [${e.status}] ${e.code} - ${e.message}`,
      );
    });
  }

  if (failCount === 0) {
    console.log("\n🎉 All messages sent successfully! The rate limit is OK.");
  } else if (errors.some((e) => e.status === 429)) {
    console.log("\n⚠️ Rate limit hit! Try increasing the delay.");
  } else if (errors.some((e) => e.status === 403)) {
    console.log("\n🚨 Account suspended or access denied!");
  }

  console.log("=".repeat(50));

  await prisma.$disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
