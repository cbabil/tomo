import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import ShieldIcon from "@mui/icons-material/Shield";
import BoltIcon from "@mui/icons-material/Bolt";
import CloudOffIcon from "@mui/icons-material/CloudOff";
import { useTranslation } from "react-i18next";

interface WelcomeStepProps {
  onNext: () => void;
}

export function WelcomeStep({ onNext }: WelcomeStepProps) {
  const { t } = useTranslation();

  return (
    <Box sx={styles.container}>
      <Box sx={styles.glassOverlay} />

      <Box sx={styles.content}>
        <Typography sx={styles.logo}>tomo</Typography>

        <Box sx={styles.taglineGroup}>
          <Typography variant="h3" sx={styles.tagline}>
            {t("onboarding.welcome.tagline")}
            <br />
            <Box component="span" sx={{ color: "primary.main" }}>
              {t("onboarding.welcome.taglineAccent")}
            </Box>
          </Typography>
          <Typography sx={styles.subtitle}>
            {t("onboarding.welcome.subtitle")}
          </Typography>
        </Box>

        <Button
          variant="contained"
          color="primary"
          onClick={onNext}
          endIcon={<ArrowForwardIcon />}
          sx={styles.button}
        >
          {t("onboarding.welcome.getStarted")}
        </Button>

        <Box sx={styles.features}>
          <FeatureItem icon={<ShieldIcon />} label={t("onboarding.welcome.private")} />
          <FeatureItem icon={<BoltIcon />} label={t("onboarding.welcome.fast")} />
          <FeatureItem icon={<CloudOffIcon />} label={t("onboarding.welcome.local")} />
        </Box>
      </Box>

      <Box sx={styles.glow} />
    </Box>
  );
}

function FeatureItem({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <Box sx={styles.featureItem}>
      <Box sx={styles.featureIcon}>{icon}</Box>
      <Typography sx={styles.featureLabel}>{label}</Typography>
    </Box>
  );
}

const styles = {
  container: {
    position: "relative" as const,
    width: "100%",
    height: "100%",
    maxWidth: 672,
    display: "flex",
    flexDirection: "column" as const,
    px: 3,
  },
  glassOverlay: {
    position: "fixed" as const,
    inset: 0,
    bgcolor: "rgba(15, 23, 42, 0.4)",
    backdropFilter: "blur(24px)",
    WebkitBackdropFilter: "blur(24px)",
    zIndex: 0,
  },
  content: {
    position: "relative" as const,
    zIndex: 1,
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    justifyContent: "center",
    textAlign: "center" as const,
    flex: 1,
    py: 4,
  },
  logo: {
    fontSize: "2rem",
    fontWeight: 300,
    letterSpacing: "0.25em",
    textTransform: "uppercase" as const,
    color: "rgba(255, 255, 255, 0.9)",
    textShadow: "0 0 20px rgba(145, 71, 255, 0.8)",
    mb: 4,
  },
  taglineGroup: {
    display: "flex",
    flexDirection: "column" as const,
    gap: 2,
    mb: 4,
  },
  tagline: {
    fontWeight: 900,
    letterSpacing: "-0.02em",
    color: "#fff",
    lineHeight: 1.15,
    filter: "drop-shadow(0 4px 12px rgba(0, 0, 0, 0.5))",
  },
  subtitle: {
    color: "text.secondary",
    fontSize: "1.125rem",
    maxWidth: 400,
    mx: "auto",
    lineHeight: 1.6,
  },
  button: {
    width: "100%",
    maxWidth: 320,
    height: 56,
    fontSize: "1.125rem",
    fontWeight: 700,
    borderRadius: 2,
    boxShadow: "0 8px 24px rgba(145, 70, 255, 0.2)",
  },
  features: {
    display: "grid",
    gridTemplateColumns: "repeat(3, 1fr)",
    gap: 4,
    width: "100%",
    mt: 6,
  },
  featureItem: {
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    gap: 1,
  },
  featureIcon: {
    color: "rgba(145, 70, 255, 0.6)",
    "& .MuiSvgIcon-root": { fontSize: 24 },
  },
  featureLabel: {
    fontSize: "0.75rem",
    fontWeight: 500,
    color: "text.secondary",
  },
  glow: {
    position: "absolute" as const,
    top: "50%",
    left: "50%",
    transform: "translate(-50%, -50%)",
    width: "140%",
    height: "140%",
    opacity: 0.3,
    pointerEvents: "none" as const,
    zIndex: -1,
    background:
      "radial-gradient(circle at center, rgba(145, 70, 255, 0.3), transparent 70%)",
    filter: "blur(48px)",
  },
};
