import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import { useTranslation } from "react-i18next";
import { useStore } from "../../../hooks/useStore";
import type { ThemeMode } from "../../../types";

export function AppearanceSection() {
  const { t } = useTranslation();
  const themeMode = useStore((s) => s.themeMode);
  const setThemeMode = useStore((s) => s.setThemeMode);

  return (
    <Box>
      <Typography variant="body2" sx={{ color: "text.secondary", mb: 1 }}>
        {t("settings.appearance.theme")}
      </Typography>
      <ToggleButtonGroup
        value={themeMode}
        exclusive
        onChange={(_, val) => val && setThemeMode(val as ThemeMode)}
        sx={styles.toggleGroup}
      >
        <ToggleButton value="dark">
          {t("settings.appearance.dark")}
        </ToggleButton>
        <ToggleButton value="light">
          {t("settings.appearance.light")}
        </ToggleButton>
      </ToggleButtonGroup>
    </Box>
  );
}

const styles = {
  toggleGroup: {
    "& .MuiToggleButton-root": {
      color: "text.secondary",
      borderColor: "rgba(255,255,255,0.1)",
      textTransform: "none" as const,
      "&.Mui-selected": {
        backgroundColor: "primary.main",
        color: "#fff",
        "&:hover": { backgroundColor: "#7B31FF" },
      },
    },
  },
};
