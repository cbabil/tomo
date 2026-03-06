import { useState, useCallback } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import { useTranslation } from "react-i18next";
import { GlassCard } from "../ui/GlassCard";
import { colors } from "../../app/theme";
import type { App } from "../../types";

interface AppCardIconProps {
  src: string;
  name: string;
}

function AppCardIcon({ src, name }: AppCardIconProps) {
  const [failed, setFailed] = useState(false);
  const handleError = useCallback(() => setFailed(true), []);

  if (failed || !src) {
    return (
      <Box sx={styles.iconFallback}>
        <Typography sx={styles.iconFallbackText}>
          {name.charAt(0).toUpperCase()}
        </Typography>
      </Box>
    );
  }

  return (
    <Box
      component="img"
      src={src}
      alt={name}
      onError={handleError}
      sx={styles.icon}
    />
  );
}

interface AppCardProps {
  app: App;
  isInstalled: boolean;
  isInstalling: boolean;
  onInstall: () => void;
}

export function AppCard({
  app,
  isInstalled,
  isInstalling,
  onInstall,
}: AppCardProps) {
  const { t } = useTranslation();

  const meta = [app.category, app.developer].filter(Boolean).join(" · ");

  return (
    <GlassCard sx={styles.card}>
      <AppCardIcon src={app.icon} name={app.name} />
      <Box sx={styles.info}>
        <Typography variant="body2" sx={styles.name} noWrap>
          {app.name}
        </Typography>
        {meta && (
          <Typography variant="caption" sx={styles.caption} noWrap>
            {meta}
          </Typography>
        )}
        <Typography variant="caption" sx={styles.caption} noWrap>
          {app.tagline}
        </Typography>
      </Box>
      <Box sx={styles.action}>
        {isInstalled ? (
          <Box sx={styles.installedState}>
            <CheckCircleIcon sx={{ color: colors.success, fontSize: 20 }} />
            <Typography variant="caption" sx={styles.installedText}>
              {t("appStore.installed")}
            </Typography>
          </Box>
        ) : (
          <Button
            size="small"
            variant="contained"
            color="primary"
            onClick={onInstall}
            disabled={isInstalling}
            sx={styles.installButton}
          >
            {isInstalling ? (
              <CircularProgress size={14} sx={{ color: "#fff" }} />
            ) : (
              t("appStore.install")
            )}
          </Button>
        )}
      </Box>
    </GlassCard>
  );
}

const styles = {
  card: {
    display: "flex",
    alignItems: "center",
    gap: 2,
    minWidth: 0,
    borderRadius: "12px",
    transition: "background-color 0.2s ease",
    "&:hover": {
      backgroundColor: "rgba(255,255,255,0.12)",
    },
  },
  icon: {
    width: 56,
    height: 56,
    borderRadius: "12px",
    objectFit: "cover" as const,
    flexShrink: 0,
  },
  iconFallback: {
    width: 56,
    height: 56,
    borderRadius: "12px",
    flexShrink: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: `${colors.primary}33`,
  },
  iconFallbackText: {
    color: colors.primary,
    fontWeight: 700,
    fontSize: "1.25rem",
  },
  info: {
    flex: 1,
    minWidth: 0,
    display: "flex",
    flexDirection: "column" as const,
  },
  name: {
    color: "text.primary",
    fontWeight: 500,
    lineHeight: 1.3,
  },
  caption: {
    color: "text.secondary",
    fontSize: "0.75rem",
    lineHeight: 1.4,
  },
  action: {
    flexShrink: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  installButton: {
    borderRadius: "8px",
    height: 32,
    px: 2,
    fontSize: "0.8125rem",
    fontWeight: 500,
    textTransform: "none" as const,
  },
  installedState: {
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    gap: 0.25,
  },
  installedText: {
    color: "text.secondary",
    fontSize: "0.75rem",
    fontWeight: 500,
  },
};
