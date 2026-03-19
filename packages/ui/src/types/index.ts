export interface App {
  id: string;
  name: string;
  tagline: string;
  description: string;
  icon: string;
  category: string;
  version: string;
  repo: string;
  developer: string;
  port?: number;
}

export type AppType = "store" | "custom" | "external";

export interface InstalledApp extends App {
  status: "running" | "stopped" | "error" | "external";
  webPort?: number;
  type?: AppType;
  externalUrl?: string;
}

export interface SystemStats {
  cpu: number;
  memory: { used: number; total: number };
  disk: { used: number; total: number };
  uptime: number;
}

export interface SystemInfo {
  hostname: string;
  os: string;
  platform: string;
}

export interface UserInfo {
  name: string;
}

export type Sheet = "appStore" | "settings" | "system" | null;

export type ThemeMode = "dark" | "light";
