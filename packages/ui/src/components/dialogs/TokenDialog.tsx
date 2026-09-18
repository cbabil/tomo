import { useState } from "react";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { useTranslation } from "react-i18next";
import { trpc } from "../../lib/trpc";
import { colors } from "../../app/theme";
import { dialogStyles } from "./styles";

const EXPIRY_CHOICES = [30, 90, 365, null] as const;
const DEFAULT_EXPIRY_DAYS = 90;

interface TokenDialogProps {
  open: boolean;
  onClose: () => void;
  /** Called with the new secret; the caller shows it once. */
  onCreated: (token: string) => void;
}

/** Create an API token. The secret is handed to the caller and never kept here. */
export function TokenDialog({ open, onClose, onCreated }: TokenDialogProps) {
  const { t } = useTranslation();
  const utils = trpc.useUtils();
  const create = trpc.tokens.create.useMutation();

  const [name, setName] = useState("");
  const [scope, setScope] = useState<"manage" | "admin">("manage");
  const [expiresInDays, setExpiresInDays] = useState<number | null>(DEFAULT_EXPIRY_DAYS);
  const [error, setError] = useState("");

  const reset = () => {
    setName("");
    setScope("manage");
    setExpiresInDays(DEFAULT_EXPIRY_DAYS);
    setError("");
    onClose();
  };

  const handleCreate = async () => {
    setError("");
    if (!name.trim()) return;
    try {
      const created = await create.mutateAsync({ name: name.trim(), scope, expiresInDays });
      await utils.tokens.list.invalidate();
      reset();
      onCreated(created.token);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <Dialog open={open} onClose={reset} maxWidth="sm" fullWidth slotProps={{ paper: { sx: styles.paper } }}>
      <DialogTitle sx={styles.title}>{t("tokens.createTitle")}</DialogTitle>
      <DialogContent sx={styles.content}>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        <Box sx={styles.form}>
          <TextField
            label={t("tokens.name")}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("tokens.namePlaceholder")}
            fullWidth
            required
            size="small"
            autoFocus
          />
          <TextField
            select
            label={t("tokens.scope")}
            value={scope}
            onChange={(e) => setScope(e.target.value as "manage" | "admin")}
            fullWidth
            size="small"
            helperText={t(`tokens.scopeHelp.${scope}`)}
          >
            <MenuItem value="manage">{t("tokens.scopes.manage")}</MenuItem>
            <MenuItem value="admin">{t("tokens.scopes.admin")}</MenuItem>
          </TextField>
          <TextField
            select
            label={t("tokens.expiry")}
            value={expiresInDays === null ? "never" : String(expiresInDays)}
            onChange={(e) => setExpiresInDays(e.target.value === "never" ? null : Number(e.target.value))}
            fullWidth
            size="small"
            helperText={expiresInDays === null ? t("tokens.neverWarning") : undefined}
          >
            {EXPIRY_CHOICES.map((days) => (
              <MenuItem key={String(days)} value={days === null ? "never" : String(days)}>
                {days === null ? t("tokens.never") : t("tokens.days", { count: days })}
              </MenuItem>
            ))}
          </TextField>
        </Box>
      </DialogContent>
      <DialogActions sx={styles.actions}>
        <Button onClick={reset} sx={{ color: colors.textSecondary }}>{t("common.cancel")}</Button>
        <Button variant="contained" disabled={create.isPending || !name.trim()} onClick={handleCreate}>
          {t("tokens.create")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

interface SecretRevealDialogProps {
  title: string;
  /** The secret to show once; null keeps the dialog closed. */
  secret: string | null;
  onClose: () => void;
}

/** The one-time reveal of a new secret, after creating or rotating a token. */
export function SecretRevealDialog({ title, secret, onClose }: SecretRevealDialogProps) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    if (secret) await navigator.clipboard.writeText(secret);
    setCopied(true);
  };
  const close = () => {
    setCopied(false);
    onClose();
  };
  return (
    <Dialog open={secret !== null} maxWidth="sm" fullWidth slotProps={{ paper: { sx: styles.paper } }}>
      <DialogTitle sx={styles.title}>{title}</DialogTitle>
      <DialogContent sx={styles.content}>
        <Box sx={styles.form}>
          <Alert severity="warning">{t("tokens.showOnce")}</Alert>
          <Typography component="code" sx={styles.secret}>{secret}</Typography>
          <Button variant="outlined" onClick={copy}>{copied ? t("tokens.copied") : t("tokens.copy")}</Button>
          <Typography variant="body2" sx={{ color: "text.secondary" }}>{t("tokens.plainHttpWarning")}</Typography>
        </Box>
      </DialogContent>
      <DialogActions sx={styles.actions}>
        <Button variant="contained" onClick={close}>{t("tokens.done")}</Button>
      </DialogActions>
    </Dialog>
  );
}

const styles = {
  ...dialogStyles,
  secret: {
    display: "block",
    p: 1.5,
    borderRadius: 2,
    fontFamily: "monospace",
    fontSize: "0.85rem",
    wordBreak: "break-all" as const,
    backgroundColor: "rgba(255,255,255,0.06)",
    userSelect: "all" as const,
  },
};
