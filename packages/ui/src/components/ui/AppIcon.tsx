import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { motion } from "framer-motion";
import { colors } from "../../app/theme";
import { AppIconFallback } from "./AppIconFallback";
import type { InstalledApp } from "../../types";

interface AppIconProps {
  name: string;
  icon: string;
  status?: InstalledApp["status"];
  onClick?: () => void;
  onContextMenu?: (e: React.MouseEvent<HTMLElement>) => void;
}

export const STATUS_COLORS: Record<InstalledApp["status"], string> = {
  running: colors.success,
  stopped: colors.error,
  error: colors.warning,
  external: colors.info,
};

export function AppIcon({ name, icon, status, onClick, onContextMenu }: AppIconProps) {
  return (
    <motion.div whileHover={{ y: -4 }} transition={{ type: "tween", duration: 0.15 }}>
      <Box
        onClick={onClick}
        onContextMenu={onContextMenu}
        sx={styles.root}
      >
        <Box
          sx={{
            ...styles.iconWrapper,
            ...(status && {
              borderRadius: 3,
              boxShadow: `0 0 0 4px ${STATUS_COLORS[status]}, 0 0 22px 6px ${STATUS_COLORS[status]}cc`,
            }),
          }}
        >
          {icon ? (
            <Box
              component="img"
              src={icon}
              alt={name}
              sx={styles.icon}
            />
          ) : (
            <AppIconFallback name={name} size={56} />
          )}
        </Box>
        <Typography variant="caption" sx={styles.label} noWrap>
          {name}
        </Typography>
      </Box>
    </motion.div>
  );
}

const styles = {
  root: {
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    gap: 0.5,
    cursor: "pointer",
    userSelect: "none" as const,
    p: 1,
  },
  iconWrapper: {
    position: "relative" as const,
    width: 56,
    height: 56,
  },
  icon: {
    width: 56,
    height: 56,
    borderRadius: 3,
    objectFit: "cover" as const,
    boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
  },
  label: {
    color: "rgba(255,255,255,0.9)",
    fontSize: "0.7rem",
    textAlign: "center" as const,
    maxWidth: 72,
    textShadow: "0 1px 4px rgba(0,0,0,0.5)",
  },
};
