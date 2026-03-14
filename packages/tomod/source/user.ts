import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { execa } from "execa";
import jwt from "jsonwebtoken";
import { createLogger } from "./logger.js";
import { TOMO_DATA_DIR, SESSION_DURATION_DAYS } from "./config.js";

const log = createLogger("user");

const TOMO_GROUP = "tomo";
const JWT_EXPIRY = `${SESSION_DURATION_DAYS}d`;
const SCRYPT_KEYLEN = 64;

export interface TokenPayload {
  sub: string;
  iat?: number;
}

/**
 * User service — manages authentication via Linux system users (PAM/shadow).
 *
 * Production (Linux): creates real OS users with `useradd`, authenticates
 * against /etc/shadow using `openssl passwd`.
 *
 * Dev mode (non-Linux): uses in-memory crypto.scrypt hashing. Not persistent
 * across restarts — for local development only.
 */
export class User {
  private readonly isLinux: boolean;
  private readonly secretsDir: string;
  private jwtSecret: string = "";
  private adminUser: string | null = null;
  private registrationInProgress = false;

  /** Dev-mode in-memory password hash (non-persistent) */
  private devPasswordHash: string | null = null;

  constructor() {
    this.isLinux = process.platform === "linux";
    this.secretsDir = path.join(TOMO_DATA_DIR, "secrets");
  }

  async init(): Promise<void> {
    await mkdir(this.secretsDir, { recursive: true });
    this.jwtSecret = await this.loadOrCreateJwt();

    if (this.isLinux) {
      await this.ensureTomoGroup();
      this.adminUser = await this.findGroupAdmin();
    } else {
      log.warn(
        "Non-Linux platform detected — using in-memory dev auth (not persistent)",
      );
    }

    log.info("User service initialized", {
      platform: process.platform,
      hasAdmin: this.adminUser !== null,
    });
  }

  private async loadOrCreateJwt(): Promise<string> {
    const jwtPath = path.join(this.secretsDir, "jwt");

    try {
      const content = await readFile(jwtPath, "utf-8");
      return content.trim();
    } catch {
      const secret = crypto.randomBytes(64).toString("hex");
      await writeFile(jwtPath, secret, { mode: 0o600 });
      log.info("Generated new JWT secret");
      return secret;
    }
  }

  // ---------------------------------------------------------------------------
  // Linux: system user management
  // ---------------------------------------------------------------------------

  private async ensureTomoGroup(): Promise<void> {
    try {
      await execa("getent", ["group", TOMO_GROUP]);
    } catch {
      await execa("groupadd", ["--system", TOMO_GROUP]);
      log.info("Created system group", { group: TOMO_GROUP });
    }
  }

  private async findGroupAdmin(): Promise<string | null> {
    try {
      const { stdout } = await execa("getent", ["group", TOMO_GROUP]);
      // Format: tomo:x:GID:user1,user2
      const members = stdout.split(":")[3]?.trim();
      if (!members) return null;
      return members.split(",")[0] || null;
    } catch {
      return null;
    }
  }

  private async isOsUserTaken(name: string): Promise<boolean> {
    try {
      await execa("getent", ["passwd", name]);
      return true;
    } catch {
      return false;
    }
  }

  private async createLinuxUser(
    name: string,
    password: string,
  ): Promise<void> {
    if (await this.isOsUserTaken(name)) {
      throw new Error(
        `Username "${name}" is already taken by the operating system`,
      );
    }

    await execa("useradd", [
      "--system",
      "--no-create-home",
      "--groups",
      TOMO_GROUP,
      "--shell",
      "/usr/sbin/nologin",
      name,
    ]);

    // Force SHA-512 so we can verify with openssl passwd -6
    await execa("chpasswd", ["--crypt-method", "SHA512"], {
      input: `${name}:${password}`,
    });
  }

  private async verifyLinuxPassword(
    username: string,
    password: string,
  ): Promise<boolean> {
    try {
      const shadow = await readFile("/etc/shadow", "utf-8");
      const entry = shadow
        .split("\n")
        .find((l) => l.startsWith(`${username}:`));
      if (!entry) return false;

      const storedHash = entry.split(":")[1];
      if (!storedHash || ["!", "*", "!!", ""].includes(storedHash)) {
        return false;
      }

      const { algo, fullSalt } = this.parseShadowHash(storedHash);
      if (!algo || !fullSalt) return false;

      const { stdout } = await execa(
        "openssl",
        ["passwd", `-${algo}`, "-salt", fullSalt, "-stdin"],
        { input: password },
      );

      return stdout.trim() === storedHash;
    } catch (err) {
      log.error("Password verification failed", { error: String(err) });
      return false;
    }
  }

