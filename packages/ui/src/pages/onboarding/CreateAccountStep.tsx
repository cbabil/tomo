import { useState, useMemo, type FormEvent } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import CircularProgress from "@mui/material/CircularProgress";
import LinearProgress from "@mui/material/LinearProgress";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import RadioButtonUncheckedIcon from "@mui/icons-material/RadioButtonUnchecked";
import { useTranslation } from "react-i18next";
import { trpc } from "../../lib/trpc";

const MIN_PASSWORD_LENGTH = 12;

interface PasswordRequirement {
  key: string;
  label: string;
  test: (pw: string) => boolean;
}

interface CreateAccountStepProps {
  onNext: () => void;
}

const STRENGTH_LEVELS = [
  { maxScore: 1, label: "weak", color: "#ef4444" },
  { maxScore: 2, label: "fair", color: "#f59e0b" },
  { maxScore: 3, label: "good", color: "#4c6ef5" },
  { maxScore: 4, label: "strong", color: "#23ce6b" },
  { maxScore: 5, label: "veryStrong", color: "#23ce6b" },
] as const;

function getStrength(score: number) {
  return STRENGTH_LEVELS.find((l) => score <= l.maxScore) ?? STRENGTH_LEVELS[4];
}

export function CreateAccountStep({ onNext }: CreateAccountStepProps) {
  const { t } = useTranslation();
  const registerMutation = trpc.user.register.useMutation();
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);

  const requirements: PasswordRequirement[] = useMemo(
    () => [
      {
        key: "length",
        label: t("onboarding.createAccount.reqLength"),
        test: (pw: string) => pw.length >= MIN_PASSWORD_LENGTH,
      },
      {
        key: "uppercase",
        label: t("onboarding.createAccount.reqUppercase"),
        test: (pw: string) => /[A-Z]/.test(pw),
      },
      {
        key: "lowercase",
        label: t("onboarding.createAccount.reqLowercase"),
        test: (pw: string) => /[a-z]/.test(pw),
      },
      {
        key: "number",
        label: t("onboarding.createAccount.reqNumber"),
        test: (pw: string) => /[0-9]/.test(pw),
      },
      {
        key: "special",
        label: t("onboarding.createAccount.reqSpecial"),
        test: (pw: string) => /[^A-Za-z0-9]/.test(pw),
      },
    ],
    [t],
  );

  const metCount = requirements.filter((r) => r.test(password)).length;
  const allRequirementsMet = metCount === requirements.length;
  const strength = getStrength(metCount);
  const progressValue = (metCount / requirements.length) * 100;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!allRequirementsMet) {
      setError(t("onboarding.createAccount.tooShort"));
      return;
    }
    if (password !== confirm) {
      setError(t("onboarding.createAccount.mismatch"));
      return;
    }

    try {
      await registerMutation.mutateAsync({ name: name.trim(), password });
      onNext();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <Box sx={styles.card}>
      <Typography variant="h4" sx={styles.title}>
        {t("onboarding.createAccount.title")}
      </Typography>

      <Box component="form" onSubmit={handleSubmit} sx={styles.form}>
        {error && (
          <Typography variant="body2" sx={styles.errorText}>
            {error}
          </Typography>
        )}

        <TextField
          label={t("onboarding.createAccount.name")}
          placeholder={t("onboarding.createAccount.namePlaceholder")}
          value={name}
          onChange={(e) => setName(e.target.value)}
          fullWidth
          autoFocus
          required
        />
        <TextField
          type="password"
          label={t("onboarding.createAccount.password")}
          placeholder={t("onboarding.createAccount.passwordPlaceholder")}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          fullWidth
          required
        />

        <TextField
          type="password"
          label={t("onboarding.createAccount.confirm")}
          placeholder={t("onboarding.createAccount.confirmPlaceholder")}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          fullWidth
          required
        />

        <Box sx={styles.strengthSection}>
          <Box sx={styles.strengthHeader}>
            <LinearProgress
              variant="determinate"
              value={password.length > 0 ? progressValue : 0}
              sx={{
                ...styles.progressBar,
                "& .MuiLinearProgress-bar": {
                  backgroundColor: password.length > 0 ? strength.color : "transparent",
                  transition: "transform 0.3s ease, background-color 0.3s ease",
                },
              }}
            />
            <Typography
              variant="caption"
              sx={{
                color: password.length > 0 ? strength.color : "text.secondary",
                fontWeight: 600,
                minHeight: 18,
              }}
            >
              {password.length > 0
                ? t(`onboarding.createAccount.strength.${strength.label}`)
                : " "}
            </Typography>
          </Box>
          <Box sx={styles.requirements}>
            {requirements.map((req) => {
              const met = password.length > 0 && req.test(password);
              return (
                <Box key={req.key} sx={styles.requirementRow}>
                  {met ? (
                    <CheckCircleIcon sx={styles.iconMet} />
                  ) : (
                    <RadioButtonUncheckedIcon sx={styles.iconUnmet} />
                  )}
                  <Typography
                    variant="caption"
                    sx={{ color: met ? "success.main" : "text.secondary" }}
                  >
                    {req.label}
                  </Typography>
                </Box>
              );
            })}
          </Box>
        </Box>

        <Button
          type="submit"
          variant="contained"
          color="primary"
          fullWidth
          disabled={registerMutation.isPending}
          sx={styles.button}
        >
          {registerMutation.isPending ? (
            <CircularProgress size={20} sx={{ color: "#fff" }} />
          ) : (
            t("onboarding.createAccount.submit")
          )}
        </Button>
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
    maxWidth: 440,
    width: "100%",
  },
  title: {
    fontWeight: 700,
    color: "text.primary",
    textAlign: "center" as const,
  },
  form: {
    width: "100%",
    display: "flex",
    flexDirection: "column" as const,
    gap: 2,
    mt: 2,
  },
  strengthSection: {
    display: "flex",
    flexDirection: "column" as const,
    gap: 1.5,
  },
  strengthHeader: {
    display: "flex",
    flexDirection: "column" as const,
    gap: 0.5,
  },
  progressBar: {
    height: 6,
    borderRadius: 3,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  requirements: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 0.75,
    pl: 0.5,
  },
  requirementRow: {
    display: "flex",
    alignItems: "center",
    gap: 0.75,
  },
  iconMet: {
    fontSize: 16,
    color: "success.main",
  },
  iconUnmet: {
    fontSize: 16,
    color: "text.secondary",
    opacity: 0.5,
  },
  errorText: {
    color: "#ef4444",
    textAlign: "center" as const,
  },
  button: {
    mt: 1,
    "&:disabled": { backgroundColor: "rgba(145,70,255,0.4)" },
  },
};
