import { useState, useCallback, useEffect } from "react";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import Button from "@mui/material/Button";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import IconButton from "@mui/material/IconButton";
import CloseIcon from "@mui/icons-material/Close";
import { useTranslation } from "react-i18next";
import { trpc } from "../../lib/trpc";
import { useStore } from "../../hooks/useStore";
import { colors } from "../../app/theme";
import { CardIcon } from "../ui/CardIcon";
import { SetupFieldInput } from "./SetupFieldInput";
import { dialogStyles } from "./styles";

export function TemplateInstallDialog() {
  const { t } = useTranslation();
  const template = useStore((s) => s.selectedTemplate);
  const close = useStore((s) => s.closeTemplateInstall);
  const utils = trpc.useUtils();

  const [values, setValues] = useState<Record<string, string>>({});
  const [error, setError] = useState("");

  const installMutation = trpc.apps.templates.install.useMutation();

  useEffect(() => {
    if (!template) return;
    const defaults: Record<string, string> = {};
    for (const field of template.setupFields ?? []) {
      if (field.default !== undefined) {
        defaults[field.key] = field.default;
      }
    }
    setValues(defaults);
    setError("");
  }, [template]);

  const updateValue = useCallback((key: string, value: string) => {
    setValues((prev) => ({ ...prev, [key]: value }));
  }, []);

  const handleClose = () => {
    setValues({});
    setError("");
    close();
  };

  const handleInstall = async () => {
    if (!template) return;
    setError("");

    for (const field of fields) {
      if (field.required && field.type !== "boolean" && !values[field.key]?.trim()) {
        setError(t("templates.fieldRequired", { field: field.label }));
        return;
      }
    }

    try {
      await installMutation.mutateAsync({
        templateId: template.id,
        setupValues: values,
      });
      await utils.apps.installed.invalidate();
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  if (!template) return null;

  const fields = template.setupFields ?? [];

  return (
    <Dialog
      open
      onClose={handleClose}
      maxWidth={false}
      slotProps={{ paper: { sx: styles.paper } }}
    >
      <DialogTitle sx={styles.title}>
        {t("templates.setupTitle", { name: template.name })}
        <IconButton onClick={handleClose} sx={styles.closeBtn}>
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>

      <DialogContent sx={styles.content}>
        <Box sx={styles.header}>
          <CardIcon src={template.icon} name={template.name} size={48} />
          <Box>
            <Typography variant="body1" sx={{ fontWeight: 500 }}>
              {template.name}
            </Typography>
            <Typography variant="body2" sx={{ color: colors.textSecondary }}>
              {template.description}
            </Typography>
          </Box>
        </Box>

        {error && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {error}
          </Alert>
        )}

        {fields.length > 0 && (
          <Box sx={styles.form}>
            {fields.map((field) => (
              <SetupFieldInput
                key={field.key}
                field={field}
                value={values[field.key] ?? ""}
                onChange={(v) => updateValue(field.key, v)}
              />
            ))}
          </Box>
        )}
      </DialogContent>

      <DialogActions sx={styles.actions}>
        <Button onClick={handleClose} sx={{ color: colors.textSecondary }}>
          {t("common.cancel")}
        </Button>
        <Button
          variant="contained"
          disabled={installMutation.isPending}
          onClick={handleInstall}
        >
          {installMutation.isPending
            ? t("templates.installing")
            : t("templates.install")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

const styles = {
  ...dialogStyles,
  header: {
    display: "flex",
    gap: 2,
    alignItems: "center",
  },
  form: {
    ...dialogStyles.form,
    mt: 2,
  },
};
