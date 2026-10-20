require("./bootstrap");
process.on("message", (message) => {
  if (message?.type === "shutdown") process.emit("SIGTERM");
});
process.on("disconnect", () => process.emit("SIGTERM"));
require("../../src/worker");
