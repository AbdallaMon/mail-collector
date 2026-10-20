const fs = require("node:fs");
const path = require("node:path");
const net = require("node:net");
const { randomUUID } = require("node:crypto");
const { fork, spawn } = require("node:child_process");
const settings = require("./settings");
const { DemoScenario, request, waitFor } = require("./scenario");
const { logEvent } = require("./events");

class LocalDemoRunner {
  constructor() {
    this.children = [];
    this.commands = new Set();
    this.stopping = false;
    this.composeStarted = false;
    this.session = {
      runId: randomUUID(),
      controlToken: randomUUID(),
      workspaceId: settings.workspaceId,
    };
    this.env = {
      ...settings.environment(),
      LOCAL_DEMO_RUN_ID: this.session.runId,
      LOCAL_DEMO_CONTROL_TOKEN: this.session.controlToken,
    };
  }

  execute(command, args, cwd = settings.root) {
    return new Promise((resolve, reject) => {
      const child = spawn(command, args, {
        cwd,
        env: this.env,
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
      });
      this.commands.add(child);
      let tail = "";
      for (const stream of [child.stdout, child.stderr])
        stream.on("data", (chunk) => {
          const text = String(chunk);
          tail = (tail + text).slice(-4000);
          process.stdout.write(text);
        });
      child.once("error", reject);
      child.once("exit", (code) => {
        this.commands.delete(child);
        code === 0
          ? resolve()
          : reject(new Error(`${command} exited ${code}: ${tail.slice(-700)}`));
      });
    });
  }

  compose(args) {
    return this.execute("docker", [
      "--context",
      "default",
      "compose",
      "--env-file",
      path.join(settings.root, "local-demo/compose.env"),
      "-f",
      settings.compose,
      "-p",
      settings.project,
      ...args,
    ]);
  }

  async ensurePortAvailable(port) {
    await new Promise((resolve, reject) => {
      const probe = net.createServer();
      probe.once("error", () =>
        reject(
          new Error(
            `Local port ${port} is in use. Stop the previous local demo or the owner of that port first.`,
          ),
        ),
      );
      probe.listen(port, "127.0.0.1", () => probe.close(resolve));
    });
  }

  launch(name) {
    const child = fork(path.join(__dirname, `${name}.js`), [], {
      cwd: settings.root,
      env: this.env,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe", "ipc"],
    });
    child.localOutput = "";
    const output = (chunk) => {
      const text = String(chunk);
      child.localOutput = (child.localOutput + text).slice(-12000);
      fs.appendFileSync(
        path.join(settings.directory, `${name}.log`),
        text.replace(/\x1b\[[0-9;]*m/g, ""),
      );
      process.stdout.write(`[${name}] ${text}`);
    };
    child.stdout.on("data", output);
    child.stderr.on("data", output);
    child.on("message", (message) => {
      if (message?.type === "stop-demo") this.stop(0);
    });
    child.once("exit", (code) => {
      if (!this.stopping) {
        console.error(`Local ${name} exited unexpectedly (${code})`);
        this.stop(1);
      }
    });
    this.children.push(child);
    return child;
  }

  async migrate() {
    const target = path.join(settings.directory, "prisma");
    fs.mkdirSync(target, { recursive: true });
    fs.cpSync(path.join(settings.root, "prisma"), target, { recursive: true });
    // Give the staging directory its own package root; Prisma need not inspect the application's .env.
    fs.writeFileSync(
      path.join(settings.directory, "package.json"),
      '{"name":"mail-collector-local-runtime","private":true}\n',
    );
    settings.assertLocalUrl(this.env.DATABASE_URL);
    console.log(
      "[LOCAL_SIMULATION] Database target: 127.0.0.1:3368/mail_collector_demo",
    );
    await this.execute(
      process.execPath,
      [
        require.resolve("prisma/build/index.js"),
        "migrate",
        "deploy",
        "--schema",
        path.join(target, "schema.prisma"),
      ],
      settings.directory,
    );
  }

  async run() {
    fs.mkdirSync(path.join(settings.directory, "php-logs"), {
      recursive: true,
    });
    for (const port of Object.values(settings.ports))
      await this.ensurePortAvailable(port);
    settings.assertLocalDocker();
    await this.execute("docker", [
      "--context",
      "default",
      "info",
      "--format",
      "{{.ServerVersion}}",
    ]);
    logEvent("LOCAL_START", {
      message: "بدء محاكاة محلية؛ لا اتصال بـMicrosoft أوSteam الحقيقيين",
    });
    this.composeStarted = true;
    await this.compose([
      "up",
      "-d",
      "--build",
      "--wait",
      "--wait-timeout",
      "180",
    ]);
    await this.migrate();
    fs.writeFileSync(
      path.join(settings.directory, "session.json"),
      JSON.stringify(this.session, null, 2) + "\n",
    );
    this.launch("services");
    await waitFor(
      () => request(`${settings.providerUrl}/__demo/health`),
      "Local Microsoft simulator",
    );
    this.launch("server");
    await waitFor(
      () => request(`${settings.appUrl}/health`),
      "Local collector HTTP server",
    );
    const worker = this.launch("worker");
    await waitFor(
      () => worker.localOutput.includes("Maintenance planner scheduled"),
      "Local maintenance worker",
    );
    const summary = await new DemoScenario(this.session).run();
    if (process.argv.includes("--verify-repairs")) {
      const RepairVerification = require("./verify-repairs");
      await new RepairVerification(this.session, summary.accountId).run();
    }
    console.log(
      `\nLOCAL DEMO READY\nDashboard: ${settings.appUrl}\nEmail: ${settings.adminEmail}\nPassword: ${settings.adminPassword}\nLogs: ${settings.directory}\nSend another synthetic message: npm run local:steam\nStop: Ctrl+C or npm run local:stop\n`,
    );
    if (process.argv.includes("--once")) await this.stop(0);
  }

  async stop(code) {
    if (this.stopping) return;
    this.stopping = true;
    for (const command of this.commands) command.kill();
    await Promise.all(
      this.children.map(
        (child) =>
          new Promise((resolve) => {
            if (child.exitCode !== null) return resolve();
            const timeout = setTimeout(() => {
              child.kill();
              resolve();
            }, 5000);
            child.once("exit", () => {
              clearTimeout(timeout);
              resolve();
            });
            if (child.connected) child.send({ type: "shutdown" });
            else child.kill();
          }),
      ),
    );
    if (this.composeStarted) {
      try {
        await this.compose(["stop"]);
      } catch (error) {
        console.error(error.message);
        code = 1;
      }
    }
    logEvent("LOCAL_STOPPED", { dataRetained: true, exitCode: code });
    process.exit(code);
  }
}

const runner = new LocalDemoRunner();
process.on("SIGINT", () => runner.stop(0));
process.on("SIGTERM", () => runner.stop(0));
runner.run().catch((error) => {
  console.error(`[LOCAL_SIMULATION] ${error.message}`);
  if (/docker/i.test(error.message))
    console.error("Start Docker Desktop and retry npm run local.");
  runner.stop(1);
});
