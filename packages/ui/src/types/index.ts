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

/** What the user gave Tomo to build a custom app; editable after install. */
export interface CustomSource {
  image?: string;
  composeYaml?: string;
  containerPort: number;
  allowPrivileged?: boolean;
}

export interface InstalledApp extends App {
  status:
    | "running"
    | "stopped"
    | "error"
    | "external"
    | "installing"
    | "starting"
    | "restarting"
    | "stopping";
  webPort?: number;
  /** Where the tile opens when the web UI is not at "/", e.g. "/ui". */
  webPath?: string;
  type?: AppType;
  externalUrl?: string;
  /** System apps (e.g. the built-in Terminal) hidden from app lists. */
  hidden?: boolean;
  /** The app has its own sign-in and is served without the Tomo login. */
  ownAuth?: boolean;
  /** Set for custom apps. */
  source?: CustomSource;
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
  "aiAccess",
] as const;

export type SettingsTab = (typeof SETTINGS_TABS)[number];

export type ThemeMode = "dark" | "light";
