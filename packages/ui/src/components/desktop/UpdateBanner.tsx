import { useState } from "react";
import Typography from "@mui/material/Typography";
import IconButton from "@mui/material/IconButton";
import Button from "@mui/material/Button";
import CloseIcon from "@mui/icons-material/Close";
import SystemUpdateAltIcon from "@mui/icons-material/SystemUpdateAlt";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslation } from "react-i18next";
import { trpc } from "../../lib/trpc";
import { useStore } from "../../hooks/useStore";
import { GlassCard } from "../ui/GlassCard";
import { colors } from "../../app/theme";

const DISMISSED_KEY = "tomo-update-dismissed";
const POLL_INTERVAL = 60_000;
const POLL_INTERVAL_DISMISSED = 300_000;

export function UpdateBanner() {
  const { t } = useTranslation();
  const openSheet = useStore((s) => s.openSheet);
  const [dismissedVersion, setDismissedVersion] = useState(
    () => localStorage.getItem(DISMISSED_KEY) ?? "",
  );

  const isDismissed = !!dismissedVersion;
  const versionQuery = trpc.system.version.useQuery(undefined, {
    refetchInterval: isDismissed ? POLL_INTERVAL_DISMISSED : POLL_INTERVAL,
    refetchIntervalInBackground: false,
    staleTime: 30_000,
  });

  const data = versionQuery.data;
  const visible =
    data?.updateAvailable && data.latest && data.latest !== dismissedVersion;

  function dismiss() {
    if (data?.latest) {
      localStorage.setItem(DISMISSED_KEY, data.latest);
      setDismissedVersion(data.latest);
    }
  }

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, x: 40 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 40 }}
          transition={{ type: "spring", damping: 20, stiffness: 300 }}
          style={motionStyle}
        >
          <GlassCard sx={styles.banner}>
            <SystemUpdateAltIcon sx={styles.icon} />
            <Typography sx={styles.text}>
              {t("desktop.update.available", { version: data?.latest })}
            </Typography>
            <Button
              size="small"
              sx={styles.updateBtn}
              onClick={() => openSheet("settings")}
            >
              {t("desktop.update.updateNow")}
            </Button>
            <IconButton
              size="small"
              onClick={dismiss}
              aria-label={t("desktop.update.dismiss")}
              sx={styles.closeBtn}
            >
              <CloseIcon fontSize="small" />
            </IconButton>
          </GlassCard>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

const motionStyle: React.CSSProperties = {
  position: "fixed",
  top: 16,
  right: 16,
  zIndex: 12,
};

const styles = {
  banner: {
    display: "flex",
    alignItems: "center",
    gap: 1,
    px: 2,
    py: 1,
    borderRadius: 2,
  },
  icon: {
    fontSize: 18,
    color: colors.primary,
  },
  text: {
    fontSize: "0.8rem",
    color: colors.textPrimary,
    whiteSpace: "nowrap",
  },
  updateBtn: {
    fontSize: "0.75rem",
    color: colors.primary,
    textTransform: "none",
    fontWeight: 600,
    minWidth: "auto",
    px: 1,
    "&:hover": { color: colors.primaryBoost },
  },
  closeBtn: {
    color: colors.textSecondary,
    p: 0.5,
  },
};
