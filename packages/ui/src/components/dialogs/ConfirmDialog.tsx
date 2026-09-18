import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import { useTranslation } from "react-i18next";
import { colors } from "../../app/theme";
import { dialogStyles } from "./styles";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  /** Style the confirm button as a destructive action. */
  destructive?: boolean;
  pending?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

/** Asks the user to confirm an action that is hard to undo. */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  destructive = false,
  pending = false,
  onConfirm,
  onClose,
}: ConfirmDialogProps) {
  const { t } = useTranslation();
  return (
    <Dialog
      open={open}
      onClose={pending ? undefined : onClose}
      maxWidth="xs"
      fullWidth
      slotProps={{ paper: { sx: dialogStyles.paper } }}
    >
      <DialogTitle sx={dialogStyles.title}>{title}</DialogTitle>
      <DialogContent sx={dialogStyles.content}>
        <Typography variant="body2" sx={{ color: "text.secondary" }}>
          {message}
        </Typography>
      </DialogContent>
      <DialogActions sx={dialogStyles.actions}>
        <Button onClick={onClose} disabled={pending} sx={{ color: colors.textSecondary }}>
          {t("common.cancel")}
        </Button>
        <Button
          variant="contained"
          color={destructive ? "error" : "primary"}
          disabled={pending}
          onClick={onConfirm}
        >
          {confirmLabel}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
