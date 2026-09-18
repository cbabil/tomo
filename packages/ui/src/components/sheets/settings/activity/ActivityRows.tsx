import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { useTranslation } from "react-i18next";
import { useTools } from "../../../../hooks/useTools";
import { colors } from "../../../../app/theme";
import { describeEntry } from "../../../../lib/activity";
import type { AuditEntry } from "../../../../lib/router-types";
import { OUTCOME_COLOR } from "./outcome";

interface ActivityRowsProps {
  entries: AuditEntry[];
  appNames: Record<string, string>;
  /** Leave the caller's name out when the rows already sit under it. */
  hideWho?: boolean;
  onOpen: (entry: AuditEntry) => void;
  onShowRule: (rule: string) => void;
}

/** Timeline rows: time, a dot for the outcome, what happened, who, and the rule when one decided it. */
export function ActivityRows({ entries, appNames, hideWho, onOpen, onShowRule }: ActivityRowsProps) {
  const { t } = useTranslation();
  const { takesApp } = useTools();
  return (
    <Box>
      {entries.map((entry, index) => (
        <Box key={`${entry.time}-${index}`} sx={styles.row} onClick={() => onOpen(entry)}>
          <Typography variant="caption" sx={styles.time}>
            {new Date(entry.time).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
          </Typography>
          <Box sx={[styles.dot, { backgroundColor: OUTCOME_COLOR[entry.outcome] }]} />
          <Typography variant="body2" sx={styles.what}>
            {describeEntry(entry, t, appNames, takesApp)}
            <Box component="span" sx={{ color: "text.secondary" }}>
              {!hideWho && ` · ${entry.principal.name}`}
              {entry.outcome !== "ok" && ` · ${t(`tokens.outcome.${entry.outcome}`)}`}
            </Box>
          </Typography>
          {entry.rule && (
            <Typography
              variant="caption"
              sx={styles.rule}
              onClick={(e) => {
                e.stopPropagation();
                onShowRule(entry.rule ?? "");
              }}
            >
              {t("activity.rule", { rule: entry.rule })}
            </Typography>
          )}
        </Box>
      ))}
    </Box>
  );
}

const styles = {
  row: {
    display: "flex",
    alignItems: "center",
    gap: 1.25,
    px: 0.5,
    py: 0.75,
    borderBottom: 1,
    borderColor: "divider",
    cursor: "pointer",
    "&:hover": { backgroundColor: colors.subtle },
  },
  time: { color: "text.secondary", width: 64, flexShrink: 0, whiteSpace: "nowrap" as const },
  dot: { width: 8, height: 8, borderRadius: "50%", flexShrink: 0 },
  what: { flex: 1, minWidth: 0 },
  rule: { color: colors.iconHover, flexShrink: 0 },
};
