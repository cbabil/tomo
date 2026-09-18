import Box from "@mui/material/Box";
import TextField from "@mui/material/TextField";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import { useTranslation } from "react-i18next";
import type { OwnerRule } from "../../../../lib/router-types";
import { DAY_ORDER, type Day } from "../../../../lib/rules";

type When = NonNullable<OwnerRule["when"]>;
const DEFAULT_HOURS = "22:00-07:00";

interface TimeWindowFieldsProps {
  value: When;
  onChange: (next: When) => void;
}

/** Start and end time plus day chips. No days picked means every day. */
export function TimeWindowFields({ value, onChange }: TimeWindowFieldsProps) {
  const { t } = useTranslation();
  const [from, to] = (value.hours ?? DEFAULT_HOURS).split("-");
  const setHours = (nextFrom: string, nextTo: string) => onChange({ ...value, hours: `${nextFrom}-${nextTo}` });
  const setDays = (days: Day[]) => onChange({ ...value, days: days.length > 0 && days.length < 7 ? days : undefined });

  return (
    <Box sx={styles.root}>
      <Box sx={styles.times}>
        <TextField type="time" label={t("rules.dialog.from")} value={from} onChange={(e) => setHours(e.target.value, to)} size="small" slotProps={{ inputLabel: { shrink: true } }} />
        <TextField type="time" label={t("rules.dialog.to")} value={to} onChange={(e) => setHours(from, e.target.value)} size="small" slotProps={{ inputLabel: { shrink: true } }} />
      </Box>
      <ToggleButtonGroup size="small" value={value.days ?? []} onChange={(_, days: Day[]) => setDays(days)} sx={styles.days}>
        {DAY_ORDER.map((d) => <ToggleButton key={d} value={d} sx={styles.day}>{t(`rules.days.${d}`)}</ToggleButton>)}
      </ToggleButtonGroup>
    </Box>
  );
}

const styles = {
  root: { display: "flex", flexDirection: "column" as const, gap: 1.5 },
  times: { display: "flex", gap: 1.5 },
  days: { flexWrap: "wrap" as const },
  day: { textTransform: "none" as const, px: 1.25, "&.Mui-selected": { color: "primary.main" } },
};
