import { useState } from "react";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import Tabs from "@mui/material/Tabs";
import Tab from "@mui/material/Tab";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import IconButton from "@mui/material/IconButton";
import CloseIcon from "@mui/icons-material/Close";
import { useTranslation } from "react-i18next";
import { trpc } from "../../lib/trpc";
import { useStore } from "../../hooks/useStore";
import { colors } from "../../app/theme";
import { dialogStyles } from "./styles";
import { useInstallPhase } from "../../hooks/useInstallPhase";
import { CustomAppFields, EMPTY_CUSTOM_APP, type CustomAppValues } from "./CustomAppFields";

/** The mutation input for a custom Docker app, from its form values. */
export function toInstallInput(values: CustomAppValues) {
  return {
    name: values.name.trim(),
    image: values.image.trim() || undefined,
    composeYaml: values.composeYaml.trim() || undefined,
    containerPort: parseInt(values.port, 10),
    path: values.path.trim() || undefined,
    icon: values.icon.trim() || undefined,
    allowPrivileged: values.allowPrivileged,
    ownAuth: values.ownAuth,
  };
}

/** A user-facing reason the form cannot be submitted, or undefined when it can. */
export function validateCustomApp(values: CustomAppValues): string | undefined {
  const port = parseInt(values.port, 10);
  if (isNaN(port) || port < 1 || port > 65535) return "Invalid port number (1-65535)";
  if (!values.image.trim() && !values.composeYaml.trim()) return "Provide a Docker image or compose YAML";
  return undefined;
}

export function AddCustomAppDialog() {
  const { t } = useTranslation();
  const open = useStore((s) => s.customAppDialogOpen);
  const close = useStore((s) => s.closeCustomAppDialog);
  const utils = trpc.useUtils();

  const [tab, setTab] = useState(0);
  const [error, setError] = useState("");
  const defaultExt = { name: "", url: "", icon: "" };
  const [docker, setDocker] = useState<CustomAppValues>(EMPTY_CUSTOM_APP);
  const [ext, setExt] = useState(defaultExt);

  const installDocker = trpc.apps.custom.installDocker.useMutation();
  const addExternal = trpc.apps.custom.addExternal.useMutation();
  const installPhase = useInstallPhase(installDocker.isPending);

  const updateExt = (field: keyof typeof defaultExt, value: string) =>
    setExt((prev) => ({ ...prev, [field]: value }));

  const handleClose = () => {
    setDocker(EMPTY_CUSTOM_APP);
    setExt(defaultExt);
    setError("");
    setTab(0);
    close();
  };

  const handleSubmitDocker = async () => {
    setError("");
    if (!docker.name.trim()) return;
    const problem = validateCustomApp(docker);
    if (problem) return setError(problem);

    try {
      await installDocker.mutateAsync(toInstallInput(docker));
      await utils.apps.installed.invalidate();
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleSubmitExternal = async () => {
    setError("");
    if (!ext.name.trim() || !ext.url.trim()) return;

    try {
      await addExternal.mutateAsync({
        name: ext.name.trim(),
        url: ext.url.trim(),
        icon: ext.icon.trim() || undefined,
      });
      await utils.apps.installed.invalidate();
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const isSubmitting = installDocker.isPending || addExternal.isPending;

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth={false}
      slotProps={{ paper: { sx: styles.paper } }}
    >
      <DialogTitle sx={styles.title}>
        {t("customApp.title")}
        <IconButton onClick={handleClose} sx={styles.closeBtn}>
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>

      <Tabs
        value={tab}
        onChange={(_, v) => { setTab(v); setError(""); }}
        sx={styles.tabs}
      >
        <Tab label={t("customApp.tabDocker")} />
        <Tab label={t("customApp.tabExternal")} />
      </Tabs>

      <DialogContent sx={styles.content}>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}
        {installPhase && (
          <Alert severity="info" sx={{ mb: 2 }}>
            {installPhase}
          </Alert>
        )}

        <Box>
          <Box sx={{ ...styles.form, ...(tab !== 0 && styles.hiddenTab) }} aria-hidden={tab !== 0}>
            <CustomAppFields values={docker} onChange={setDocker} nameEditable />
          </Box>

          <Box sx={{ ...styles.form, ...(tab !== 1 && styles.hiddenTab) }} aria-hidden={tab !== 1}>
            <TextField
              label={t("customApp.name")}
              value={ext.name}
              onChange={(e) => updateExt("name", e.target.value)}
              fullWidth
              required
              size="small"
            />
            <TextField
              label={t("customApp.url")}
              value={ext.url}
              onChange={(e) => updateExt("url", e.target.value)}
              fullWidth
              required
              size="small"
              placeholder="http://192.168.1.50:8080"
            />
            <TextField
              label={t("customApp.icon")}
              value={ext.icon}
              onChange={(e) => updateExt("icon", e.target.value)}
              fullWidth
              size="small"
              placeholder="https://example.com/icon.png"
            />
          </Box>
        </Box>
      </DialogContent>

      <DialogActions sx={styles.actions}>
        <Button onClick={handleClose} sx={{ color: colors.textSecondary }}>
          {t("common.cancel")}
        </Button>
        <Button
          variant="contained"
          disabled={isSubmitting}
          onClick={tab === 0 ? handleSubmitDocker : handleSubmitExternal}
        >
          {isSubmitting ? t("customApp.adding") : t("customApp.add")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

const styles = {
  ...dialogStyles,
  title: {
    ...dialogStyles.title,
    pb: 0,
  },
  tabs: {
    px: 3,
    "& .MuiTab-root": {
      textTransform: "none",
      color: colors.textSecondary,
      "&.Mui-selected": { color: colors.primary },
    },
    "& .MuiTabs-indicator": {
      backgroundColor: colors.primary,
    },
  },
  hiddenTab: {
    display: "none" as const,
  },
};
