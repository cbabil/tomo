import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";
import Typography from "@mui/material/Typography";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import RadioButtonUncheckedIcon from "@mui/icons-material/RadioButtonUnchecked";
import { useTranslation } from "react-i18next";
import { colors } from "../../../../app/theme";
import type { UpdatePhase } from "../../../../hooks/useSelfUpdate";

const STEPS = ["download", "install", "reload"] as const;
/** The step in progress for each phase; earlier steps are done, later ones are waiting. */
const ACTIVE_STEP: Partial<Record<UpdatePhase, number>> = { downloading: 0, restarting: 1, slow: 1 };

/** The steps of an update in progress, so the wait never looks like a frozen screen. */
export function UpdateProgress({ phase, version }: { phase: UpdatePhase; version: string }) {
  const { t } = useTranslation();
  const active = ACTIVE_STEP[phase];
  if (active === undefined) return null;
  return (
    <Box sx={styles.root}>
      {STEPS.map((step, index) => (
        <Box key={step} sx={styles.step}>
          {index < active && <CheckCircleIcon sx={{ fontSize: 18, color: colors.success }} />}
          {index === active && <CircularProgress size={16} sx={{ color: "primary.main", m: "1px" }} />}
          {index > active && <RadioButtonUncheckedIcon sx={{ fontSize: 18, color: "text.secondary" }} />}
          <Typography variant="body2" sx={{ color: index > active ? "text.secondary" : "text.primary" }}>
            {t(`settings.update.steps.${step}`, { version })}
          </Typography>
        </Box>
      ))}
    </Box>
  );
}

const styles = {
  root: { display: "flex", flexDirection: "column" as const, gap: 1, p: 1.5, borderRadius: 2, backgroundColor: colors.subtle },
  step: { display: "flex", alignItems: "center", gap: 1.25 },
};
