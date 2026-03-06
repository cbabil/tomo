import Box from "@mui/material/Box";
import Select from "@mui/material/Select";
import MenuItem from "@mui/material/MenuItem";
import FormControl from "@mui/material/FormControl";
import InputLabel from "@mui/material/InputLabel";
import { useTranslation } from "react-i18next";
import { supportedLanguages } from "../../../i18n";

export function LanguageSection() {
  const { t, i18n } = useTranslation();

  return (
    <Box>
      <FormControl fullWidth size="small">
        <InputLabel>{t("settings.language.select")}</InputLabel>
        <Select
          value={i18n.language}
          label={t("settings.language.select")}
          onChange={(e) => i18n.changeLanguage(e.target.value)}
          sx={styles.select}
        >
          {supportedLanguages.map((lang) => (
            <MenuItem key={lang.code} value={lang.code}>
              {lang.label}
            </MenuItem>
          ))}
        </Select>
      </FormControl>
    </Box>
  );
}

const styles = {
  select: {
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: 2,
    color: "text.primary",
    "& .MuiOutlinedInput-notchedOutline": {
      borderColor: "rgba(255,255,255,0.1)",
    },
    "&:hover .MuiOutlinedInput-notchedOutline": {
      borderColor: "rgba(255,255,255,0.2)",
    },
    "&.Mui-focused .MuiOutlinedInput-notchedOutline": {
      borderColor: "primary.main",
    },
    "& .MuiSvgIcon-root": { color: "text.secondary" },
  },
};
