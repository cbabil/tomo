import { useState, useEffect } from "react";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import Button from "@mui/material/Button";
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
import { toInstallInput, validateCustomApp } from "./AddCustomAppDialog";
import type { CustomSource } from "../../types";

/** Form values for an installed app, from what the server knows about it. */
function valuesFrom(app: {
  name: string;
  path?: string;
  icon?: string;
  ownAuth?: boolean;
  source?: CustomSource;
}): CustomAppValues {
  return {
    ...EMPTY_CUSTOM_APP,
    name: app.name,
    path: app.path ?? "",
    icon: app.icon ?? "",
    ownAuth: app.ownAuth ?? false,
    image: app.source?.image ?? "",
    composeYaml: app.source?.composeYaml ?? "",
    port: app.source ? String(app.source.containerPort) : "",
    allowPrivileged: app.source?.allowPrivileged ?? false,
  };
}

/** Normalise a source the way the install input does, so unchanged values compare equal. */
function normalizeSource(source: CustomSource) {
  return {
    image: source.image?.trim() || undefined,
    composeYaml: source.composeYaml?.trim() || undefined,
    containerPort: source.containerPort,
    allowPrivileged: Boolean(source.allowPrivileged),
  };
}

/** True when the image, port, YAML, or privileged setting changed: those need a redeploy. */
function sourceChanged(before: CustomSource | undefined, values: CustomAppValues): boolean {
  if (!before) return false;
  const input = toInstallInput(values);
  const next = normalizeSource(input);
  const prev = normalizeSource(before);
  return (
    next.image !== prev.image ||
    next.composeYaml !== prev.composeYaml ||
    next.containerPort !== prev.containerPort ||
    next.allowPrivileged !== prev.allowPrivileged
  );
}

/**
 * Edit an installed custom or template app. Presentation changes apply at
 * once; source changes (custom apps only) redeploy the app, keeping its data.
 */
export function EditCustomAppDialog() {
  const { t } = useTranslation();
  const editingApp = useStore((s) => s.editingCustomApp);
  const close = useStore((s) => s.closeEditCustomApp);
  const utils = trpc.useUtils();

  const [values, setValues] = useState<CustomAppValues>(EMPTY_CUSTOM_APP);
  const [error, setError] = useState("");

  const updateApp = trpc.apps.custom.updateApp.useMutation();
  const redeploying = sourceChanged(editingApp?.source, values);
  const phase = useInstallPhase(updateApp.isPending && redeploying, editingApp?.id);

  useEffect(() => {
    if (editingApp) {
      setValues(valuesFrom(editingApp));
      setError("");
    }
  }, [editingApp]);

  const isCustom = editingApp?.type === "custom";

  const handleSubmit = async () => {
    if (!editingApp) return;
    setError("");
    if (redeploying) {
      const problem = validateCustomApp(values);
      if (problem) return setError(problem);
    }
    const input = toInstallInput(values);
    try {
      await updateApp.mutateAsync({
        id: editingApp.id,
        path: input.path,
        icon: input.icon,
        ownAuth: input.ownAuth,
        ...(redeploying && {
          source: {
            image: input.image,
            composeYaml: input.composeYaml,
            containerPort: input.containerPort,
            allowPrivileged: input.allowPrivileged,
          },
        }),
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
      onClose={updateApp.isPending ? undefined : close}
      maxWidth="sm"
      fullWidth
      slotProps={{ paper: { sx: styles.paper } }}
    >
      <DialogTitle sx={styles.title}>
        {t("customApp.editTitle")}: {editingApp?.name}
        <IconButton onClick={close} sx={styles.closeBtn} disabled={updateApp.isPending}>
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>

      <DialogContent sx={styles.content}>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}
        {phase && (
          <Alert severity="info" sx={{ mb: 2 }}>
            {phase}
          </Alert>
        )}
        <Box sx={styles.form}>
          {isCustom && <Alert severity="info">{t("customApp.redeployNote")}</Alert>}
          <CustomAppFields
            values={values}
            onChange={setValues}
            nameEditable={false}
            sourceEditable={isCustom}
          />
        </Box>
      </DialogContent>

      <DialogActions sx={styles.actions}>
        <Button onClick={close} disabled={updateApp.isPending} sx={{ color: colors.textSecondary }}>
          {t("common.cancel")}
        </Button>
        <Button variant="contained" disabled={updateApp.isPending} onClick={handleSubmit}>
          {redeploying ? t("customApp.saveRedeploy") : t("common.save")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

const styles = dialogStyles;
