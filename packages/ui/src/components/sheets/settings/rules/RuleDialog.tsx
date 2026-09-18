import { useEffect, useState } from "react";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import Autocomplete from "@mui/material/Autocomplete";
import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import Box from "@mui/material/Box";
import { useTranslation } from "react-i18next";
import { colors } from "../../../../app/theme";
import type { OwnerRule, RuleEffect } from "../../../../lib/router-types";
import { BLANK_RULE } from "../../../../lib/rules";
import { ANY_TOOL, useTools } from "../../../../hooks/useTools";
import { dialogStyles } from "../../../dialogs/styles";
import { SwitchWithHelp } from "../../../dialogs/SwitchWithHelp";
import { TimeWindowFields } from "./TimeWindowFields";
import { RuleSentence } from "./RuleSentence";

const EFFECTS: RuleEffect[] = ["human_confirm", "agent_confirm", "deny", "allow"];
const MAX_MESSAGE = 200;

interface RuleDialogProps {
  /** The rule to edit, or a preset to start from; null keeps the dialog closed. */
  rule: OwnerRule | null;
  isNew: boolean;
  apps: Array<{ id: string; name: string }>;
  appNames: Record<string, string>;
  pending: boolean;
  onSave: (rule: OwnerRule) => void;
  onClose: () => void;
}

/** Build a rule from pickers; the sentence at the top shows what it will mean. */
export function RuleDialog({ rule, isNew, apps, appNames, pending, onSave, onClose }: RuleDialogProps) {
  const { t } = useTranslation();
  const { tools, groupOf } = useTools();
  const [draft, setDraft] = useState<OwnerRule>(BLANK_RULE);
  useEffect(() => {
    if (rule) setDraft(rule);
  }, [rule]);

  const patch = (change: Partial<OwnerRule>) => setDraft((d) => ({ ...d, ...change }));
  const valid = draft.match.tools.length > 0;

  return (
    <Dialog open={rule !== null} onClose={onClose} maxWidth="sm" fullWidth slotProps={{ paper: { sx: dialogStyles.paper } }}>
      <DialogTitle sx={dialogStyles.title}>{t(isNew ? "rules.dialog.addTitle" : "rules.dialog.editTitle")}</DialogTitle>
      <DialogContent sx={dialogStyles.content}>
        <Box sx={dialogStyles.form}>
          {valid && <Box sx={styles.preview}><RuleSentence rule={draft} appNames={appNames} /></Box>}
          <Autocomplete
            multiple
            size="small"
            options={[...tools.map((tool) => tool.name), ANY_TOOL]}
            groupBy={(tool) => t(`rules.groups.${groupOf(tool)}`)}
            getOptionLabel={(tool) => t(`rules.tools.${tool}`, { defaultValue: tool })}
            value={draft.match.tools}
            onChange={(_, tools) => patch({ match: { ...draft.match, tools } })}
            renderInput={(params) => (
              <TextField {...params} label={t("rules.dialog.actions")} error={!valid} helperText={valid ? undefined : t("rules.dialog.pickAction")} />
            )}
          />
          <Autocomplete
            multiple
            size="small"
            options={apps.map((a) => a.id)}
            getOptionLabel={(id) => appNames[id] ?? id}
            value={draft.match.apps ?? []}
            onChange={(_, picked) => patch({ match: { ...draft.match, apps: picked.length > 0 ? picked : undefined } })}
            renderInput={(params) => <TextField {...params} label={t("rules.dialog.apps")} helperText={t("rules.dialog.appsHelp")} />}
          />
          <SwitchWithHelp
            checked={draft.when !== undefined}
            onChange={(on) => patch({ when: on ? { hours: "22:00-07:00" } : undefined })}
            label={t("rules.dialog.window")}
          />
          {draft.when && <TimeWindowFields value={draft.when} onChange={(when) => patch({ when })} />}
          <TextField select label={t("rules.dialog.effect")} value={draft.effect} onChange={(e) => patch({ effect: e.target.value as RuleEffect })} fullWidth size="small">
            {EFFECTS.map((effect) => <MenuItem key={effect} value={effect}>{t(`rules.outcomes.${effect}`)}</MenuItem>)}
          </TextField>
          <TextField
            label={t("rules.dialog.message")}
            helperText={t("rules.dialog.messageHelp")}
            value={draft.message ?? ""}
            onChange={(e) => patch({ message: e.target.value.slice(0, MAX_MESSAGE) || undefined })}
            fullWidth
            size="small"
          />
          <SwitchWithHelp
            checked={draft.observe === true}
            onChange={(on) => patch({ observe: on || undefined })}
            label={t("rules.dialog.observe")}
            description={t("rules.dialog.observeHelp")}
          />
        </Box>
      </DialogContent>
      <DialogActions sx={dialogStyles.actions}>
        <Button onClick={onClose} sx={{ color: colors.textSecondary }}>{t("common.cancel")}</Button>
        <Button variant="contained" disabled={!valid || pending} onClick={() => onSave(draft)}>{t("common.save")}</Button>
      </DialogActions>
    </Dialog>
  );
}

const styles = {
  preview: { p: 1.5, borderRadius: 2, backgroundColor: colors.subtle },
};
