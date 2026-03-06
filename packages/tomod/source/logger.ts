type LogLevel = "debug" | "info" | "warn" | "error";

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

// Inline env read to avoid circular dependency with config.ts
const currentLevel: LogLevel =
  (process.env.LOG_LEVEL as LogLevel) ?? "info";

function formatTimestamp(): string {
  return new Date().toISOString();
}

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] >= LOG_LEVELS[currentLevel];
}

function formatMessage(
  level: LogLevel,
  module: string,
  message: string,
  data?: Record<string, unknown>,
): string {
  const timestamp = formatTimestamp();
  const prefix = `[${timestamp}] [${level.toUpperCase()}] [${module}]`;
  if (data) {
    return `${prefix} ${message} ${JSON.stringify(data)}`;
  }
  return `${prefix} ${message}`;
}

export interface Logger {
  debug(message: string, data?: Record<string, unknown>): void;
  info(message: string, data?: Record<string, unknown>): void;
  warn(message: string, data?: Record<string, unknown>): void;
  error(message: string, data?: Record<string, unknown>): void;
}

export function createLogger(module: string): Logger {
  return {
    debug(message: string, data?: Record<string, unknown>): void {
      if (shouldLog("debug")) {
        process.stdout.write(formatMessage("debug", module, message, data) + "\n");
      }
    },
    info(message: string, data?: Record<string, unknown>): void {
      if (shouldLog("info")) {
        process.stdout.write(formatMessage("info", module, message, data) + "\n");
      }
    },
    warn(message: string, data?: Record<string, unknown>): void {
      if (shouldLog("warn")) {
        process.stderr.write(formatMessage("warn", module, message, data) + "\n");
      }
    },
    error(message: string, data?: Record<string, unknown>): void {
      if (shouldLog("error")) {
        process.stderr.write(formatMessage("error", module, message, data) + "\n");
      }
    },
  };
}
