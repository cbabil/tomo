import { useEffect, useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import Alert from "@mui/material/Alert";
import LockIcon from "@mui/icons-material/Lock";
import { useTranslation } from "react-i18next";
import { trpc } from "../../../lib/trpc";
import { useDebounce } from "../../../hooks/useDebounce";
import { listRowSx } from "./listRow";

const CHECK_DEBOUNCE_MS = 500;
const EDITOR_ROWS = 12;

/**
 * Guardrails: the rules Tomo ships with, locked, and the owner's own rules
 * and agent instructions, editable. Rules are enforced; instructions are
 * advice the agent reads at the start of each session.
 */
export function GuardrailsSection() {
  const { t } = useTranslation();
  const utils = trpc.useUtils();
  const current = trpc.guardrails.get.useQuery();
  const save = trpc.guardrails.save.useMutation();

  const [rulesYaml, setRulesYaml] = useState("");
  const [instructions, setInstructions] = useState("");
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (current.data) {
      setRulesYaml(current.data.rulesYaml);
      setInstructions(current.data.instructions);
    }
  }, [current.data]);

  const draft = useDebounce(rulesYaml, CHECK_DEBOUNCE_MS);
  const draftIsSaved = draft === current.data?.rulesYaml;
  const check = trpc.guardrails.check.useQuery({ rulesYaml: draft }, { enabled: !draftIsSaved });
  const view = draftIsSaved ? current.data : check.data;
  const problems = draftIsSaved ? [] : (check.data?.errors ?? []);
  const shadowed = view?.shadowed ?? [];
  const rulesChanged = rulesYaml !== current.data?.rulesYaml;
  const instructionsChanged = instructions !== current.data?.instructions;
  const dirty = rulesChanged || instructionsChanged;

  const handleSave = async () => {
    setError("");
    setSaved(false);
    try {
      await save.mutateAsync({
        ...(rulesChanged && { rulesYaml }),
        ...(instructionsChanged && { instructions }),
      });
      await utils.guardrails.get.invalidate();
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <Box sx={styles.root}>
      <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>{t("guardrails.builtInTitle")}</Typography>
      <Typography variant="body2" sx={{ color: "text.secondary" }}>{t("guardrails.builtInIntro")}</Typography>
      <Box sx={styles.list}>
        {(current.data?.builtIn ?? []).map((rule) => (
          <Box key={rule.name} sx={listRowSx}>
            <LockIcon sx={{ fontSize: 16, color: "text.secondary" }} />
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="body2" sx={{ fontWeight: 500 }}>{t(`guardrails.effects.${rule.effect}`)}: {rule.tools.join(", ")}</Typography>
              {rule.message && <Typography variant="caption" sx={{ color: "text.secondary" }}>{rule.message}</Typography>}
            </Box>
            <Chip size="small" variant="outlined" label={rule.name} />
          </Box>
        ))}
      </Box>

      <Typography variant="subtitle1" sx={{ fontWeight: 600, mt: 2 }}>{t("guardrails.rulesTitle")}</Typography>
      <Typography variant="body2" sx={{ color: "text.secondary" }}>{t("guardrails.rulesIntro")}</Typography>
      <TextField
        value={rulesYaml}
        onChange={(e) => setRulesYaml(e.target.value)}
        multiline
        minRows={EDITOR_ROWS}
        fullWidth
        size="small"
        error={problems.length > 0}
        sx={styles.editor}
        slotProps={{ htmlInput: { spellCheck: false } }}
      />
      {problems.map((problem) => <Alert key={problem} severity="error">{problem}</Alert>)}
      {shadowed.map((s) => (
        <Alert key={s.rule} severity="warning">{t("guardrails.shadowed", { rule: s.rule, by: s.by })}</Alert>
      ))}

      <Typography variant="subtitle1" sx={{ fontWeight: 600, mt: 2 }}>{t("guardrails.instructionsTitle")}</Typography>
      <Typography variant="body2" sx={{ color: "text.secondary" }}>{t("guardrails.instructionsIntro")}</Typography>
      <TextField
        value={instructions}
        onChange={(e) => setInstructions(e.target.value)}
        multiline
        minRows={6}
        fullWidth
        size="small"
        sx={styles.editor}
      />

      {error && <Alert severity="error">{error}</Alert>}
      {saved && !dirty && <Alert severity="success">{t("guardrails.saved")}</Alert>}
      <Box sx={styles.actions}>
        <Button
          variant="contained"
          size="small"
          disabled={!dirty || problems.length > 0 || save.isPending}
          onClick={handleSave}
        >
          {t("common.save")}
        </Button>
      </Box>
    </Box>
  );
}

const styles = {
  root: { display: "flex", flexDirection: "column" as const, gap: 1.5 },
  list: { display: "flex", flexDirection: "column" as const, gap: 1 },
  editor: { "& textarea": { fontFamily: "monospace", fontSize: "0.8rem" } },
  actions: { display: "flex", justifyContent: "flex-end" },
};
