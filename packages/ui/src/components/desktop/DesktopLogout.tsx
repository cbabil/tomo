import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import LogoutIcon from "@mui/icons-material/Logout";
import { useTranslation } from "react-i18next";
import { colors } from "../../app/theme";
import { useAuth } from "../../hooks/useAuth";

export function DesktopLogout() {
  const { t } = useTranslation();
  const { logout, isLoggingOut } = useAuth();

  return (
    <Button
      variant="text"
      size="small"
      onClick={() => logout()}
      disabled={isLoggingOut}
      startIcon={
        isLoggingOut ? (
          <CircularProgress size={16} sx={{ color: "inherit" }} />
        ) : (
          <LogoutIcon />
        )
      }
      sx={styles.root}
    >
      {t("settings.account.logout")}
    </Button>
  );
}

const styles = {
  root: {
    position: "fixed" as const,
    top: 12,
    right: 16,
    zIndex: 11,
    textTransform: "none" as const,
    fontWeight: 600,
    color: "rgba(255,255,255,0.7)",
    textShadow: "0 1px 4px rgba(0,0,0,0.4)",
    "&:hover": {
      backgroundColor: "transparent",
      color: colors.error,
    },
  },
};
