import { colors } from "../../app/theme";

export const dialogStyles = {
  paper: {
    backgroundColor: "#0f172a",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: 3,
    width: "min(560px, calc(100vw - 64px))",
    maxHeight: "calc(100vh - 64px)",
  },
  title: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  },
  closeBtn: {
    color: colors.textSecondary,
  },
  content: {
    pt: 2,
  },
  form: {
    display: "flex",
    flexDirection: "column" as const,
    gap: 2,
  },
  actions: {
    px: 3,
    pb: 2,
  },
  // Shared "near-fullscreen" dialog shell (logs / terminal viewers).
  fullscreenSize: {
    width: "min(1280px, calc(100vw - 48px))",
    maxWidth: "min(1280px, calc(100vw - 48px))",
    height: "calc(100vh - 48px)",
    maxHeight: "calc(100vh - 48px)",
  },
  titleActions: {
    display: "flex",
    alignItems: "center",
    gap: 0.5,
  },
  fullscreenContent: {
    pt: 1,
    pb: 2,
    display: "flex",
    flexDirection: "column" as const,
    minHeight: 0,
  },
  centered: {
    flex: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    minHeight: 160,
  },
  emptyText: {
    color: colors.textSecondary,
    fontSize: "0.875rem",
  },
};
