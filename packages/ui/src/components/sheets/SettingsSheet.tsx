import Box from "@mui/material/Box";
import Tab from "@mui/material/Tab";
import Tabs from "@mui/material/Tabs";
import PersonIcon from "@mui/icons-material/Person";
import PaletteIcon from "@mui/icons-material/Palette";
import TranslateIcon from "@mui/icons-material/Translate";
import StorefrontIcon from "@mui/icons-material/Storefront";
import SystemUpdateAltIcon from "@mui/icons-material/SystemUpdateAlt";
import { useTranslation } from "react-i18next";
import { useStore } from "../../hooks/useStore";
import { SETTINGS_TABS, type SettingsTab } from "../../types";
import { AccountSection } from "./settings/AccountSection";
import { AppearanceSection } from "./settings/AppearanceSection";
import { LanguageSection } from "./settings/LanguageSection";
import { AppStoreSection } from "./settings/AppStoreSection";
import { UpdateSection } from "./settings/UpdateSection";

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
  const tab = useStore((s) => s.settingsTab);
  const setTab = useStore((s) => s.setSettingsTab);

  const Content = TAB_CONTENT[tab];

  return (
    <Box sx={styles.root}>
      <Tabs
        value={tab}
        onChange={(_, v: SettingsTab) => setTab(v)}
        variant="fullWidth"
        sx={styles.tabs}
      >
        {SETTINGS_TABS.map((key) => (
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
    </Box>
  );
}

const styles = {
  root: {
    display: "flex",
    flexDirection: "column" as const,
    height: "100%",
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
    minHeight: 0,
    py: 3,
    px: 1,
  },
};
