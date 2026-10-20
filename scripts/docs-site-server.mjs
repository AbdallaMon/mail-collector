import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { networkInterfaces } from "node:os";
import { spawn } from "node:child_process";

const rootDir = process.cwd();
const siteDir = path.join(rootDir, "docs", "html");
const buildScript = path.join(rootDir, "scripts", "generate-docs-site.mjs");
const host = process.env.DOCS_SITE_HOST || "127.0.0.1";
const port = Number(process.env.DOCS_SITE_PORT || 5501);

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error("DOCS_SITE_PORT must be an integer between 1 and 65535.");
  process.exit(1);
}

const mimeByExt = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
};

function sendJson(res, code, payload) {
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

async function runBuild() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [buildScript], {
      cwd: rootDir,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });

    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(new Error(stderr || stdout || `build failed with code ${code}`));
      }
    });
  });
}

function sanitizePath(urlPath) {
  const safe = urlPath.split("?")[0].split("#")[0];
  const decoded = decodeURIComponent(safe);
  const resolved = path.normalize(decoded).replace(/^([.][.][/\\])+/, "");
  return resolved === "/" || resolved === "\\" ? "/index.html" : resolved;
}

const server = http.createServer(async (req, res) => {
  if (req.method === "POST" && req.url === "/api/build-docs") {
    try {
      const result = await runBuild();
      return sendJson(res, 200, {
        ok: true,
        message: "Build completed successfully.",
        output: result.stdout.trim(),
      });
    } catch (error) {
      return sendJson(res, 500, {
        ok: false,
        error: error.message,
      });
    }
  }

  if (req.method === "GET" && req.url === "/api/docs-registry") {
    try {
      const registryFile = path.join(siteDir, "js", "registry.js");
      const registryContent = await fs.readFile(registryFile, "utf-8");
      const match = registryContent.match(
        /window\.DOC_REGISTRY\s*=\s*(\[[\s\S]*\]);/,
      );
      if (!match) {
        return sendJson(res, 404, {
          ok: false,
          error: "Registry data not found",
        });
      }
      const registry = JSON.parse(match[1]);
      return sendJson(res, 200, { ok: true, data: registry });
    } catch (error) {
      return sendJson(res, 500, {
        ok: false,
        error: error.message,
      });
    }
  }

  if (req.method !== "GET" && req.method !== "HEAD") {
    return sendJson(res, 405, { ok: false, error: "Method not allowed" });
  }

  let requestPath;
  try {
    requestPath = sanitizePath(req.url || "/");
  } catch {
    return sendJson(res, 400, { ok: false, error: "Invalid URL" });
  }
  const fullPath = path.join(siteDir, requestPath);
  const relativePath = path.relative(siteDir, fullPath);

  if (relativePath === ".." || relativePath.startsWith(`..${path.sep}`) || path.isAbsolute(relativePath)) {
    return sendJson(res, 403, { ok: false, error: "Forbidden" });
  }

  try {
    let stat = await fs.stat(fullPath);
    let target = fullPath;

    if (stat.isDirectory()) {
      target = path.join(fullPath, "index.html");
      stat = await fs.stat(target);
    }

    const ext = path.extname(target).toLowerCase();
    const mime = mimeByExt[ext] || "application/octet-stream";
    const content = await fs.readFile(target);

    res.writeHead(200, {
      "Content-Type": mime,
      "Content-Length": stat.size,
      "Cache-Control": "no-store",
    });

    if (req.method === "GET") {
      res.end(content);
    } else {
      res.end();
    }
  } catch {
    sendJson(res, 404, { ok: false, error: "Not found" });
  }
});

server.on("error", (error) => {
  console.error(
    error.code === "EADDRINUSE"
      ? `Port ${port} is already in use. Stop the other server or set DOCS_SITE_PORT.`
      : `Docs server failed: ${error.message}`,
  );
  process.exit(1);
});

runBuild()
  .then(() => {
    server.listen(port, host, () => {
      console.log("Docs site server is ready.");
      if (host === "0.0.0.0" || host === "::") {
        console.log(`  Local:   http://localhost:${port}/`);
        const addresses = new Set(
          Object.values(networkInterfaces()).flat()
            .filter((entry) => entry && entry.family === "IPv4" && !entry.internal)
            .map((entry) => entry.address),
        );
        for (const address of addresses) {
          console.log(`  Network: http://${address}:${port}/`);
        }
      } else {
        console.log(`  Address: http://${host.includes(":") ? `[${host}]` : host}:${port}/`);
      }
      console.log("Press Ctrl+C to stop. Use Rebuild Docs on the home page to refresh the content.");
    });
  })
  .catch((error) => {
    console.error("Initial build failed:");
    console.error(error.message);
    process.exit(1);
  });
