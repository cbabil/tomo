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

export function EditExternalAppDialog() {
  const { t } = useTranslation();
  const editingApp = useStore((s) => s.editingExternalApp);
  const close = useStore((s) => s.closeEditExternalApp);
  const utils = trpc.useUtils();

  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [icon, setIcon] = useState("");
  const [error, setError] = useState("");

  const updateExternal = trpc.apps.custom.updateExternal.useMutation();

  useEffect(() => {
    if (editingApp) {
      setName(editingApp.name);
      setUrl(editingApp.url);
      setIcon(editingApp.icon ?? "");
      setError("");
    }
  }, [editingApp]);

  const handleClose = () => {
    setError("");
    close();
  };

  const handleSubmit = async () => {
    if (!editingApp) return;
    setError("");
    if (!name.trim() || !url.trim()) return;

    try {
      await updateExternal.mutateAsync({
        id: editingApp.id,
        name: name.trim(),
        url: url.trim(),
        icon: icon.trim() || undefined,
      });
      await utils.apps.installed.invalidate();
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <Dialog
      open={Boolean(editingApp)}
      onClose={handleClose}
      maxWidth="sm"
      fullWidth
      slotProps={{ paper: { sx: styles.paper } }}
    >
      <DialogTitle sx={styles.title}>
        {t("customApp.editTitle")}
        <IconButton onClick={handleClose} sx={styles.closeBtn}>
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
            label={t("customApp.name")}
            value={name}
            onChange={(e) => setName(e.target.value)}
            fullWidth
            required
            size="small"
          />
          <TextField
            label={t("customApp.url")}
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            fullWidth
            required
            size="small"
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
        <Button onClick={handleClose} sx={{ color: colors.textSecondary }}>
          {t("common.cancel")}
        </Button>
        <Button
          variant="contained"
          disabled={updateExternal.isPending}
          onClick={handleSubmit}
        >
          {t("common.save")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

const styles = dialogStyles;
