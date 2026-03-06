import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import LinearProgress from "@mui/material/LinearProgress";
import { useTranslation } from "react-i18next";
import { GlassCard } from "../ui/GlassCard";
import { trpc } from "../../lib/trpc";

export function WidgetBar() {
  const { t } = useTranslation();
  const statsQuery = trpc.system.stats.useQuery(undefined, {
    refetchInterval: 5000,
    refetchIntervalInBackground: false,
  });

  const stats = statsQuery.data;

  const memoryPercent = stats
    ? Math.round((stats.memory.used / stats.memory.total) * 100)
    : 0;
  const diskPercent = stats?.disk
    ? Array.isArray(stats.disk)
      ? Math.round(
          ((stats.disk[0]?.used ?? 0) / (stats.disk[0]?.size ?? 1)) * 100,
        ) || 0
      : Math.round((stats.disk.used / stats.disk.total) * 100)
    : 0;

  return (
    <Box sx={styles.root}>
      <StatWidget
        label={t("desktop.widgets.cpu")}
        value={stats?.cpu ?? 0}
        unit="%"
      />
      <StatWidget
        label={t("desktop.widgets.memory")}
        value={memoryPercent}
        unit="%"
      />
      <StatWidget
        label={t("desktop.widgets.disk")}
        value={diskPercent}
        unit="%"
      />
    </Box>
  );
}

interface StatWidgetProps {
  label: string;
  value: number;
  unit: string;
}

function StatWidget({ label, value, unit }: StatWidgetProps) {
  return (
    <GlassCard sx={styles.widget}>
      <Box sx={styles.widgetHeader}>
        <Typography variant="caption" sx={styles.label}>
          {label}
        </Typography>
        <Typography variant="h6" sx={styles.value}>
          {value}{unit}
        </Typography>
      </Box>
      <LinearProgress
        variant="determinate"
        value={value}
        sx={styles.progress}
      />
    </GlassCard>
  );
}

const styles = {
  root: {
    display: "flex",
    gap: 2,
    mb: 3,
    flexWrap: "wrap" as const,
  },
  widget: {
    minWidth: 160,
    flex: 1,
    borderRadius: 2,
  },
  widgetHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    mb: 1,
  },
  label: {
    color: "rgba(255,255,255,0.6)",
    textTransform: "uppercase" as const,
    letterSpacing: "0.05em",
    fontSize: "0.7rem",
  },
  value: {
    color: "text.primary",
    fontWeight: 600,
  },
  progress: {
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.1)",
    "& .MuiLinearProgress-bar": {
      backgroundColor: "primary.main",
      borderRadius: 2,
    },
  },
};
