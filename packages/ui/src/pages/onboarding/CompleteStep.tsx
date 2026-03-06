import { useNavigate } from "react-router-dom";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import { useTranslation } from "react-i18next";

export function CompleteStep() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <Box sx={styles.card}>
      <CheckCircleOutlineIcon sx={{ fontSize: 64, color: "success.main", mb: 2 }} />
      <Typography variant="h4" sx={styles.title}>
        {t("onboarding.complete.title")}
      </Typography>
      <Typography variant="body1" sx={styles.subtitle}>
        {t("onboarding.complete.subtitle")}
      </Typography>
      <Button
        variant="contained"
        color="primary"
        onClick={() => navigate("/login", { replace: true })}
      >
        {t("onboarding.complete.goToDesktop")}
      </Button>
    </Box>
  );
}

const styles = {
  card: {
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    gap: 2,
    p: 5,
    maxWidth: 440,
    width: "100%",
  },
  title: {
    fontWeight: 700,
    color: "text.primary",
    textAlign: "center" as const,
  },
  subtitle: {
    color: "text.secondary",
    textAlign: "center" as const,
    mb: 2,
  },
};
