import { useState } from "react";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { useTranslation } from "react-i18next";
import { trpc } from "../../../../lib/trpc";
import { colors } from "../../../../app/theme";
import { AGENT_PRESETS, EXPIRY_CHOICES, type AgentPreset, type AgentScope } from "../../../../lib/agents";
import { dialogStyles } from "../../../dialogs/styles";

const DAY_MS = 24 * 60 * 60 * 1000;

interface AddAgentDialogProps {
  open: boolean;
  onClose: () => void;
  /** Called with the new agent and its secret; the caller shows the secret once. */
  onCreated: (agent: { id: string; name: string; secret: string }) => void;
}

/** Add an agent from a preset, with a plain-words summary of what its token allows. */
export function AddAgentDialog({ open, onClose, onCreated }: AddAgentDialogProps) {
  const { t } = useTranslation();
  const create = trpc.tokens.create.useMutation();
  const [preset, setPreset] = useState<AgentPreset>(AGENT_PRESETS[0]);
  const [name, setName] = useState(AGENT_PRESETS[0].defaultName);
  const [scope, setScope] = useState<AgentScope>(AGENT_PRESETS[0].scope);
  const [expiresInDays, setExpiresInDays] = useState<number | null>(AGENT_PRESETS[0].expiresInDays);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");

  const pickPreset = (next: AgentPreset) => {
    setPreset(next);
    setName(next.defaultName);
    setScope(next.scope);
    setExpiresInDays(next.expiresInDays);
  };
  const close = () => {
    pickPreset(AGENT_PRESETS[0]);
    setNote("");
    setError("");
    onClose();
  };
  const handleCreate = async () => {
    setError("");
    try {
      const created = await create.mutateAsync({ name: name.trim(), scope, expiresInDays, ...(note.trim() && { note: note.trim() }) });
      close();
      onCreated({ id: created.record.id, name: name.trim(), secret: created.token });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const expiryText =
    expiresInDays === null
      ? t("tokens.summaryNever")
      : t("tokens.summaryExpires", { date: new Date(Date.now() + expiresInDays * DAY_MS).toLocaleDateString() });

  return (
    <Dialog open={open} onClose={close} maxWidth="sm" fullWidth slotProps={{ paper: { sx: dialogStyles.paper } }}>
      <DialogTitle sx={dialogStyles.title}>{t("tokens.addTitle")}</DialogTitle>
      <DialogContent sx={dialogStyles.content}>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        <Box sx={dialogStyles.form}>
          <TextField
            select
            label={t("tokens.preset")}
            value={preset.key}
            onChange={(e) => pickPreset(AGENT_PRESETS.find((p) => p.key === e.target.value) ?? AGENT_PRESETS[0])}
            fullWidth
            size="small"
            helperText={t(`tokens.presets.${preset.key}.help`)}
          >
            {AGENT_PRESETS.map((p) => <MenuItem key={p.key} value={p.key}>{t(`tokens.presets.${p.key}.label`)}</MenuItem>)}
          </TextField>
          <TextField label={t("tokens.name")} value={name} onChange={(e) => setName(e.target.value)} placeholder={t("tokens.namePlaceholder")} fullWidth required size="small" />
          {preset.key === "custom" && (
            <>
              <TextField select label={t("tokens.scope")} value={scope} onChange={(e) => setScope(e.target.value as AgentScope)} fullWidth size="small">
                <MenuItem value="manage">{t("tokens.scopes.manage")}</MenuItem>
                <MenuItem value="admin">{t("tokens.scopes.admin")}</MenuItem>
              </TextField>
              <TextField
                select
                label={t("tokens.expiry")}
                value={expiresInDays === null ? "never" : String(expiresInDays)}
                onChange={(e) => setExpiresInDays(e.target.value === "never" ? null : Number(e.target.value))}
                fullWidth
                size="small"
              >
                {EXPIRY_CHOICES.map((days) => (
                  <MenuItem key={String(days)} value={days === null ? "never" : String(days)}>
                    {days === null ? t("tokens.never") : t("tokens.days", { count: days })}
                  </MenuItem>
                ))}
              </TextField>
            </>
          )}
          <TextField label={t("tokens.note")} value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("tokens.notePlaceholder")} fullWidth size="small" />
          <Typography variant="body2" sx={{ color: "text.secondary" }}>
            {t(scope === "admin" ? "tokens.summaryAdmin" : "tokens.summaryManage")} {expiryText}
          </Typography>
        </Box>
      </DialogContent>
      <DialogActions sx={dialogStyles.actions}>
        <Button onClick={close} sx={{ color: colors.textSecondary }}>{t("common.cancel")}</Button>
        <Button variant="contained" disabled={create.isPending || !name.trim()} onClick={handleCreate}>{t("tokens.addAgent")}</Button>
      </DialogActions>
    </Dialog>
  );
}
