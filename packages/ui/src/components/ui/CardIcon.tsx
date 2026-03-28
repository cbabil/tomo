import { useState } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { colors } from "../../app/theme";

interface CardIconProps {
  src: string;
  name: string;
  size?: number;
}

export function CardIcon({ src, name, size = 56 }: CardIconProps) {
  const [failed, setFailed] = useState(false);

  if (failed || !src) {
    return (
      <Box
        sx={{
          width: size,
          height: size,
          borderRadius: "12px",
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: `${colors.primary}33`,
        }}
      >
        <Typography
          sx={{
            color: colors.primary,
            fontWeight: 700,
            fontSize: size >= 48 ? "1.25rem" : "1rem",
          }}
        >
          {name.charAt(0).toUpperCase()}
        </Typography>
      </Box>
    );
  }

  return (
    <Box
      component="img"
      src={src}
      alt={name}
      onError={() => setFailed(true)}
      sx={{
        width: size,
        height: size,
        borderRadius: "12px",
        objectFit: "cover" as const,
        flexShrink: 0,
      }}
    />
  );
}
