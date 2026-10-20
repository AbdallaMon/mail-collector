const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const settings = require("./settings");
const { DemoScenario, request } = require("./scenario");

(async () => {
  const action = process.argv[2] || "steam";
  if (!["steam", "stop"].includes(action))
    throw new Error("Use local:steam or local:stop");
  const sessionFile = path.join(settings.directory, "session.json");
  if (!fs.existsSync(sessionFile)) throw new Error("Start npm run local first");
  const session = JSON.parse(fs.readFileSync(sessionFile, "utf8"));
  const scenario = new DemoScenario(session);
  if (action === "stop") {
    try {
      await scenario.verifySession();
      await request(`${settings.providerUrl}/__demo/stop`, {
        method: "POST",
        headers: scenario.controlHeaders,
      });
      console.log(
        "Local shutdown requested. The launcher will stop its children and demo containers; data is retained.",
      );
    } catch (error) {
      if (error.cause?.code !== "ECONNREFUSED") throw error;
      settings.assertLocalDocker();
      const result = spawnSync(
        "docker",
        [
          "--context",
          "default",
          "compose",
          "--env-file",
          path.join(settings.root, "local-demo/compose.env"),
          "-f",
          settings.compose,
          "-p",
          settings.project,
          "stop",
        ],
        {
          cwd: settings.root,
          stdio: "inherit",
          windowsHide: true,
          env: settings.environment(),
        },
      );
      if (result.status !== 0)
        throw new Error("Could not stop the demo containers");
    }
    return;
  }
  const option = (name) => {
    const index = process.argv.indexOf(name);
    return index < 0 ? undefined : process.argv[index + 1];
  };
  await scenario.sendSteam({
    username: option("--username"),
    code: option("--code"),
  });
})().catch((error) => {
  console.error(`[LOCAL_SIMULATION] ${error.message}`);
  process.exitCode = 1;
});
