import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { colors } from "../../app/theme";

interface AppIconFallbackProps {
  name: string;
  size: number;
}

export function AppIconFallback({ name, size }: AppIconFallbackProps) {
  const fontSize = size >= 48 ? "1.5rem" : "0.875rem";

  return (
    <Box
      sx={{
        width: size,
        height: size,
        borderRadius: size >= 48 ? 3 : 1.5,
        backgroundColor: colors.primary,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        boxShadow: size >= 48 ? "0 4px 12px rgba(0,0,0,0.3)" : undefined,
        flexShrink: 0,
      }}
    >
      <Typography sx={{ color: "#ffffff", fontSize, fontWeight: 700 }}>
        {name.charAt(0).toUpperCase()}
      </Typography>
    </Box>
  );
}
