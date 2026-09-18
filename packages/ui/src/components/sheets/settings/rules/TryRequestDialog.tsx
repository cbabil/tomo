import { useState } from "react";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { useTranslation } from "react-i18next";
import { trpc } from "../../../../lib/trpc";
import { useDebounce } from "../../../../hooks/useDebounce";
import { useTools } from "../../../../hooks/useTools";
import type { RuleEffect } from "../../../../lib/router-types";
import { dialogStyles } from "../../../dialogs/styles";

const SEVERITY: Record<RuleEffect, "success" | "error" | "info" | "warning"> = {
  allow: "success",
  deny: "error",
  agent_confirm: "info",
  human_confirm: "warning",
};

/** Local date and time in the form a datetime-local input wants. */
const localNow = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};

interface TryRequestDialogProps {
  open: boolean;
  apps: Array<{ id: string; name: string }>;
  onClose: () => void;
  /** Jump to the rule that decided the request. */
  onShowRule: (rule: string) => void;
}

/** Ask the rules what they would decide for a call, without an agent. */
export function TryRequestDialog({ open, apps, onClose, onShowRule }: TryRequestDialogProps) {
  const { t } = useTranslation();
  const { tools } = useTools();
  const [tool, setTool] = useState("apps.restart");
  const [appId, setAppId] = useState("");
  const [at, setAt] = useState(localNow);
  const checkedAt = useDebounce(at, 400);
  const result = trpc.guardrails.try.useQuery({ tool, ...(appId && { appId }), at: checkedAt }, { enabled: open });
  const decision = result.data;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth slotProps={{ paper: { sx: dialogStyles.paper } }}>
      <DialogTitle sx={dialogStyles.title}>{t("rules.try.title")}</DialogTitle>
      <DialogContent sx={dialogStyles.content}>
        <Box sx={dialogStyles.form}>
          <Typography variant="body2" sx={{ color: "text.secondary" }}>{t("rules.try.intro")}</Typography>
          <TextField select label={t("rules.try.action")} value={tool} onChange={(e) => setTool(e.target.value)} fullWidth size="small">
            {(tools.length > 0 ? tools : [{ name: tool }]).map((item) => <MenuItem key={item.name} value={item.name}>{item.name}</MenuItem>)}
          </TextField>
          <TextField select label={t("rules.try.app")} value={appId} onChange={(e) => setAppId(e.target.value)} fullWidth size="small">
            <MenuItem value="">{t("rules.sentence.anyApp")}</MenuItem>
            {apps.map((app) => <MenuItem key={app.id} value={app.id}>{app.name}</MenuItem>)}
          </TextField>
          <TextField type="datetime-local" label={t("rules.try.at")} value={at} onChange={(e) => setAt(e.target.value)} fullWidth size="small" slotProps={{ inputLabel: { shrink: true } }} />
          {decision && (
            <Alert
              severity={SEVERITY[decision.effect]}
              action={decision.rule ? <Button size="small" onClick={() => onShowRule(decision.rule ?? "")}>{t("activity.showRule")}</Button> : undefined}
            >
              {t(`rules.try.result.${decision.effect}`)}
              {". "}
              {decision.observed
                ? t("rules.try.observed", { rule: decision.rule, effect: t(`rules.try.result.${decision.observed}`) })
                : decision.rule
                  ? t("rules.try.byRule", { rule: decision.rule })
                  : t("rules.try.noRule")}
            </Alert>
          )}
        </Box>
      </DialogContent>
      <DialogActions sx={dialogStyles.actions}>
        <Button variant="contained" onClick={onClose}>{t("tokens.done")}</Button>
      </DialogActions>
    </Dialog>
  );
}
