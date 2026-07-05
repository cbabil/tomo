import type http from "node:http";
import path from "node:path";
import express from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { createLogger } from "./logger.js";
import { parseCookies } from "./cookies.js";
import { AUTH_COOKIE_NAME } from "./config.js";
import { createContext } from "./trpc/middleware.js";
import { createAppRouter, type RouterDependencies } from "./trpc/router.js";

const log = createLogger("server");

export interface ServerConfig {
  port: number;
  staticDir: string;
  corsOrigin?: string;
}

const ALLOWED_ORIGIN_PATTERNS = [
  /^https?:\/\/localhost(:\d+)?$/,
  /^https?:\/\/127\.0\.0\.1(:\d+)?$/,
];

// Global rate limit
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
});

// Strict auth rate limit
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: "Too many attempts, try again later" },
  skipSuccessfulRequests: true,
});

export function createServer(
  deps: RouterDependencies,
  config: ServerConfig,
): { start(): Promise<http.Server>; app: express.Express } {
  const app = express();

  // Trust Traefik proxy (single hop)
  app.set("trust proxy", 1);

  // Security headers
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: [
            "'self'",
            "'unsafe-inline'",
            "https://fonts.googleapis.com",
          ],
          fontSrc: ["'self'", "https://fonts.gstatic.com"],
          imgSrc: ["'self'", "data:", "https:"],
          connectSrc: ["'self'", "ws:", "wss:"],
          frameSrc: ["'self'"],
          objectSrc: ["'none'"],
          upgradeInsecureRequests: null,
        },
      },
      crossOriginOpenerPolicy: false,
      originAgentCluster: false,
      frameguard: { action: "sameorigin" },
      hsts: false,
    }),
  );

  // Request logging
  app.use((req, res, next) => {
    const start = Date.now();
    res.on("finish", () => {
      log.info("request", {
        method: req.method,
        url: req.url,
        status: res.statusCode,
        ms: Date.now() - start,
      });
    });
    next();
  });

  // JSON body parsing
  app.use(express.json({ limit: "50kb" }));

  // Parse cookies into req.cookies
  app.use((req, _res, next) => {
    (req as unknown as Record<string, unknown>).cookies = parseCookies(
      req.headers.cookie,
    );
    next();
  });

  // CORS origin validation
  if (config.corsOrigin) {
    app.use((req, res, next) => {
      const origin = req.headers.origin;
      if (origin) {
        const isAllowed =
          origin === config.corsOrigin ||
          ALLOWED_ORIGIN_PATTERNS.some((re) => re.test(origin));
        if (isAllowed) {
          res.header("Access-Control-Allow-Origin", origin);
          res.header("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
          res.header(
            "Access-Control-Allow-Headers",
            "Content-Type,Authorization",
          );
          res.header("Access-Control-Allow-Credentials", "true");
        }
      }
      if (req.method === "OPTIONS") {
        res.sendStatus(204);
        return;
      }
      next();
    });
  }

  // Rate limiting on auth endpoints
  app.use("/trpc/user.login", authLimiter);
  app.use("/trpc/user.register", authLimiter);
  app.use("/trpc/user.changePassword", authLimiter);
  app.use("/trpc", globalLimiter);

  app.get("/health", (_req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  // Auth verification for Traefik forwardAuth middleware
  app.get("/auth/verify", (req, res) => {
    const cookies = (req as unknown as Record<string, unknown>).cookies as
      | Record<string, string>
      | undefined;
    const token = cookies?.[AUTH_COOKIE_NAME];
    if (!token) {
      res.sendStatus(401);
      return;
    }
    try {
      deps.user.validateToken(token);
      res.sendStatus(200);
    } catch {
      res.sendStatus(401);
    }
  });

  const appRouter = createAppRouter(deps);
  const contextFactory = createContext(deps.user);

  app.use(
    "/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext: ({ req, res }) => contextFactory({ req, res }),
    }),
  );

  const absoluteStaticDir = path.resolve(config.staticDir);

  // Hashed assets (JS/CSS bundles) are immutable — cache aggressively
  app.use(
    "/assets",
    express.static(path.join(absoluteStaticDir, "assets"), {
      maxAge: "1y",
      immutable: true,
    }),
  );

  // All other static files — no cache so updates take effect immediately
  app.use(
    express.static(absoluteStaticDir, {
      maxAge: 0,
      etag: false,
      lastModified: false,
      setHeaders(res) {
        res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      },
    }),
  );

  // SPA fallback — always serve fresh index.html
  app.get("/{*splat}", (_req, res) => {
    const indexPath = path.join(absoluteStaticDir, "index.html");
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.sendFile(indexPath, (err) => {
      if (err) {
        res.status(404).json({ error: "Not found" });
      }
    });
  });

  return {
    start(): Promise<http.Server> {
      return new Promise((resolve) => {
        const httpServer = app.listen(config.port, () => {
          log.info("Server started", { port: config.port });
          resolve(httpServer);
        });
      });
    },
    app,
  };
}
