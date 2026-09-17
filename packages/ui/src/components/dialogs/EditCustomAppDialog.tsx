import { useState, useEffect } from "react";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import IconButton from "@mui/material/IconButton";
import CloseIcon from "@mui/icons-material/Close";
import { useTranslation } from "react-i18next";
import { trpc } from "../../lib/trpc";
import { useStore } from "../../hooks/useStore";
import { colors } from "../../app/theme";
import { dialogStyles } from "./styles";

/** Edit where a custom or template app opens, and its icon, without reinstalling. */
export function EditCustomAppDialog() {
  const { t } = useTranslation();
  const editingApp = useStore((s) => s.editingCustomApp);
  const close = useStore((s) => s.closeEditCustomApp);
  const utils = trpc.useUtils();

  const [path, setPath] = useState("");
  const [icon, setIcon] = useState("");
  const [error, setError] = useState("");

  const updateApp = trpc.apps.custom.updateApp.useMutation();

  useEffect(() => {
    if (editingApp) {
      setPath(editingApp.path ?? "");
      setIcon(editingApp.icon ?? "");
      setError("");
    }
  }, [editingApp]);

  const handleSubmit = async () => {
    if (!editingApp) return;
    setError("");
    try {
      await updateApp.mutateAsync({
        id: editingApp.id,
        path: path.trim() || undefined,
        icon: icon.trim() || undefined,
      });
      await utils.apps.installed.invalidate();
      close();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <Dialog
      open={Boolean(editingApp)}
      onClose={close}
      maxWidth="sm"
      fullWidth
      slotProps={{ paper: { sx: styles.paper } }}
    >
      <DialogTitle sx={styles.title}>
        {t("customApp.editTitle")}: {editingApp?.name}
        <IconButton onClick={close} sx={styles.closeBtn}>
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>

      <DialogContent sx={styles.content}>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}
        <Box sx={styles.form}>
          <TextField
            label={t("customApp.openPath")}
            value={path}
            onChange={(e) => setPath(e.target.value)}
            fullWidth
            size="small"
            placeholder="/ui"
            helperText={t("customApp.openPathHelp")}
          />
          <TextField
            label={t("customApp.icon")}
            value={icon}
            onChange={(e) => setIcon(e.target.value)}
            fullWidth
            size="small"
            placeholder="https://example.com/icon.png"
          />
        </Box>
      </DialogContent>

      <DialogActions sx={styles.actions}>
        <Button onClick={close} sx={{ color: colors.textSecondary }}>
          {t("common.cancel")}
        </Button>
        <Button variant="contained" disabled={updateApp.isPending} onClick={handleSubmit}>
          {t("common.save")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

const styles = dialogStyles;
