import Typography from "@mui/material/Typography";
import { useTranslation } from "react-i18next";
import type { OwnerRule } from "../../../../lib/router-types";
import { daysSummary } from "../../../../lib/rules";
import { useTools } from "../../../../hooks/useTools";

interface RuleSentenceProps {
  rule: Pick<OwnerRule, "match" | "when" | "effect">;
  /** App names by id, so the sentence says "Nextcloud" rather than an id. */
  appNames?: Record<string, string>;
}

/** A rule in plain words: "When an agent restarts Nextcloud, 22:00-07:00 on weekdays, block it". */
export function RuleSentence({ rule, appNames = {} }: RuleSentenceProps) {
  const { t, i18n } = useTranslation();
  const { takesApp } = useTools();
  const or = new Intl.ListFormat(i18n.language, { type: "disjunction" });
  const and = new Intl.ListFormat(i18n.language, { type: "conjunction" });

  const tools = rule.match.tools;
  const actions = or.format(tools.map((tool) => t(`rules.tools.${tool}`, { defaultValue: tool })));
  const apps = (rule.match.apps ?? []).map((id) => appNames[id] ?? id);
  const direct = tools.every(takesApp);
  const appPart = direct
    ? ` ${apps.length > 0 ? or.format(apps) : t("rules.sentence.anyApp")}`
    : apps.length > 0
      ? ` ${t("rules.sentence.on")} ${or.format(apps)}`
      : "";

  const summary = daysSummary(rule.when?.days);
  const days = Array.isArray(summary) ? and.format(summary.map((d) => t(`rules.days.${d}`))) : t(`rules.sentence.${summary}`);
  const windowPart = rule.when ? `, ${rule.when.hours ?? t("rules.sentence.allDay")} ${days}` : "";

  return (
    <Typography variant="body2" sx={{ flex: 1, minWidth: 0 }}>
      {t("rules.sentence.when")} <b>{actions}{appPart}</b>{windowPart}, <b>{t(`rules.outcomes.${rule.effect}`)}</b>
    </Typography>
  );
}
