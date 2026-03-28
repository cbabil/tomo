import { useMemo, useCallback, useState } from "react";
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
import { useStore } from "../../hooks/useStore";
import { usePagination } from "../../hooks/usePagination";
import { catalogStyles } from "./catalogStyles";
import { TemplateCard } from "./TemplateCard";

function slugify(name: string): string {
  return name.toLowerCase().trim().replace(/\s+/g, "-").replace(/[^a-z0-9._-]/g, "").replace(/^[^a-z0-9]/, "a");
}

const TEMPLATES_PER_PAGE = 8;

export function TemplateCatalog() {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string | null>(null);

  const openTemplateInstall = useStore((s) => s.openTemplateInstall);
  const templatesQuery = trpc.apps.templates.list.useQuery();
  const installedQuery = trpc.apps.installed.useQuery();

  const installedIds = useMemo(
    () => new Set((installedQuery.data ?? []).map((a) => a.id)),
    [installedQuery.data],
  );

  const isTemplateInstalled = useCallback(
    (templateName: string) => installedIds.has(slugify(templateName)),
    [installedIds],
  );

  const categories = useMemo(() => {
    const cats = new Set((templatesQuery.data ?? []).map((tmpl) => tmpl.category));
    return [...cats].sort();
  }, [templatesQuery.data]);

  const filteredTemplates = useMemo(() => {
    const templates = templatesQuery.data ?? [];
    return templates.filter((tmpl) => {
      const matchesSearch =
        !search ||
        tmpl.name.toLowerCase().includes(search.toLowerCase()) ||
        tmpl.description.toLowerCase().includes(search.toLowerCase());
      const matchesCategory = !category || tmpl.category === category;
      return matchesSearch && matchesCategory;
    });
  }, [templatesQuery.data, search, category]);

  const {
    setPage,
    safePage,
    totalPages,
    pagedItems: pagedTemplates,
    pageNumbers,
    handlePageReset,
  } = usePagination(filteredTemplates, TEMPLATES_PER_PAGE);

  const handleSearch = (value: string) => {
    setSearch(value);
    handlePageReset();
  };

  const handleCategory = (cat: string | null) => {
    setCategory(cat);
    handlePageReset();
  };

  return (
    <Box sx={catalogStyles.root}>
      <Box sx={catalogStyles.content}>
        <TextField
          placeholder={t("templates.search")}
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

        <Box sx={catalogStyles.categories}>
          <Chip
            label={t("templates.allCategories")}
            onClick={() => handleCategory(null)}
            variant={category === null ? "filled" : "outlined"}
            sx={category === null ? catalogStyles.chipActive : catalogStyles.chip}
          />
          {categories.map((cat) => (
            <Chip
              key={cat}
              label={cat}
              onClick={() => handleCategory(cat)}
              variant={category === cat ? "filled" : "outlined"}
              sx={category === cat ? catalogStyles.chipActive : catalogStyles.chip}
            />
          ))}
        </Box>

        {pagedTemplates.length === 0 ? (
          <Box sx={catalogStyles.noResults}>
            <Typography sx={{ color: "text.secondary" }}>
              {t("templates.noResults")}
            </Typography>
          </Box>
        ) : (
          <Box sx={catalogStyles.grid}>
            {pagedTemplates.map((template) => (
              <TemplateCard
                key={template.id}
                template={template}
                isInstalled={isTemplateInstalled(template.name)}
                onInstall={() => openTemplateInstall(template)}
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
    </Box>
  );
}
