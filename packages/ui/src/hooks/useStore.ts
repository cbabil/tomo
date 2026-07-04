import { create } from "zustand";
import type { Sheet, SettingsTab, ThemeMode, AppTemplate } from "../types";

interface EditingExternalApp {
  id: string;
  name: string;
  url: string;
  icon?: string;
}

interface LogsApp {
  id: string;
  name: string;
}

interface UIState {
  activeSheet: Sheet;
  settingsTab: SettingsTab;
  themeMode: ThemeMode;
  wallpaper: string;
  spotlightOpen: boolean;
  customAppDialogOpen: boolean;
  editingExternalApp: EditingExternalApp | null;
  selectedTemplate: AppTemplate | null;
  logsApp: LogsApp | null;
}

interface UIActions {
  openSheet: (sheet: Sheet) => void;
  closeSheet: () => void;
  openSettings: (tab?: SettingsTab) => void;
  setSettingsTab: (tab: SettingsTab) => void;
  setThemeMode: (mode: ThemeMode) => void;
  setWallpaper: (url: string) => void;
  openSpotlight: () => void;
  closeSpotlight: () => void;
  toggleSpotlight: () => void;
  openCustomAppDialog: () => void;
  closeCustomAppDialog: () => void;
  openEditExternalApp: (app: EditingExternalApp) => void;
  closeEditExternalApp: () => void;
  openTemplateInstall: (template: AppTemplate) => void;
  closeTemplateInstall: () => void;
  openLogs: (app: LogsApp) => void;
  closeLogs: () => void;
}

type UIStore = UIState & UIActions;

export const useStore = create<UIStore>((set, get) => ({
  activeSheet: null,
  settingsTab: "account",
  themeMode: "dark",
  wallpaper: "default",
  spotlightOpen: false,
  customAppDialogOpen: false,
  editingExternalApp: null,
  selectedTemplate: null,
  logsApp: null,

  openSheet: (sheet) => set({ activeSheet: sheet }),
  closeSheet: () => set({ activeSheet: null }),
  openSettings: (tab = "account") =>
    set({ activeSheet: "settings", settingsTab: tab }),
  setSettingsTab: (tab) => set({ settingsTab: tab }),
  setThemeMode: (mode) => set({ themeMode: mode }),
  setWallpaper: (url) => set({ wallpaper: url }),
  openSpotlight: () => set({ spotlightOpen: true }),
  closeSpotlight: () => set({ spotlightOpen: false }),
  toggleSpotlight: () => set({ spotlightOpen: !get().spotlightOpen }),
  openCustomAppDialog: () => set({ customAppDialogOpen: true }),
  closeCustomAppDialog: () => set({ customAppDialogOpen: false }),
  openEditExternalApp: (app) => set({ editingExternalApp: app }),
  closeEditExternalApp: () => set({ editingExternalApp: null }),
  openTemplateInstall: (template) => set({ selectedTemplate: template }),
  closeTemplateInstall: () => set({ selectedTemplate: null }),
  openLogs: (app) => set({ logsApp: app }),
  closeLogs: () => set({ logsApp: null }),
}));
