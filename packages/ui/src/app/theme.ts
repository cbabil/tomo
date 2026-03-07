import { createTheme, type ThemeOptions } from "@mui/material/styles";

const colors = {
  primary: "#9146FF",
  primaryBoost: "#7B31FF",
  error: "#ef4444",
  success: "#23ce6b",
  warning: "#f59e0b",
  info: "#4c6ef5",
  iconHover: "#B388FF",
  textPrimary: "#e2e8f0",
  textSecondary: "#94a3b8",
  surface: "#1e293b",
};

const sharedOptions: ThemeOptions = {
  typography: {
    fontFamily: "Inter, system-ui, -apple-system, sans-serif",
    fontSize: 14,
  },
  shape: {
    borderRadius: 12,
  },
  components: {
    MuiButtonBase: {
      defaultProps: {
        disableRipple: true,
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          backgroundColor: "rgba(255,255,255,0.05)",
          borderRadius: 8,
          "& fieldset": { borderColor: "rgba(255,255,255,0.1)" },
          "&:hover fieldset": { borderColor: "rgba(255,255,255,0.2)" },
          "&.Mui-focused fieldset": { borderColor: colors.primary },
        },
        input: {
          color: colors.textPrimary,
        },
      },
    },
    MuiInputLabel: {
      styleOverrides: {
        root: {
          color: colors.textSecondary,
          "&.Mui-focused": { color: colors.primary },
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: "none",
          fontWeight: 600,
        },
        containedPrimary: {
          backgroundColor: colors.primary,
          "&:hover": { backgroundColor: colors.primaryBoost },
          borderRadius: 8,
          padding: "12px 0",
        },
      },
    },
    MuiIconButton: {
      styleOverrides: {
        root: {
          "&:hover": {
            backgroundColor: "transparent",
            color: colors.iconHover,
          },
        },
      },
    },
  },
};

export const darkTheme = createTheme({
  ...sharedOptions,
  palette: {
    mode: "dark",
    primary: { main: colors.primary },
    error: { main: colors.error },
    success: { main: colors.success },
    warning: { main: colors.warning },
    info: { main: colors.info },
    background: {
      default: "#0f172a",
      paper: "#0f172a",
    },
    text: {
      primary: "#e2e8f0",
      secondary: "#94a3b8",
    },
    divider: "#1f2937",
  },
});

export const lightTheme = createTheme({
  ...sharedOptions,
  palette: {
    mode: "light",
    primary: { main: colors.primary },
    error: { main: colors.error },
    success: { main: colors.success },
    warning: { main: colors.warning },
    info: { main: colors.info },
    background: {
      default: "#f7f7fa",
      paper: "#ffffff",
    },
    text: {
      primary: "#111827",
      secondary: "#6b7280",
    },
    divider: "#d1d5db",
  },
});

export { colors };
