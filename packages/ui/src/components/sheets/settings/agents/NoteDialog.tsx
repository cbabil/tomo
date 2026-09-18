import { useEffect, useState } from "react";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import { useTranslation } from "react-i18next";
import { colors } from "../../../../app/theme";
import { dialogStyles } from "../../../dialogs/styles";

const MAX_NOTE = 200;

interface NoteDialogProps {
  /** The agent being annotated; null keeps the dialog closed. */
  agent: { name: string; note?: string } | null;
  pending: boolean;
  onSave: (note: string) => void;
  onClose: () => void;
}

/** A free-text note per agent: where its secret is kept, or what uses it. */
export function NoteDialog({ agent, pending, onSave, onClose }: NoteDialogProps) {
  const { t } = useTranslation();
  const [note, setNote] = useState("");
  useEffect(() => setNote(agent?.note ?? ""), [agent]);
  return (
    <Dialog open={agent !== null} onClose={onClose} maxWidth="xs" fullWidth slotProps={{ paper: { sx: dialogStyles.paper } }}>
      <DialogTitle sx={dialogStyles.title}>{t("tokens.editNoteTitle", { name: agent?.name })}</DialogTitle>
      <DialogContent sx={dialogStyles.content}>
        <TextField
          value={note}
          onChange={(e) => setNote(e.target.value.slice(0, MAX_NOTE))}
          placeholder={t("tokens.notePlaceholder")}
          fullWidth
          multiline
          minRows={2}
          size="small"
          autoFocus
          sx={{ mt: 1 }}
        />
      </DialogContent>
      <DialogActions sx={dialogStyles.actions}>
        <Button onClick={onClose} sx={{ color: colors.textSecondary }}>{t("common.cancel")}</Button>
        <Button variant="contained" disabled={pending} onClick={() => onSave(note.trim())}>{t("common.save")}</Button>
      </DialogActions>
    </Dialog>
  );
}
