import { useState, useEffect, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import Box from "@mui/material/Box";
import TextField from "@mui/material/TextField";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import Alert from "@mui/material/Alert";
import CircularProgress from "@mui/material/CircularProgress";
import { useTranslation } from "react-i18next";
import { useAuth } from "../../hooks/useAuth";
import { fullPageGradient } from "../../styles/shared";

export function LoginPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const {
    isAuthenticated,
    hasUser,
    hasUserLoading,
    login,
    loginError,
    isLoggingIn,
  } = useAuth();
  const [password, setPassword] = useState("");

  useEffect(() => {
    if (hasUserLoading) return;
    if (!hasUser) {
      navigate("/onboarding", { replace: true });
    } else if (isAuthenticated) {
      navigate("/", { replace: true });
    }
  }, [hasUser, hasUserLoading, isAuthenticated, navigate]);

  if (hasUserLoading || !hasUser || isAuthenticated) {
    return (
      <Box sx={fullPageGradient}>
        <CircularProgress sx={{ color: "primary.main" }} />
      </Box>
    );
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!password.trim()) return;
    try {
      await login(password);
      navigate("/", { replace: true });
    } catch {
      // Error is captured in loginError
    }
  };

  return (
    <Box sx={fullPageGradient}>
      <Box sx={styles.card}>
        <Typography variant="h4" sx={styles.logo}>
          tomo
        </Typography>
        <Typography variant="body2" sx={{ color: "text.secondary", mb: 3 }}>
          {t("login.title")}
        </Typography>

        <Box component="form" onSubmit={handleSubmit} sx={styles.form}>
          {loginError && (
            <Alert severity="error" sx={{ borderRadius: 2 }}>
              {t("login.error")}
            </Alert>
          )}

          <TextField
            type="password"
            placeholder={t("login.placeholder")}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            fullWidth
            autoFocus
            disabled={isLoggingIn}
          />

          <Button
            type="submit"
            variant="contained"
            color="primary"
            fullWidth
            disabled={isLoggingIn || !password.trim()}
            sx={styles.button}
          >
            {isLoggingIn ? (
              <CircularProgress size={20} sx={{ color: "#fff" }} />
            ) : (
              t("login.unlock")
            )}
          </Button>
        </Box>
      </Box>
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
    width: 380,
  },
  logo: {
    fontWeight: 700,
    letterSpacing: "-0.02em",
    color: "text.primary",
    mb: 0.5,
  },
  form: {
    width: "100%",
    display: "flex",
    flexDirection: "column" as const,
    gap: 2,
  },
  button: {
    mt: 1,
    "&:disabled": { backgroundColor: "rgba(145,70,255,0.4)" },
  },
};
