import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { useTranslation } from "react-i18next";
import { trpc } from "../../lib/trpc";

const APP_VERSION = __APP_VERSION__;

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${days}d ${hours}h ${minutes}m`;
}

export function SystemSheet() {
  const { t } = useTranslation();
  const infoQuery = trpc.system.info.useQuery();
  const dockerQuery = trpc.system.docker.useQuery(undefined, {
    retry: false,
  });
  const info = infoQuery.data;
  const docker = dockerQuery.data;
  const dockerAvailable = dockerQuery.isSuccess && docker != null;

  return (
    <Box>
      <Typography variant="h6" sx={styles.sectionTitle}>
        {t("system.title")}
      </Typography>

      <Box sx={styles.infoGrid}>
        <InfoRow label={t("system.hostname")} value={info?.hostname} />
        <InfoRow label={t("system.os")} value={info?.os} />
        <InfoRow label={t("system.platform")} value={info?.platform} />
        <InfoRow
          label={t("system.uptime")}
          value={info?.uptime != null ? formatUptime(info.uptime) : undefined}
        />
        <InfoRow label={t("system.kernel")} value={info?.kernel} />
        <InfoRow label={t("system.version")} value={APP_VERSION} />
      </Box>

      <Typography variant="h6" sx={{ ...styles.sectionTitle, mt: 3 }}>
        {t("system.docker")}
      </Typography>

      <Box sx={styles.infoGrid}>
        <Box sx={styles.infoRow}>
          <Typography variant="body2" sx={{ color: "text.secondary" }}>
            {t("system.status")}
          </Typography>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <Box
              sx={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                bgcolor: dockerAvailable ? "#23ce6b" : "#ef4444",
              }}
            />
            <Typography variant="body2" sx={{ color: "text.primary" }}>
              {dockerAvailable
                ? t("system.connected")
                : t("system.unavailable")}
            </Typography>
          </Box>
        </Box>
        {dockerAvailable && (
          <>
            <InfoRow
              label={t("system.dockerVersion")}
              value={docker.version}
            />
            <InfoRow
              label={t("system.apiVersion")}
              value={docker.apiVersion}
            />
            <InfoRow
              label={t("system.containers")}
              value={`${docker.containers.running} ${t("system.running")} / ${docker.containers.total} ${t("system.total")}`}
            />
          </>
        )}
      </Box>
    </Box>
  );
}

function InfoRow({ label, value }: { label: string; value?: string }) {
  return (
    <Box sx={styles.infoRow}>
      <Typography variant="body2" sx={{ color: "text.secondary" }}>
        {label}
      </Typography>
      <Typography variant="body2" sx={{ color: "text.primary" }}>
        {value ?? "..."}
      </Typography>
    </Box>
  );
}

const styles = {
  sectionTitle: {
    fontWeight: 600,
    color: "text.primary",
    mb: 2,
  },
  infoGrid: {
    display: "flex",
    flexDirection: "column" as const,
    gap: 1,
  },
  infoRow: {
    display: "flex",
    justifyContent: "space-between",
    py: 0.5,
  },
};
