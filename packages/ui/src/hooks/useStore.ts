import { create } from "zustand";
import type { Sheet, ThemeMode } from "../types";

interface UIState {
  activeSheet: Sheet;
  themeMode: ThemeMode;
  wallpaper: string;
  dockItems: string[];
}

interface UIActions {
  openSheet: (sheet: Sheet) => void;
  closeSheet: () => void;
  setThemeMode: (mode: ThemeMode) => void;
  setWallpaper: (url: string) => void;
}

type UIStore = UIState & UIActions;

export const useStore = create<UIStore>((set) => ({
  activeSheet: null,
  themeMode: "dark",
  wallpaper: "default",
  dockItems: ["home", "appStore", "settings"],

  openSheet: (sheet) => set({ activeSheet: sheet }),
  closeSheet: () => set({ activeSheet: null }),
  setThemeMode: (mode) => set({ themeMode: mode }),
  setWallpaper: (url) => set({ wallpaper: url }),
}));
