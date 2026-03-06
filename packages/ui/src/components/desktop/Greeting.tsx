import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { useTranslation } from "react-i18next";
import { useAuth } from "../../hooks/useAuth";

function getGreetingKey(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "desktop.greeting.morning";
  if (hour < 18) return "desktop.greeting.afternoon";
  return "desktop.greeting.evening";
}

function formatDate(): string {
  return new Date().toLocaleDateString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export function Greeting() {
  const { t } = useTranslation();
  const { userName } = useAuth();

  const greetingKey = getGreetingKey();
  const dateStr = formatDate();

  return (
    <Box sx={styles.root}>
      <Typography variant="h3" sx={styles.greeting}>
        {t(greetingKey)}, {userName}
      </Typography>
      <Typography variant="body1" sx={styles.date}>
        {dateStr}
      </Typography>
    </Box>
  );
}

const styles = {
  root: {
    mb: 3,
  },
  greeting: {
    fontWeight: 600,
    color: "rgba(255,255,255,0.9)",
    textShadow: "0 2px 8px rgba(0,0,0,0.3)",
  },
  date: {
    color: "rgba(255,255,255,0.6)",
    mt: 0.5,
    textShadow: "0 1px 4px rgba(0,0,0,0.3)",
  },
};
