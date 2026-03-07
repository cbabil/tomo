import { useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Tab from "@mui/material/Tab";
import Tabs from "@mui/material/Tabs";
import LogoutIcon from "@mui/icons-material/Logout";
import PersonIcon from "@mui/icons-material/Person";
import PaletteIcon from "@mui/icons-material/Palette";
import TranslateIcon from "@mui/icons-material/Translate";
import StorefrontIcon from "@mui/icons-material/Storefront";
import SystemUpdateAltIcon from "@mui/icons-material/SystemUpdateAlt";
import { useTranslation } from "react-i18next";
import { useAuth } from "../../hooks/useAuth";
import { AccountSection } from "./settings/AccountSection";
import { AppearanceSection } from "./settings/AppearanceSection";
import { LanguageSection } from "./settings/LanguageSection";
import { AppStoreSection } from "./settings/AppStoreSection";
import { UpdateSection } from "./settings/UpdateSection";

const TABS = ["account", "appearance", "language", "appStore", "update"] as const;
type SettingsTab = (typeof TABS)[number];

const TAB_ICONS: Record<SettingsTab, React.ReactElement> = {
  account: <PersonIcon sx={{ fontSize: 20 }} />,
  appearance: <PaletteIcon sx={{ fontSize: 20 }} />,
  language: <TranslateIcon sx={{ fontSize: 20 }} />,
  appStore: <StorefrontIcon sx={{ fontSize: 20 }} />,
  update: <SystemUpdateAltIcon sx={{ fontSize: 20 }} />,
};

const TAB_CONTENT: Record<SettingsTab, React.FC> = {
  account: AccountSection,
  appearance: AppearanceSection,
  language: LanguageSection,
  appStore: AppStoreSection,
  update: UpdateSection,
};

export function SettingsSheet() {
  const { t } = useTranslation();
  const { logout } = useAuth();
  const [tab, setTab] = useState<SettingsTab>("account");

  const Content = TAB_CONTENT[tab];

  return (
    <Box sx={styles.root}>
      <Tabs
        value={tab}
        onChange={(_, v) => setTab(v)}
        variant="fullWidth"
        sx={styles.tabs}
      >
        {TABS.map((key) => (
          <Tab
            key={key}
            value={key}
            icon={TAB_ICONS[key]}
            label={t(`settings.${key}.title`)}
            sx={styles.tab}
          />
        ))}
      </Tabs>

      <Box sx={styles.content}>
        <Content />
      </Box>

      <Box sx={styles.footer}>
        <Button
          variant="outlined"
          startIcon={<LogoutIcon />}
          onClick={logout}
          sx={styles.logoutButton}
        >
          {t("settings.logout")}
        </Button>
      </Box>
    </Box>
  );
}

const styles = {
  root: {
    display: "flex",
    flexDirection: "column" as const,
    maxHeight: 480,
  },
  tabs: {
    minHeight: 48,
    "& .MuiTabs-indicator": {
      backgroundColor: "primary.main",
    },
  },
  tab: {
    textTransform: "none" as const,
    fontSize: "0.8rem",
    minHeight: 48,
    color: "text.secondary",
    "&.Mui-selected": {
      color: "primary.main",
    },
  },
  content: {
    flex: 1,
    overflow: "auto",
    py: 3,
    px: 1,
  },
  footer: {
    pt: 2,
  },
  logoutButton: {
    borderColor: "error.main",
    color: "error.main",
    textTransform: "none" as const,
    borderRadius: 2,
    "&:hover": {
      borderColor: "error.main",
      backgroundColor: "rgba(239,68,68,0.08)",
    },
  },
};
