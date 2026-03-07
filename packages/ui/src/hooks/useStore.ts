import { create } from "zustand";
import type { Sheet, ThemeMode } from "../types";

interface UIState {
  activeSheet: Sheet;
  themeMode: ThemeMode;
  wallpaper: string;
  spotlightOpen: boolean;
}

interface UIActions {
  openSheet: (sheet: Sheet) => void;
  closeSheet: () => void;
  setThemeMode: (mode: ThemeMode) => void;
  setWallpaper: (url: string) => void;
  openSpotlight: () => void;
  closeSpotlight: () => void;
  toggleSpotlight: () => void;
}

type UIStore = UIState & UIActions;

export const useStore = create<UIStore>((set, get) => ({
  activeSheet: null,
  themeMode: "dark",
  wallpaper: "default",
  spotlightOpen: false,

  openSheet: (sheet) => set({ activeSheet: sheet }),
  closeSheet: () => set({ activeSheet: null }),
  setThemeMode: (mode) => set({ themeMode: mode }),
  setWallpaper: (url) => set({ wallpaper: url }),
  openSpotlight: () => set({ spotlightOpen: true }),
  closeSpotlight: () => set({ spotlightOpen: false }),
  toggleSpotlight: () => set({ spotlightOpen: !get().spotlightOpen }),
}));
