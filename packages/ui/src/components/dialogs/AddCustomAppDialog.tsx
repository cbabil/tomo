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
import Accordion from "@mui/material/Accordion";
import AccordionSummary from "@mui/material/AccordionSummary";
import AccordionDetails from "@mui/material/AccordionDetails";
import Typography from "@mui/material/Typography";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import IconButton from "@mui/material/IconButton";
import CloseIcon from "@mui/icons-material/Close";
import { useTranslation } from "react-i18next";
import { trpc } from "../../lib/trpc";
import { useStore } from "../../hooks/useStore";
import { colors } from "../../app/theme";
import { dialogStyles } from "./styles";

export function AddCustomAppDialog() {
  const { t } = useTranslation();
  const open = useStore((s) => s.customAppDialogOpen);
  const close = useStore((s) => s.closeCustomAppDialog);
  const utils = trpc.useUtils();

  const [tab, setTab] = useState(0);
  const [error, setError] = useState("");

  const defaultDocker = { name: "", image: "", port: "", icon: "", composeYaml: "" };
  const defaultExt = { name: "", url: "", icon: "" };
  const [docker, setDocker] = useState(defaultDocker);
  const [ext, setExt] = useState(defaultExt);

  const installDocker = trpc.apps.custom.installDocker.useMutation();
  const addExternal = trpc.apps.custom.addExternal.useMutation();

  const updateDocker = (field: keyof typeof defaultDocker, value: string) =>
    setDocker((prev) => ({ ...prev, [field]: value }));
  const updateExt = (field: keyof typeof defaultExt, value: string) =>
    setExt((prev) => ({ ...prev, [field]: value }));

  const resetForm = () => {
    setDocker(defaultDocker);
    setExt(defaultExt);
    setError("");
    setTab(0);
  };

  const handleClose = () => {
    resetForm();
    close();
  };

  const handleSubmitDocker = async () => {
    setError("");
    const port = parseInt(docker.port, 10);
    if (!docker.name.trim()) return;
    if (isNaN(port) || port < 1 || port > 65535) {
      setError("Invalid port number (1-65535)");
      return;
    }
    if (!docker.image.trim() && !docker.composeYaml.trim()) {
      setError("Provide a Docker image or compose YAML");
      return;
    }

    try {
      await installDocker.mutateAsync({
        name: docker.name.trim(),
        image: docker.image.trim() || undefined,
        composeYaml: docker.composeYaml.trim() || undefined,
        containerPort: port,
        icon: docker.icon.trim() || undefined,
      });
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
      maxWidth="sm"
      fullWidth
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

        {tab === 0 && (
          <Box sx={styles.form}>
            <TextField
              label={t("customApp.name")}
              value={docker.name}
              onChange={(e) => updateDocker("name", e.target.value)}
              fullWidth
              required
              size="small"
            />
            <TextField
              label={t("customApp.image")}
              value={docker.image}
              onChange={(e) => updateDocker("image", e.target.value)}
              fullWidth
              size="small"
              placeholder="nginx:latest"
              disabled={Boolean(docker.composeYaml.trim())}
            />
            <TextField
              label={t("customApp.port")}
              value={docker.port}
              onChange={(e) => updateDocker("port", e.target.value)}
              fullWidth
              required
              size="small"
              type="number"
              slotProps={{ htmlInput: { min: 1, max: 65535 } }}
            />
            <TextField
              label={t("customApp.icon")}
              value={docker.icon}
              onChange={(e) => updateDocker("icon", e.target.value)}
              fullWidth
              size="small"
              placeholder="https://example.com/icon.png"
            />
            <Accordion
              sx={styles.accordion}
              disableGutters
              elevation={0}
            >
              <AccordionSummary expandIcon={<ExpandMoreIcon sx={{ color: colors.textSecondary }} />}>
                <Typography variant="body2" sx={{ color: colors.textSecondary }}>
                  {t("customApp.advanced")}
                </Typography>
              </AccordionSummary>
              <AccordionDetails>
                <TextField
                  label={t("customApp.composeYaml")}
                  value={docker.composeYaml}
                  onChange={(e) => updateDocker("composeYaml", e.target.value)}
                  fullWidth
                  multiline
                  rows={6}
                  size="small"
                  placeholder={"services:\n  app:\n    image: nginx:latest"}
                  sx={{ fontFamily: "monospace" }}
                />
              </AccordionDetails>
            </Accordion>
          </Box>
        )}

        {tab === 1 && (
          <Box sx={styles.form}>
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
        )}
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
  accordion: {
    backgroundColor: "transparent",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: "8px !important",
    "&::before": { display: "none" },
  },
};
