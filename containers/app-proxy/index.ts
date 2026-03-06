import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import httpProxy from "http-proxy";
import jwt from "jsonwebtoken";

const PORT = parseInt(process.env.APP_PROXY_PORT || "3000", 10);
const TARGET_HOST = process.env.TARGET_HOST || "localhost";
const TARGET_PORT = process.env.TARGET_PORT || "8080";
const AUTH_COOKIE_NAME = "tomo_token";

const LOG_PREFIX = "[app-proxy]";

function log(
  level: "info" | "warn" | "error",
  message: string,
  meta?: Record<string, unknown>,
): void {
  const entry = {
    level,
    time: new Date().toISOString(),
    msg: `${LOG_PREFIX} ${message}`,
    ...meta,
  };
  if (level === "error") {
    process.stderr.write(JSON.stringify(entry) + "\n");
  } else {
    process.stdout.write(JSON.stringify(entry) + "\n");
  }
}

function loadJwtSecret(): string {
  if (process.env.TOMO_JWT_SECRET) {
    return process.env.TOMO_JWT_SECRET;
  }

  const dataDir = process.env.TOMO_DATA_DIR ?? "/data";
  const secretPath = path.join(dataDir, "secrets", "jwt");
  if (fs.existsSync(secretPath)) {
    return fs.readFileSync(secretPath, "utf-8").trim();
  }

  throw new Error(
    "JWT secret not found. Set TOMO_JWT_SECRET env or mount /data/secrets/jwt"
  );
}

function parseCookies(cookieHeader: string): Record<string, string> {
  const cookies: Record<string, string> = {};
  for (const pair of cookieHeader.split(";")) {
    const [key, ...rest] = pair.trim().split("=");
    if (key) {
      cookies[key.trim()] = rest.join("=").trim();
    }
  }
  return cookies;
}

const jwtSecret = loadJwtSecret();

const proxy = httpProxy.createProxyServer({
  target: `http://${TARGET_HOST}:${TARGET_PORT}`,
  ws: true,
});

proxy.on("error", (err, _req, res) => {
  log("error", "Proxy error", { error: err.message });
  if (res && "writeHead" in res) {
    (res as http.ServerResponse).writeHead(502, {
      "Content-Type": "text/plain",
    });
    (res as http.ServerResponse).end("Bad Gateway");
  }
});

const server = http.createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok" }));
    return;
  }

  const cookieHeader = req.headers.cookie || "";
  const cookies = parseCookies(cookieHeader);
  const token = cookies[AUTH_COOKIE_NAME];

  if (!token) {
    res.writeHead(401, { "Content-Type": "text/html" });
    res.end(
      '<html><body><p>Unauthorized.</p><script>window.location.href="/";</script></body></html>'
    );
    return;
  }

  try {
    jwt.verify(token, jwtSecret, { algorithms: ["HS256"] });
    proxy.web(req, res);
  } catch {
    res.writeHead(401, { "Content-Type": "text/html" });
    res.end(
      '<html><body><p>Session expired.</p><script>window.location.href="/";</script></body></html>'
    );
  }
});

server.on("upgrade", (req, socket, head) => {
  const cookieHeader = req.headers.cookie || "";
  const cookies = parseCookies(cookieHeader);
  const token = cookies[AUTH_COOKIE_NAME];

  if (!token) {
    socket.destroy();
    return;
  }

  try {
    jwt.verify(token, jwtSecret, { algorithms: ["HS256"] });
    proxy.ws(req, socket, head);
  } catch {
    socket.destroy();
  }
});

server.listen(PORT, () => {
  log("info", `Listening on :${PORT}`, {
    target: `${TARGET_HOST}:${TARGET_PORT}`,
  });
});

function shutdown() {
  log("info", "Shutting down");
  server.close(() => {
    proxy.close();
    process.exit(0);
  });

  setTimeout(() => {
    process.exit(1);
  }, 5000);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
