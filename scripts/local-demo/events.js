const fs = require("node:fs");
const path = require("node:path");
const settings = require("./settings");

function logEvent(event, data = {}) {
  const entry = {
    time: new Date().toISOString(),
    mode: "LOCAL_SIMULATION",
    event,
    ...data,
  };
  fs.mkdirSync(settings.directory, { recursive: true });
  fs.appendFileSync(
    path.join(settings.directory, "scenario.log"),
    JSON.stringify(entry) + "\n",
  );
  console.log(`[LOCAL_SIMULATION] ${event} ${JSON.stringify(data)}`);
  return entry;
}

module.exports = { logEvent };
