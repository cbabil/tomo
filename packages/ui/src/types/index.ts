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

export type AppType = "store" | "custom" | "template" | "external";

export interface SetupField {
  key: string;
  label: string;
  type: "text" | "path" | "number" | "select" | "boolean";
  default?: string;
  required?: boolean;
  placeholder?: string;
  options?: Array<{ label: string; value: string }>;
  description?: string;
}

export interface AppTemplate {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: string;
  image: string;
  containerPort: number;
  setupFields?: SetupField[];
}

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

export const SETTINGS_TABS = [
  "account",
  "appearance",
  "language",
  "appStore",
  "update",
] as const;

export type SettingsTab = (typeof SETTINGS_TABS)[number];

export type ThemeMode = "dark" | "light";
