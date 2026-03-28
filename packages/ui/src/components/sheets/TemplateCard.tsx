import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import { useTranslation } from "react-i18next";
import { GlassCard } from "../ui/GlassCard";
import { CardIcon } from "../ui/CardIcon";
import { colors } from "../../app/theme";
import { appCardStyles } from "./AppCard";
import type { AppTemplate } from "../../types";

interface TemplateCardProps {
  template: AppTemplate;
  isInstalled: boolean;
  onInstall: () => void;
}

export function TemplateCard({
  template,
  isInstalled,
  onInstall,
}: TemplateCardProps) {
  const { t } = useTranslation();

  return (
    <GlassCard sx={appCardStyles.card}>
      <CardIcon src={template.icon} name={template.name} />
      <Box sx={appCardStyles.info}>
        <Typography variant="body2" sx={appCardStyles.name} noWrap>
          {template.name}
        </Typography>
        <Typography variant="caption" sx={appCardStyles.caption} noWrap>
          {template.category}
        </Typography>
        <Typography variant="caption" sx={appCardStyles.caption} noWrap>
          {template.description}
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
            sx={appCardStyles.installButton}
          >
            {t("appStore.install")}
          </Button>
        )}
      </Box>
    </GlassCard>
  );
}
