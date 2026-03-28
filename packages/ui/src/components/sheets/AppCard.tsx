import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import { useTranslation } from "react-i18next";
import { GlassCard } from "../ui/GlassCard";
import { CardIcon } from "../ui/CardIcon";
import { colors } from "../../app/theme";
import type { App } from "../../types";

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
    <GlassCard sx={appCardStyles.card}>
      <CardIcon src={app.icon} name={app.name} />
      <Box sx={appCardStyles.info}>
        <Typography variant="body2" sx={appCardStyles.name} noWrap>
          {app.name}
        </Typography>
        {meta && (
          <Typography variant="caption" sx={appCardStyles.caption} noWrap>
            {meta}
          </Typography>
        )}
        <Typography variant="caption" sx={appCardStyles.caption} noWrap>
          {app.tagline}
        </Typography>
      </Box>
      <Box sx={appCardStyles.action}>
        {isInstalled ? (
          <Box sx={appCardStyles.installedState}>
            <CheckCircleIcon sx={{ color: colors.success, fontSize: 20 }} />
            <Typography variant="caption" sx={appCardStyles.installedText}>
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
            sx={appCardStyles.installButton}
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

export const appCardStyles = {
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
