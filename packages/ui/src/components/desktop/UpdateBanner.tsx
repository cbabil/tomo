import Tooltip from "@mui/material/Tooltip";
import IconButton from "@mui/material/IconButton";
import SystemUpdateAltIcon from "@mui/icons-material/SystemUpdateAlt";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslation } from "react-i18next";
import { trpc } from "../../lib/trpc";
import { useStore } from "../../hooks/useStore";
import { colors } from "../../app/theme";

const POLL_INTERVAL = 60_000;

export function UpdateBanner() {
  const { t } = useTranslation();
  const openSheet = useStore((s) => s.openSheet);

  const versionQuery = trpc.system.version.useQuery(undefined, {
    refetchInterval: POLL_INTERVAL,
    refetchIntervalInBackground: false,
    staleTime: 30_000,
  });

  const data = versionQuery.data;
  const visible = Boolean(data?.updateAvailable && data.latest);
  const label = t("desktop.update.available", { version: data?.latest });

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, scale: 0.6 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.6 }}
          transition={{ type: "spring", damping: 18, stiffness: 300 }}
        >
          <Tooltip title={label} placement="bottom">
            <IconButton
              onClick={() => openSheet("settings")}
              aria-label={label}
              sx={styles.button}
            >
              <SystemUpdateAltIcon sx={styles.icon} />
            </IconButton>
          </Tooltip>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

const styles = {
  button: {
    color: colors.primary,
    "&:hover": {
      backgroundColor: "transparent",
      color: colors.primaryBoost,
    },
  },
  icon: {
    fontSize: 22,
  },
};
