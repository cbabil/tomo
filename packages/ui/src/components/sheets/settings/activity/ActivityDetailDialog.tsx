import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import { useTranslation } from "react-i18next";
import { useTools } from "../../../../hooks/useTools";
import { describeEntry } from "../../../../lib/activity";
import type { AuditEntry } from "../../../../lib/router-types";
import { codeBlockSx, dialogStyles } from "../../../dialogs/styles";
import { OUTCOME_COLOR } from "./outcome";

interface ActivityDetailDialogProps {
  entry: AuditEntry | null;
  appNames: Record<string, string>;
  onClose: () => void;
  onShowRule: (rule: string) => void;
}

/** Everything recorded about one call: who, what, the masked arguments, the outcome, and why. */
export function ActivityDetailDialog({ entry, appNames, onClose, onShowRule }: ActivityDetailDialogProps) {
  const { t } = useTranslation();
  const { takesApp } = useTools();
  const rows: Array<[string, React.ReactNode]> = entry
    ? [
        [t("activity.detail.time"), new Date(entry.time).toLocaleString()],
        [t("activity.detail.who"), `${entry.principal.name}${entry.principal.id ? ` (${entry.principal.id})` : ""}`],
        [t("activity.detail.what"), `${describeEntry(entry, t, appNames, takesApp)} · ${entry.action}`],
        [t("activity.detail.outcome"), <Box component="span" key="o" sx={{ color: OUTCOME_COLOR[entry.outcome], fontWeight: 600 }}>{t(`tokens.outcome.${entry.outcome}`)}</Box>],
        ...(entry.reason ? [[t("activity.detail.reason"), entry.reason] as [string, React.ReactNode]] : []),
      ]
    : [];

  return (
    <Dialog open={entry !== null} onClose={onClose} maxWidth="sm" fullWidth slotProps={{ paper: { sx: dialogStyles.paper } }}>
      <DialogTitle sx={dialogStyles.title}>{t("activity.detail.title")}</DialogTitle>
      <DialogContent sx={dialogStyles.content}>
        <Box sx={dialogStyles.form}>
          {rows.map(([label, value]) => (
            <Box key={label} sx={styles.row}>
              <Typography variant="caption" sx={styles.label}>{label}</Typography>
              <Typography variant="body2" sx={{ flex: 1 }}>{value}</Typography>
            </Box>
          ))}
          {entry?.rule && (
            <Box sx={styles.row}>
              <Typography variant="caption" sx={styles.label}>{t("activity.detail.rule")}</Typography>
              <Button size="small" onClick={() => onShowRule(entry.rule ?? "")}>{entry.rule}</Button>
            </Box>
          )}
          {entry?.args !== undefined && (
            <Box>
              <Typography variant="caption" sx={styles.label}>{t("activity.detail.arguments")}</Typography>
              <Typography component="pre" sx={styles.args}>{JSON.stringify(entry.args, null, 2)}</Typography>
            </Box>
          )}
        </Box>
      </DialogContent>
      <DialogActions sx={dialogStyles.actions}>
        <Button variant="contained" onClick={onClose}>{t("common.close")}</Button>
      </DialogActions>
    </Dialog>
  );
}

const styles = {
  row: { display: "flex", alignItems: "baseline", gap: 2 },
  label: { color: "text.secondary", width: 80, flexShrink: 0 },
  args: { ...codeBlockSx, mt: 0.5, maxHeight: 260 },
};
