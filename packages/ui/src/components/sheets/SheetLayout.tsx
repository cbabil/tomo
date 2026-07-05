import type { ReactNode } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import IconButton from "@mui/material/IconButton";
import CloseIcon from "@mui/icons-material/Close";
import { motion } from "framer-motion";

interface SheetLayoutProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
}

export function SheetLayout({ title, onClose, children }: SheetLayoutProps) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={backdropStyle}
      onClick={onClose}
    >
      <motion.div
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", damping: 30, stiffness: 300 }}
        style={sheetStyle}
        onClick={(e) => e.stopPropagation()}
      >
        <Box sx={styles.header}>
          <Typography variant="h5" sx={styles.title}>
            {title}
          </Typography>
          <IconButton onClick={onClose} sx={styles.closeButton}>
            <CloseIcon />
          </IconButton>
        </Box>
        <Box sx={styles.content}>{children}</Box>
      </motion.div>
    </motion.div>
  );
}

const backdropStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 100,
  backdropFilter: "blur(8px)",
  backgroundColor: "rgba(0,0,0,0.4)",
  display: "flex",
  alignItems: "flex-end",
  justifyContent: "center",
};

const sheetStyle: React.CSSProperties = {
  width: "100%",
  maxWidth: 800,
  height: "90vh",
  borderRadius: "16px 16px 0 0",
  backgroundColor: "#0f172a",
  border: "1px solid rgba(255,255,255,0.08)",
  borderBottom: "none",
  display: "flex",
  flexDirection: "column",
};

const styles = {
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    px: 3,
    py: 2,
    borderBottom: "1px solid rgba(255,255,255,0.08)",
  },
  title: {
    fontWeight: 600,
    color: "text.primary",
  },
  closeButton: {
    color: "text.secondary",
    "&:hover": {
      backgroundColor: "transparent",
      color: "#B388FF",
    },
  },
  content: {
    flex: 1,
    overflowY: "auto",
    overflowX: "hidden",
    px: 3,
    py: 2,
  },
};
