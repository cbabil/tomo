import { useState, type FormEvent } from "react";
import Box from "@mui/material/Box";
import TextField from "@mui/material/TextField";
import Button from "@mui/material/Button";
import Alert from "@mui/material/Alert";
import CircularProgress from "@mui/material/CircularProgress";
import { useTranslation } from "react-i18next";
import { trpc } from "../../../lib/trpc";

export function AccountSection() {
  const { t } = useTranslation();
  const changePasswordMutation = trpc.user.changePassword.useMutation();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    if (newPassword !== confirmPassword) {
      setError(t("onboarding.createAccount.mismatch"));
      return;
    }

    try {
      await changePasswordMutation.mutateAsync({
        oldPassword: currentPassword,
        newPassword,
      });
      setSuccess(true);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <Box>
      <Box component="form" onSubmit={handleSubmit} sx={styles.form}>
        {success && (
          <Alert severity="success" sx={{ borderRadius: 2 }}>
            {t("settings.account.passwordChanged")}
          </Alert>
        )}
        {error && (
          <Alert severity="error" sx={{ borderRadius: 2 }}>
            {error}
          </Alert>
        )}

        <TextField
          type="password"
          label={t("settings.account.currentPassword")}
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          fullWidth
          size="small"
        />
        <TextField
          type="password"
          label={t("settings.account.newPassword")}
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          fullWidth
          size="small"
        />
        <TextField
          type="password"
          label={t("settings.account.confirmPassword")}
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          fullWidth
          size="small"
        />
        <Button
          type="submit"
          variant="contained"
          color="primary"
          disabled={changePasswordMutation.isPending}
          sx={styles.saveButton}
        >
          {changePasswordMutation.isPending ? (
            <CircularProgress size={18} sx={{ color: "#fff" }} />
          ) : (
            t("settings.account.save")
          )}
        </Button>
      </Box>
    </Box>
  );
}

const styles = {
  form: {
    display: "flex",
    flexDirection: "column" as const,
    gap: 2,
  },
  saveButton: {
    alignSelf: "flex-start",
  },
};
