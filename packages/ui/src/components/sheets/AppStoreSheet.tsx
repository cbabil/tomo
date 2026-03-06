import { useState, useMemo } from "react";
import Box from "@mui/material/Box";
import TextField from "@mui/material/TextField";
import Chip from "@mui/material/Chip";
import Typography from "@mui/material/Typography";
import InputAdornment from "@mui/material/InputAdornment";
import IconButton from "@mui/material/IconButton";
import SearchIcon from "@mui/icons-material/Search";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import { useTranslation } from "react-i18next";
import { trpc } from "../../lib/trpc";
import { colors } from "../../app/theme";
import { AppCard } from "./AppCard";

const APPS_PER_PAGE = 8;
const MAX_PAGE_BUTTONS = 5;
const INSTALLED_CATEGORY = "__installed__";

export function AppStoreSheet() {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [page, setPage] = useState(1);

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

  const totalPages = Math.max(1, Math.ceil(filteredApps.length / APPS_PER_PAGE));
  const safePage = Math.min(page, totalPages);
  const pagedApps = useMemo(
    () => filteredApps.slice((safePage - 1) * APPS_PER_PAGE, safePage * APPS_PER_PAGE),
    [filteredApps, safePage],
  );

  const handleSearch = (value: string) => {
    setSearch(value);
    setPage(1);
  };

  const handleCategory = (cat: string | null) => {
    setCategory(cat);
    setPage(1);
  };

  const handleInstall = async (appId: string) => {
    try {
      await installMutation.mutateAsync({ appId });
      await installedQuery.refetch();
    } catch {
      // Mutation errors are surfaced via installMutation.error
    }
  };

  const pageNumbers = useMemo(() => {
    const pages: number[] = [];
    let start = Math.max(1, safePage - Math.floor(MAX_PAGE_BUTTONS / 2));
    const end = Math.min(totalPages, start + MAX_PAGE_BUTTONS - 1);
    start = Math.max(1, end - MAX_PAGE_BUTTONS + 1);
    for (let i = start; i <= end; i++) pages.push(i);
    return pages;
  }, [safePage, totalPages]);

  return (
    <Box sx={styles.root}>
      <Box sx={styles.content}>
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
          sx={styles.searchField}
        />

        <Box sx={styles.categories}>
          <Chip
            label={t("appStore.allCategories")}
            onClick={() => handleCategory(null)}
            variant={category === null ? "filled" : "outlined"}
            sx={category === null ? styles.chipActive : styles.chip}
          />
          <Chip
            label={t("appStore.installed")}
            onClick={() => handleCategory(INSTALLED_CATEGORY)}
            variant={category === INSTALLED_CATEGORY ? "filled" : "outlined"}
            sx={category === INSTALLED_CATEGORY ? styles.chipActive : styles.chip}
          />
          {(categoriesQuery.data ?? []).map((cat) => (
            <Chip
              key={cat}
              label={cat}
              onClick={() => handleCategory(cat)}
              variant={category === cat ? "filled" : "outlined"}
              sx={category === cat ? styles.chipActive : styles.chip}
            />
          ))}
        </Box>

        {pagedApps.length === 0 ? (
          <Box sx={styles.noResults}>
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
        <Box sx={styles.footer}>
          <IconButton
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={safePage === 1}
            sx={styles.navButton}
          >
            <ChevronLeftIcon fontSize="small" />
            <Typography variant="body2" sx={styles.navText}>
              {t("appStore.previous")}
            </Typography>
          </IconButton>

          <Box sx={styles.pageNumbers}>
            {pageNumbers.map((n) => (
              <Box
                key={n}
                component="button"
                onClick={() => setPage(n)}
                sx={n === safePage ? styles.pageActive : styles.pageButton}
              >
                {n}
              </Box>
            ))}
          </Box>

          <IconButton
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={safePage === totalPages}
            sx={styles.navButton}
          >
            <Typography variant="body2" sx={styles.navText}>
              {t("appStore.next")}
            </Typography>
            <ChevronRightIcon fontSize="small" />
          </IconButton>
        </Box>
      )}
    </Box>
  );
}

const chipBase = {
  height: 32,
  borderRadius: "9999px",
  fontWeight: 500,
  fontSize: "0.8125rem",
} as const;

const pageBase = {
  width: 32,
  height: 32,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: "9999px",
  border: "none",
  cursor: "pointer",
  fontSize: "0.875rem",
  fontWeight: 500,
  transition: "all 0.2s ease",
} as const;

const styles = {
  root: {
    display: "flex",
    flexDirection: "column" as const,
    height: "100%",
  },
  content: {
    display: "flex",
    flexDirection: "column" as const,
    gap: 3,
    flex: 1,
    minHeight: 0,
  },
  searchField: {
    "& .MuiOutlinedInput-root": {
      borderRadius: "12px",
      height: 48,
      "&:hover fieldset": { borderColor: `${colors.primary}80` },
      "&.Mui-focused fieldset": {
        borderColor: `${colors.primary}80`,
        borderWidth: 1,
      },
    },
  },
  categories: {
    display: "flex",
    gap: 1.5,
    flexWrap: "wrap" as const,
  },
  chip: {
    ...chipBase,
    backgroundColor: "rgba(255,255,255,0.05)",
    border: "1px solid rgba(255,255,255,0.10)",
    color: "text.secondary",
    "&:hover": {
      backgroundColor: "rgba(255,255,255,0.10)",
      color: "text.primary",
    },
  },
  chipActive: {
    ...chipBase,
    backgroundColor: colors.primary,
    color: "#fff",
    "&:hover": { backgroundColor: colors.primaryBoost },
  },
  appGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(2, 1fr)",
    gap: 2,
  },
  noResults: {
    display: "flex",
    justifyContent: "center",
    py: 6,
  },
  footer: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    pt: 3,
    mt: "auto",
    borderTop: "1px solid rgba(255,255,255,0.08)",
  },
  navButton: {
    display: "flex",
    alignItems: "center",
    gap: 0.5,
    borderRadius: "8px",
    color: "text.secondary",
    "&:hover": {
      backgroundColor: "transparent",
      color: "text.primary",
    },
    "&.Mui-disabled": {
      opacity: 0.3,
    },
  },
  navText: {
    fontSize: "0.875rem",
    fontWeight: 500,
  },
  pageNumbers: {
    display: "flex",
    alignItems: "center",
    gap: 1,
  },
  pageButton: {
    ...pageBase,
    backgroundColor: "transparent",
    color: "text.secondary",
    "&:hover": {
      backgroundColor: "rgba(255,255,255,0.05)",
      color: "text.primary",
    },
  },
  pageActive: {
    ...pageBase,
    backgroundColor: colors.primary,
    color: "#fff",
    boxShadow: `0 4px 12px ${colors.primary}33`,
  },
};
