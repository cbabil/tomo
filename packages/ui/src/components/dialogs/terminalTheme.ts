import { colors } from "../../app/theme";

/** Background of the terminal surface — shared by the xterm canvas and the
 *  modal window chrome so they never drift apart. */
export const TERMINAL_BG = "#1e1e1e";

/** xterm color theme. Applied client-side (not baked into the container), so it
 *  also styles terminals that were installed before this theme existed. */
export const TERMINAL_THEME = {
  background: TERMINAL_BG,
  foreground: "#e4e4e4",
  cursor: colors.primary,
  cursorAccent: TERMINAL_BG,
  selectionBackground: "#3a3d41",
  black: TERMINAL_BG,
  brightBlack: "#6b7280",
};
