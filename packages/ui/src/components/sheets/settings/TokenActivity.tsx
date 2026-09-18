import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { useTranslation } from "react-i18next";
import { trpc } from "../../../lib/trpc";
import { colors } from "../../../app/theme";

const ACTIVITY_LIMIT = 50;
const OUTCOME_COLOR = { ok: colors.success, denied: colors.warning, error: colors.error } as const;

/** The most recent API calls, newest first, as recorded in the audit log. */
export function TokenActivity() {
  const { t } = useTranslation();
  const activity = trpc.tokens.activity.useQuery({ limit: ACTIVITY_LIMIT });
  const entries = activity.data ?? [];

  if (entries.length === 0) {
    return <Typography variant="body2" sx={{ color: "text.secondary" }}>{t("tokens.noActivity")}</Typography>;
  }
  return (
    <Box sx={styles.list}>
      {entries.map((entry, index) => (
        <Box key={`${entry.time}-${index}`} sx={styles.row}>
          <Typography variant="caption" sx={styles.time}>{new Date(entry.time).toLocaleString()}</Typography>
          <Typography variant="body2" sx={styles.who}>{entry.principal.name}</Typography>
          <Typography variant="body2" sx={styles.action}>{entry.action}</Typography>
          <Typography variant="caption" sx={{ color: OUTCOME_COLOR[entry.outcome], fontWeight: 600 }}>
            {t(`tokens.outcome.${entry.outcome}`)}
          </Typography>
          {entry.reason && (
            <Typography variant="caption" sx={{ color: "text.secondary", flexBasis: "100%" }}>{entry.reason}</Typography>
          )}
        </Box>
      ))}
    </Box>
  );
}

const styles = {
  list: { display: "flex", flexDirection: "column" as const, gap: 0.5, maxHeight: 320, overflowY: "auto" as const },
  row: { display: "flex", flexWrap: "wrap" as const, alignItems: "baseline", gap: 1.5, px: 1, py: 0.5 },
  time: { color: "text.secondary", minWidth: 150 },
  who: { minWidth: 120, fontWeight: 500 },
  action: { fontFamily: "monospace", flex: 1 },
};
