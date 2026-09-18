import { useEffect, useState } from "react";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import Box from "@mui/material/Box";
import { useTranslation } from "react-i18next";
import { colors } from "../../../../app/theme";
import { dialogStyles } from "../../../dialogs/styles";

const EDITOR_ROWS = 14;

interface TextFileDialogProps {
  open: boolean;
  title: string;
  intro?: string;
  /** The saved text the editor starts from. */
  value: string;
  monospace?: boolean;
  /** Problems with the current draft; saving is blocked while there are any. */
  problems?: string[];
  pending: boolean;
  onDraft?: (draft: string) => void;
  onSave: (text: string) => void;
  onClose: () => void;
}

/** Edit one of the guardrail files as text: the rules YAML, or the agent instructions. */
export function TextFileDialog({ open, title, intro, value, monospace, problems = [], pending, onDraft, onSave, onClose }: TextFileDialogProps) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState(value);
  useEffect(() => {
    if (open) setDraft(value);
  }, [open, value]);

  const change = (next: string) => {
    setDraft(next);
    onDraft?.(next);
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth slotProps={{ paper: { sx: { ...dialogStyles.paper, width: "min(760px, calc(100vw - 64px))" } } }}>
      <DialogTitle sx={dialogStyles.title}>{title}</DialogTitle>
      <DialogContent sx={dialogStyles.content}>
        <Box sx={dialogStyles.form}>
          {intro && <Typography variant="body2" sx={{ color: "text.secondary" }}>{intro}</Typography>}
          <TextField
            value={draft}
            onChange={(e) => change(e.target.value)}
            multiline
            minRows={EDITOR_ROWS}
            fullWidth
            size="small"
            error={problems.length > 0}
            sx={monospace ? { "& textarea": { fontFamily: "monospace", fontSize: "0.8rem" } } : undefined}
            slotProps={{ htmlInput: { spellCheck: !monospace } }}
          />
          {problems.map((problem) => <Alert key={problem} severity="error">{problem}</Alert>)}
        </Box>
      </DialogContent>
      <DialogActions sx={dialogStyles.actions}>
        <Button onClick={onClose} sx={{ color: colors.textSecondary }}>{t("common.cancel")}</Button>
        <Button variant="contained" disabled={pending || problems.length > 0 || draft === value} onClick={() => onSave(draft)}>{t("common.save")}</Button>
      </DialogActions>
    </Dialog>
  );
}
