import { useMemo, useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import FormControlLabel from "@mui/material/FormControlLabel";
import MenuItem from "@mui/material/MenuItem";
import Switch from "@mui/material/Switch";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useTranslation } from "react-i18next";
import { trpc } from "../../../../lib/trpc";
import { useAppNames } from "../../../../hooks/useAppNames";
import { dayLabel, groupByAgent, groupByDay } from "../../../../lib/activity";
import type { AuditEntry, AuditOutcome } from "../../../../lib/router-types";
import { NeedsYou } from "./NeedsYou";
import { ActivityRows } from "./ActivityRows";
import { ActivityDetailDialog } from "./ActivityDetailDialog";
import { OUTCOMES, OUTCOME_COLOR } from "./outcome";

const RANGES = [1, 7, 30, 90] as const;
const LIMIT = 300;
const REFRESH_MS = 10_000;

interface ActivityPanelProps {
  /** Start filtered to one agent, when arriving from its card. */
  agentId?: string;
  onShowRule: (rule: string) => void;
}

/** What agents did, what was refused and why, and what is waiting for the owner. */
export function ActivityPanel({ agentId, onShowRule }: ActivityPanelProps) {
  const { t } = useTranslation();
  const utils = trpc.useUtils();
  const { names: appNames } = useAppNames();
  const [tokenId, setTokenId] = useState(agentId ?? "");
  const [days, setDays] = useState<number>(7);
  const [outcome, setOutcome] = useState<AuditOutcome | null>(null);
  const [byAgent, setByAgent] = useState(false);
  const [detail, setDetail] = useState<AuditEntry | null>(null);

  const scope = { days, ...(tokenId && { tokenId }) };
  const agents = trpc.tokens.list.useQuery();
  const builtIn = trpc.guardrails.get.useQuery();
  const digest = trpc.tokens.digest.useQuery();
  const counts = trpc.tokens.activityCounts.useQuery(scope, { refetchInterval: REFRESH_MS });
  const activity = trpc.tokens.activity.useQuery(
    { ...scope, limit: LIMIT, ...(outcome && { outcomes: [outcome] }) },
    { refetchInterval: REFRESH_MS },
  );
  const entries = useMemo(() => activity.data ?? [], [activity.data]);
  const byAgentGroups = useMemo(() => (byAgent ? groupByAgent(entries) : []), [entries, byAgent]);
  const byDayGroups = useMemo(() => (byAgent ? [] : groupByDay(entries)), [entries, byAgent]);

  const handleExport = async () => {
    const text = await utils.tokens.exportActivity.fetch();
    const url = URL.createObjectURL(new Blob([text], { type: "application/x-ndjson" }));
    const link = Object.assign(document.createElement("a"), { href: url, download: "tomo-activity.jsonl" });
    link.click();
    URL.revokeObjectURL(url);
  };

  const d = digest.data;
  const change = d && d.previousActions > 0 ? Math.round(((d.actions - d.previousActions) / d.previousActions) * 100) : null;
  const rowProps = { appNames, onOpen: setDetail, onShowRule };

  return (
    <Box sx={styles.root}>
      <NeedsYou builtInRules={(builtIn.data?.builtIn ?? []).map((r) => r.name)} onShowRule={onShowRule} />

      {d && (
        <Typography variant="body2" sx={{ color: "text.secondary" }}>
          {t("activity.digest", { actions: d.actions, refused: d.refused })}
          {change !== null && ` · ${t("activity.digestChange", { change: change > 0 ? `+${change}` : change })}`}
        </Typography>
      )}
      <Box sx={styles.filters}>
        {OUTCOMES.filter((o) => (counts.data?.[o] ?? 0) > 0 || o === outcome).map((o) => (
          <Chip
            key={o}
            size="small"
            variant={outcome === o ? "filled" : "outlined"}
            label={`${t(`tokens.outcome.${o}`)} ${counts.data?.[o] ?? 0}`}
            onClick={() => setOutcome(outcome === o ? null : o)}
            sx={{ color: OUTCOME_COLOR[o], borderColor: OUTCOME_COLOR[o] }}
          />
        ))}
        <Box sx={{ flex: 1 }} />
        <TextField select size="small" value={tokenId} onChange={(e) => setTokenId(e.target.value)} sx={styles.select} slotProps={{ select: { displayEmpty: true } }}>
          <MenuItem value="">{t("activity.allAgents")}</MenuItem>
          {(agents.data ?? []).map((a) => <MenuItem key={a.id} value={a.id}>{a.name}</MenuItem>)}
        </TextField>
        <TextField select size="small" value={days} onChange={(e) => setDays(Number(e.target.value))} sx={styles.select}>
          {RANGES.map((r) => <MenuItem key={r} value={r}>{t(`activity.range.${r}`)}</MenuItem>)}
        </TextField>
      </Box>

      {entries.length === 0 && <Typography variant="body2" sx={{ color: "text.secondary" }}>{t("activity.empty")}</Typography>}
      {byAgent
        ? byAgentGroups.map((group) => (
            <Box key={group.key}>
              <Typography variant="subtitle2" sx={styles.groupTitle}>
                {group.name}
                <Box component="span" sx={styles.groupMeta}>{t("activity.summary", { calls: group.calls, refused: group.refused })}</Box>
              </Typography>
              <ActivityRows entries={group.entries} hideWho {...rowProps} />
            </Box>
          ))
        : byDayGroups.map((group) => (
            <Box key={group.day}>
              <Typography variant="caption" sx={styles.groupTitle}>{dayLabel(group.day, t)}</Typography>
              <ActivityRows entries={group.entries} {...rowProps} />
            </Box>
          ))}

      <Box sx={styles.footer}>
        <FormControlLabel
          control={<Switch size="small" checked={byAgent} onChange={(e) => setByAgent(e.target.checked)} />}
          label={<Typography variant="body2">{t("activity.groupByAgent")}</Typography>}
        />
        <Button size="small" onClick={handleExport}>{t("activity.export")}</Button>
      </Box>
      <ActivityDetailDialog entry={detail} appNames={appNames} onClose={() => setDetail(null)} onShowRule={(rule) => { setDetail(null); onShowRule(rule); }} />
    </Box>
  );
}

const styles = {
  root: { display: "flex", flexDirection: "column" as const, gap: 1.5 },
  filters: { display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" as const },
  select: { minWidth: 140 },
  groupTitle: { display: "block", color: "text.secondary", mt: 0.5 },
  groupMeta: { ml: 1, color: "text.secondary", fontWeight: 400 },
  footer: { display: "flex", alignItems: "center", justifyContent: "space-between" },
};
