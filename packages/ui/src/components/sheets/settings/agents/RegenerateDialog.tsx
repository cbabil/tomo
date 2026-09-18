import { useState } from "react";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { useTranslation } from "react-i18next";
import { colors } from "../../../../app/theme";
import { GRACE_CHOICES_MINUTES } from "../../../../lib/agents";
import { dialogStyles } from "../../../dialogs/styles";

interface RegenerateDialogProps {
  /** The agent's name; null keeps the dialog closed. */
  name: string | null;
  pending: boolean;
  onConfirm: (graceMinutes: number) => void;
  onClose: () => void;
}

/** Issue a new secret and choose how long the old one keeps working. */
export function RegenerateDialog({ name, pending, onConfirm, onClose }: RegenerateDialogProps) {
  const { t } = useTranslation();
  const [grace, setGrace] = useState<number>(GRACE_CHOICES_MINUTES[1]);
  return (
    <Dialog open={name !== null} onClose={onClose} maxWidth="xs" fullWidth slotProps={{ paper: { sx: dialogStyles.paper } }}>
      <DialogTitle sx={dialogStyles.title}>{t("tokens.regenerateTitle", { name })}</DialogTitle>
      <DialogContent sx={dialogStyles.content}>
        <Box sx={dialogStyles.form}>
          <Typography variant="body2" sx={{ color: "text.secondary" }}>{t("tokens.regenerateWarning")}</Typography>
          <TextField select label={t("tokens.grace")} value={grace} onChange={(e) => setGrace(Number(e.target.value))} fullWidth size="small">
            {GRACE_CHOICES_MINUTES.map((m) => <MenuItem key={m} value={m}>{t(`tokens.graceChoices.${m}`)}</MenuItem>)}
          </TextField>
        </Box>
      </DialogContent>
      <DialogActions sx={dialogStyles.actions}>
        <Button onClick={onClose} sx={{ color: colors.textSecondary }}>{t("common.cancel")}</Button>
        <Button variant="contained" disabled={pending} onClick={() => onConfirm(grace)}>{t("tokens.regenerate")}</Button>
      </DialogActions>
    </Dialog>
  );
}
