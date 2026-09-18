import { useEffect, useState } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import ListItemText from "@mui/material/ListItemText";
import Typography from "@mui/material/Typography";
import { useTranslation } from "react-i18next";
import { trpc } from "../../../../lib/trpc";
import { useAppNames } from "../../../../hooks/useAppNames";
import { useDebounce } from "../../../../hooks/useDebounce";
import { useAsyncAction } from "../../../../hooks/useAsyncAction";
import type { OwnerRule } from "../../../../lib/router-types";
import { BLANK_RULE, RULE_PRESETS, move, ruleName, type RulePresetKey } from "../../../../lib/rules";
import { RuleCard, type RuleAction } from "./RuleCard";
import { RuleDialog } from "./RuleDialog";
import { TryRequestDialog } from "./TryRequestDialog";
import { TextFileDialog } from "./TextFileDialog";

const CHECK_DEBOUNCE_MS = 500;
type TextFile = "yaml" | "instructions";

interface RulesPanelProps {
  /** A rule to scroll to and outline, when arriving from the activity list. */
  highlight?: string;
}

/** Built-in rules, locked, then the owner's rules in order, edited as sentences or as YAML. */
export function RulesPanel({ highlight }: RulesPanelProps) {
  const { t } = useTranslation();
  const utils = trpc.useUtils();
  const current = trpc.guardrails.get.useQuery();
  const saveRules = trpc.guardrails.saveRules.useMutation();
  const saveText = trpc.guardrails.save.useMutation();
  const { options: apps, names: appNames } = useAppNames();

  const [editing, setEditing] = useState<{ rule: OwnerRule; index: number | null } | null>(null);
  const [addAnchor, setAddAnchor] = useState<HTMLElement | null>(null);
  const [trying, setTrying] = useState(false);
  const [textFile, setTextFile] = useState<TextFile | null>(null);
  const [yamlDraft, setYamlDraft] = useState("");
  const [focus, setFocus] = useState(highlight);

  const checkedDraft = useDebounce(yamlDraft, CHECK_DEBOUNCE_MS);
  const check = trpc.guardrails.check.useQuery({ rulesYaml: checkedDraft }, { enabled: textFile === "yaml" && checkedDraft !== "" });

  useEffect(() => {
    if (focus) document.getElementById(`rule-${focus}`)?.scrollIntoView({ block: "center" });
  }, [focus, current.data]);

  const rules = current.data?.rules ?? [];
  const shadowedBy = Object.fromEntries((current.data?.shadowed ?? []).map((s) => [s.rule, s.by]));

  const { error, run } = useAsyncAction(() => utils.guardrails.get.invalidate());
  const persist = (next: OwnerRule[]) => run(() => saveRules.mutateAsync({ rules: next }));

  const handleSaveRule = async (draft: OwnerRule) => {
    if (!editing) return;
    const others = rules.filter((_, i) => i !== editing.index).map((r) => r.name);
    const named = { ...draft, name: ruleName(draft, others) };
    await persist(editing.index === null ? [...rules, named] : rules.map((r, i) => (i === editing.index ? named : r)));
    setEditing(null);
  };
  const handleAction = (index: number, action: RuleAction) => {
    const rule = rules[index];
    if (action === "edit") return setEditing({ rule, index });
    if (action === "duplicate") return setEditing({ rule: { ...rule, name: "" }, index: null });
    if (action === "delete") return void persist(rules.filter((_, i) => i !== index));
    return void persist(move(rules, index, action === "moveUp" ? index - 1 : index + 1));
  };
  const startNew = (rule: OwnerRule) => {
    setAddAnchor(null);
    setEditing({ rule, index: null });
  };
  const handleSaveText = (text: string) =>
    run(async () => {
      await saveText.mutateAsync(textFile === "yaml" ? { rulesYaml: text } : { instructions: text });
      setTextFile(null);
    });

  return (
    <Box sx={styles.root}>
      <Box sx={styles.header}>
        <Typography variant="body2" sx={{ color: "text.secondary", flex: 1 }}>{t("rules.intro")}</Typography>
        <Button size="small" onClick={() => setTrying(true)} sx={{ flexShrink: 0 }}>{t("rules.tryRequest")}</Button>
        <Button variant="contained" size="small" onClick={(e) => setAddAnchor(e.currentTarget)} sx={{ flexShrink: 0 }}>{t("rules.add")}</Button>
      </Box>
      {error && <Alert severity="error">{error}</Alert>}

      <Typography variant="caption" sx={styles.label}>{t("rules.builtIn")}</Typography>
      {(current.data?.builtIn ?? []).map((rule) => (
        <RuleCard key={rule.name} locked appNames={appNames} highlighted={focus === rule.name} rule={{ name: rule.name, match: { tools: rule.tools }, effect: rule.effect }} />
      ))}

      <Typography variant="caption" sx={styles.label}>{t("rules.yours")}</Typography>
      {rules.length === 0 && <Typography variant="body2" sx={{ color: "text.secondary" }}>{t("rules.empty")}</Typography>}
      {rules.map((rule, index) => (
        <RuleCard
          key={rule.name}
          rule={rule}
          appNames={appNames}
          shadowedBy={shadowedBy[rule.name]}
          highlighted={focus === rule.name}
          onToggle={(enabled) => persist(rules.map((r, i) => (i === index ? { ...r, enabled: enabled ? undefined : false } : r)))}
          onAction={(action) => handleAction(index, action)}
        />
      ))}

      <Box sx={styles.footer}>
        <Button size="small" onClick={() => setTextFile("instructions")}>{t("rules.instructions")}</Button>
        <Button size="small" onClick={() => { setYamlDraft(""); setTextFile("yaml"); }}>{t("rules.editYaml")}</Button>
      </Box>

      <Menu anchorEl={addAnchor} open={Boolean(addAnchor)} onClose={() => setAddAnchor(null)}>
        <MenuItem onClick={() => startNew(BLANK_RULE)}>{t("rules.blank")}</MenuItem>
        {(Object.keys(RULE_PRESETS) as RulePresetKey[]).map((key) => (
          <MenuItem key={key} onClick={() => startNew({ ...RULE_PRESETS[key], name: "" })}>
            <ListItemText primary={t(`rules.presets.${key}.label`)} secondary={t(`rules.presets.${key}.help`)} />
          </MenuItem>
        ))}
      </Menu>
      <RuleDialog rule={editing?.rule ?? null} isNew={editing?.index === null} apps={apps} appNames={appNames} pending={saveRules.isPending} onSave={handleSaveRule} onClose={() => setEditing(null)} />
      <TryRequestDialog open={trying} apps={apps} onClose={() => setTrying(false)} onShowRule={(rule) => { setTrying(false); setFocus(rule); }} />
      <TextFileDialog
        open={textFile !== null}
        title={t(textFile === "yaml" ? "rules.yamlTitle" : "rules.instructions")}
        intro={textFile === "instructions" ? t("rules.instructionsIntro") : undefined}
        value={(textFile === "yaml" ? current.data?.rulesYaml : current.data?.instructions) ?? ""}
        monospace={textFile === "yaml"}
        problems={textFile === "yaml" && checkedDraft !== "" ? check.data?.errors : undefined}
        pending={saveText.isPending}
        onDraft={textFile === "yaml" ? setYamlDraft : undefined}
        onSave={handleSaveText}
        onClose={() => setTextFile(null)}
      />
    </Box>
  );
}

const styles = {
  root: { display: "flex", flexDirection: "column" as const, gap: 1 },
  header: { display: "flex", alignItems: "flex-start", gap: 1, mb: 0.5 },
  label: { color: "text.secondary", mt: 1 },
  footer: { display: "flex", justifyContent: "space-between", mt: 1 },
};
