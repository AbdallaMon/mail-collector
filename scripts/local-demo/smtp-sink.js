const net = require("node:net");
const fs = require("node:fs");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const settings = require("./settings");
const { logEvent } = require("./events");

class SmtpSink {
  constructor() {
    this.sockets = new Set();
    this.server = net.createServer((socket) => this.accept(socket));
  }

  accept(socket) {
    this.sockets.add(socket);
    socket.on("close", () => this.sockets.delete(socket));
    socket.on("error", () => {});
    socket.setEncoding("utf8");
    let buffer = "",
      dataMode = false,
      lines = [],
      loginSteps = 0;
    const send = (text) => socket.write(text + "\r\n");
    send("220 local.test LOCAL SIMULATION SMTP sink");
    socket.on("data", (chunk) => {
      buffer += chunk;
      if (buffer.length > 1024 * 1024) return socket.destroy();
      let end;
      while ((end = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, end).replace(/\r$/, "");
        buffer = buffer.slice(end + 1);
        if (dataMode) {
          if (line !== ".") {
            lines.push(line.replace(/^\.\./, "."));
            continue;
          }
          const id = randomUUID();
          const folder = path.join(settings.directory, "smtp");
          fs.mkdirSync(folder, { recursive: true });
          fs.writeFileSync(path.join(folder, `${id}.eml`), lines.join("\r\n"));
          logEvent("SMTP_CAPTURED", { file: `smtp/${id}.eml` });
          dataMode = false;
          lines = [];
          send("250 Message captured locally");
          continue;
        }
        if (loginSteps > 0) {
          loginSteps--;
          send(
            loginSteps
              ? "334 UGFzc3dvcmQ6"
              : "235 Local authentication accepted",
          );
          continue;
        }
        const command = line.split(" ")[0].toUpperCase();
        if (command === "EHLO")
          socket.write(
            "250-local.test\r\n250-AUTH PLAIN LOGIN\r\n250 SIZE 1048576\r\n",
          );
        else if (command === "AUTH") {
          if (/^AUTH LOGIN/i.test(line)) {
            loginSteps = line.split(" ").length > 2 ? 1 : 2;
            send(loginSteps === 2 ? "334 VXNlcm5hbWU6" : "334 UGFzc3dvcmQ6");
          } else send("235 Local authentication accepted");
        } else if (command === "DATA") {
          dataMode = true;
          lines = [];
          send("354 End with <CRLF>.<CRLF>");
        } else if (command === "QUIT") {
          send("221 Bye");
          socket.end();
        } else if (["HELO", "MAIL", "RCPT", "RSET", "NOOP"].includes(command))
          send("250 OK");
        else send("502 Unsupported local SMTP command");
      }
    });
  }

  listen() {
    return new Promise((resolve, reject) => {
      this.server.once("error", reject);
      this.server.listen(settings.ports.smtp, "127.0.0.1", resolve);
    });
  }

  async close() {
    for (const socket of this.sockets) socket.destroy();
    await new Promise((resolve) => this.server.close(resolve));
  }
}

module.exports = SmtpSink;
