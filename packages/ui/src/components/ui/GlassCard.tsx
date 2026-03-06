import type { ReactNode } from "react";
import Box from "@mui/material/Box";
import type { SxProps, Theme } from "@mui/material/styles";

interface GlassCardProps {
  children: ReactNode;
  sx?: SxProps<Theme>;
}

export function GlassCard({ children, sx }: GlassCardProps) {
  return (
    <Box
      sx={{
        backdropFilter: "blur(16px)",
        backgroundColor: "rgba(255,255,255,0.08)",
        border: "1px solid rgba(255,255,255,0.12)",
        borderRadius: 3,
        p: 2,
        ...sx,
      }}
    >
      {children}
    </Box>
  );
}
