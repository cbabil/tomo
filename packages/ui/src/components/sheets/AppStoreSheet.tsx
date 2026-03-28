import { useState, useMemo } from "react";
import Box from "@mui/material/Box";
import TextField from "@mui/material/TextField";
import Chip from "@mui/material/Chip";
import Typography from "@mui/material/Typography";
import InputAdornment from "@mui/material/InputAdornment";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import Tabs from "@mui/material/Tabs";
import Tab from "@mui/material/Tab";
import SearchIcon from "@mui/icons-material/Search";
import AddIcon from "@mui/icons-material/Add";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import { useTranslation } from "react-i18next";
import { trpc } from "../../lib/trpc";
import { colors } from "../../app/theme";
import { useStore } from "../../hooks/useStore";
import { usePagination } from "../../hooks/usePagination";
import { catalogStyles } from "./catalogStyles";
import { AppCard } from "./AppCard";
import { TemplateCatalog } from "./TemplateCatalog";

const APPS_PER_PAGE = 8;
const INSTALLED_CATEGORY = "__installed__";

export function AppStoreSheet() {
  const { t } = useTranslation();
  const [storeTab, setStoreTab] = useState(0);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string | null>(null);

  const openCustomAppDialog = useStore((s) => s.openCustomAppDialog);
  const appsQuery = trpc.apps.list.useQuery();
  const categoriesQuery = trpc.apps.categories.useQuery();
  const installedQuery = trpc.apps.installed.useQuery();
  const installMutation = trpc.apps.install.useMutation();

  const installedIds = useMemo(
    () => new Set((installedQuery.data ?? []).map((a) => a.id)),
    [installedQuery.data],
  );

  const filteredApps = useMemo(() => {
    const apps = appsQuery.data ?? [];
    return apps.filter((app) => {
      const matchesSearch =
        !search ||
        app.name.toLowerCase().includes(search.toLowerCase()) ||
        app.tagline.toLowerCase().includes(search.toLowerCase());
      if (category === INSTALLED_CATEGORY) {
        return matchesSearch && installedIds.has(app.id);
      }
      const matchesCategory = !category || app.category === category;
      return matchesSearch && matchesCategory;
    });
  }, [appsQuery.data, search, category, installedIds]);

  const {
    setPage,
    safePage,
    totalPages,
    pagedItems: pagedApps,
    pageNumbers,
    handlePageReset,
  } = usePagination(filteredApps, APPS_PER_PAGE);

  const handleSearch = (value: string) => {
    setSearch(value);
    handlePageReset();
  };

  const handleCategory = (cat: string | null) => {
    setCategory(cat);
    handlePageReset();
  };

  const handleInstall = async (appId: string) => {
    try {
      await installMutation.mutateAsync({ appId });
      await installedQuery.refetch();
    } catch {
      // Mutation errors are surfaced via installMutation.error
    }
  };

  return (
    <Box sx={catalogStyles.root}>
      <Tabs
        value={storeTab}
        onChange={(_, v) => setStoreTab(v)}
        sx={styles.storeTabs}
      >
        <Tab label={t("appStore.storeTab")} />
        <Tab label={t("appStore.templatesTab")} />
      </Tabs>

      {storeTab === 1 ? (
        <TemplateCatalog />
      ) : (
      <>
      <Box sx={catalogStyles.content}>
        <Box sx={styles.searchRow}>
          <TextField
            placeholder={t("appStore.search")}
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
            fullWidth
            size="small"
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon sx={{ color: "text.secondary" }} />
                  </InputAdornment>
                ),
              },
            }}
            sx={catalogStyles.searchField}
          />
          <Tooltip title={t("desktop.apps.addCustom")} arrow>
            <IconButton onClick={openCustomAppDialog} sx={styles.addButton}>
              <AddIcon />
            </IconButton>
          </Tooltip>
        </Box>

        <Box sx={catalogStyles.categories}>
          <Chip
            label={t("appStore.allCategories")}
            onClick={() => handleCategory(null)}
            variant={category === null ? "filled" : "outlined"}
            sx={category === null ? catalogStyles.chipActive : catalogStyles.chip}
          />
          <Chip
            label={t("appStore.installed")}
            onClick={() => handleCategory(INSTALLED_CATEGORY)}
            variant={category === INSTALLED_CATEGORY ? "filled" : "outlined"}
            sx={category === INSTALLED_CATEGORY ? catalogStyles.chipActive : catalogStyles.chip}
          />
          {(categoriesQuery.data ?? []).map((cat) => (
            <Chip
              key={cat}
              label={cat}
              onClick={() => handleCategory(cat)}
              variant={category === cat ? "filled" : "outlined"}
              sx={category === cat ? catalogStyles.chipActive : catalogStyles.chip}
            />
          ))}
        </Box>

        {pagedApps.length === 0 ? (
          <Box sx={catalogStyles.noResults}>
            <Typography sx={{ color: "text.secondary" }}>
              {t("appStore.noResults")}
            </Typography>
          </Box>
        ) : (
          <Box sx={styles.appGrid}>
            {pagedApps.map((app) => (
              <AppCard
                key={app.id}
                app={app}
                isInstalled={installedIds.has(app.id)}
                isInstalling={
                  installMutation.isPending &&
                  installMutation.variables?.appId === app.id
                }
                onInstall={() => handleInstall(app.id)}
              />
            ))}
          </Box>
        )}
      </Box>

      {totalPages > 1 && (
        <Box sx={catalogStyles.footer}>
          <IconButton
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={safePage === 1}
            sx={catalogStyles.navButton}
          >
            <ChevronLeftIcon fontSize="small" />
            <Typography variant="body2" sx={catalogStyles.navText}>
              {t("appStore.previous")}
            </Typography>
          </IconButton>

          <Box sx={catalogStyles.pageNumbers}>
            {pageNumbers.map((n) => (
              <Box
                key={n}
                component="button"
                onClick={() => setPage(n)}
                sx={n === safePage ? catalogStyles.pageActive : catalogStyles.pageButton}
              >
                {n}
              </Box>
            ))}
          </Box>

          <IconButton
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={safePage === totalPages}
            sx={catalogStyles.navButton}
          >
            <Typography variant="body2" sx={catalogStyles.navText}>
              {t("appStore.next")}
            </Typography>
            <ChevronRightIcon fontSize="small" />
          </IconButton>
        </Box>
      )}
      </>
      )}
    </Box>
  );
}

const styles = {
  storeTabs: {
    mb: 2,
    "& .MuiTab-root": {
      textTransform: "none" as const,
      color: colors.textSecondary,
      fontWeight: 500,
      "&.Mui-selected": { color: colors.primary },
    },
    "& .MuiTabs-indicator": {
      backgroundColor: colors.primary,
    },
  },
  searchRow: {
    display: "flex",
    gap: 2,
    alignItems: "center",
  },
  addButton: {
    width: 48,
    height: 48,
    flexShrink: 0,
    border: `2px solid ${colors.primary}`,
    color: colors.primary,
    "&:hover": {
      backgroundColor: `${colors.primary}15`,
      color: colors.primaryBoost,
    },
  },
  appGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(2, 1fr)",
    gap: 2,
  },
};
