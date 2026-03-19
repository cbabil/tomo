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
};
