import { colors } from "../../app/theme";

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
} as const;

export const catalogStyles = {
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
  grid: {
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
  },
};
