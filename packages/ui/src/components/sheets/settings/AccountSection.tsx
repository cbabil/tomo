import { useState, type FormEvent } from "react";
import Box from "@mui/material/Box";
import Divider from "@mui/material/Divider";
import TextField from "@mui/material/TextField";
import Button from "@mui/material/Button";
import Alert from "@mui/material/Alert";
import CircularProgress from "@mui/material/CircularProgress";
import LogoutIcon from "@mui/icons-material/Logout";
import { useTranslation } from "react-i18next";
import { trpc } from "../../../lib/trpc";
import { useAuth } from "../../../hooks/useAuth";

export function AccountSection() {
  const { t } = useTranslation();
  const { logout } = useAuth();
  const [loggingOut, setLoggingOut] = useState(false);
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

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await logout();
    } catch {
      setLoggingOut(false);
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

      <Divider sx={styles.divider} />

      <Button
        variant="outlined"
        color="error"
        startIcon={<LogoutIcon />}
        onClick={handleLogout}
        disabled={loggingOut}
        sx={styles.logoutButton}
      >
        {loggingOut ? (
          <CircularProgress size={18} sx={{ color: "error.main" }} />
        ) : (
          t("settings.account.logout")
        )}
      </Button>
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
  divider: {
    my: 3,
    borderColor: "divider",
  },
  logoutButton: {
    alignSelf: "flex-start",
  },
};