  private parseShadowHash(hash: string): {
    algo: string;
    fullSalt: string;
  } {
    // Shadow hash format: $id$[param$]salt$encrypted
    // Examples:
    //   $6$salt$hash              → algo=6, fullSalt=salt
    //   $6$rounds=5000$salt$hash  → algo=6, fullSalt=rounds=5000$salt
    //   $5$salt$hash              → algo=5, fullSalt=salt
    const withoutPrefix = hash.substring(1); // remove leading $
    const parts = withoutPrefix.split("$");

    const algo = parts[0]; // "6", "5", "1", etc.

    if (parts[1]?.startsWith("rounds=")) {
      return { algo, fullSalt: `${parts[1]}$${parts[2]}` };
    }

    return { algo, fullSalt: parts[1] };
  }

  private async changeLinuxPassword(
    username: string,
    newPassword: string,
  ): Promise<void> {
    await execa("chpasswd", ["--crypt-method", "SHA512"], {
      input: `${username}:${newPassword}`,
    });
  }

  // ---------------------------------------------------------------------------
  // Dev mode: in-memory scrypt hashing (non-persistent)
  // ---------------------------------------------------------------------------

  private async scryptHash(password: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const salt = crypto.randomBytes(16).toString("hex");
      crypto.scrypt(password, salt, SCRYPT_KEYLEN, (err, key) => {
        if (err) return reject(err);
        resolve(`${salt}:${key.toString("hex")}`);
      });
    });
  }

  private async scryptVerify(
    password: string,
    hash: string,
  ): Promise<boolean> {
    return new Promise((resolve, reject) => {
      const [salt, storedKey] = hash.split(":");
      crypto.scrypt(password, salt, SCRYPT_KEYLEN, (err, key) => {
        if (err) return reject(err);
        resolve(
          crypto.timingSafeEqual(
            Buffer.from(key.toString("hex")),
            Buffer.from(storedKey),
          ),
        );
      });
    });
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  async register(name: string, password: string): Promise<void> {
    if (this.registrationInProgress) {
      throw new Error("Registration already in progress");
    }
    this.registrationInProgress = true;

    try {
      if (this.adminUser) {
        throw new Error("Admin user already exists");
      }

      if (this.isLinux) {
        await this.createLinuxUser(name, password);
      } else {
        this.devPasswordHash = await this.scryptHash(password);
      }

      this.adminUser = name;
      log.info("Admin user registered", { name, linux: this.isLinux });
    } finally {
      this.registrationInProgress = false;
    }
  }

  issueToken(): string {
    if (!this.adminUser) {
      throw new Error("No user registered");
    }

    return jwt.sign(
      { sub: this.adminUser } satisfies TokenPayload,
      this.jwtSecret,
      { expiresIn: JWT_EXPIRY, algorithm: "HS256" },
    );
  }

  async login(password: string): Promise<string> {
    if (!this.adminUser) {
      throw new Error("Invalid credentials");
    }

    const valid = this.isLinux
      ? await this.verifyLinuxPassword(this.adminUser, password)
      : this.devPasswordHash !== null &&
        (await this.scryptVerify(password, this.devPasswordHash));

    if (!valid) {
      throw new Error("Invalid credentials");
    }

    log.info("User logged in", { name: this.adminUser });
    return this.issueToken();
  }

  async changePassword(
    oldPassword: string,
    newPassword: string,
  ): Promise<void> {
    if (!this.adminUser) {
      throw new Error("No user registered");
    }

    const valid = this.isLinux
      ? await this.verifyLinuxPassword(this.adminUser, oldPassword)
      : this.devPasswordHash !== null &&
        (await this.scryptVerify(oldPassword, this.devPasswordHash));

    if (!valid) {
      throw new Error("Invalid current password");
    }

    if (this.isLinux) {
      await this.changeLinuxPassword(this.adminUser, newPassword);
    } else {
      this.devPasswordHash = await this.scryptHash(newPassword);
    }

    // Regenerate JWT secret to invalidate all existing sessions
    const jwtPath = path.join(this.secretsDir, "jwt");
    this.jwtSecret = crypto.randomBytes(64).toString("hex");
    await writeFile(jwtPath, this.jwtSecret, { mode: 0o600 });
    log.info("Password changed, all sessions invalidated", {
      name: this.adminUser,
    });
  }

  validateToken(token: string): TokenPayload {
    try {
      return jwt.verify(token, this.jwtSecret, {
        algorithms: ["HS256"],
      }) as TokenPayload;
    } catch {
      throw new Error("Invalid or expired token");
    }
  }

  async isUsernameTaken(name: string): Promise<boolean> {
    if (!this.isLinux) return false;
    return this.isOsUserTaken(name);
  }

  hasUser(): boolean {
    return this.adminUser !== null;
  }

  getUserName(): string | undefined {
    return this.adminUser ?? undefined;
  }
}
