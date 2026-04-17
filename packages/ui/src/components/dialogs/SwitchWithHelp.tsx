import FormControlLabel from "@mui/material/FormControlLabel";
import Switch from "@mui/material/Switch";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import type { ReactNode } from "react";
import { colors } from "../../app/theme";

interface SwitchWithHelpProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: ReactNode;
  description?: ReactNode;
}

export function SwitchWithHelp({
  checked,
  onChange,
  label,
  description,
}: SwitchWithHelpProps) {
  return (
    <FormControlLabel
      sx={rootSx}
      control={
        <Switch
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          sx={switchSx}
        />
      }
      label={
        <Box>
          <Typography variant="body2">{label}</Typography>
          {description && (
            <Typography variant="caption" sx={{ color: colors.textSecondary }}>
              {description}
            </Typography>
          )}
        </Box>
      }
    />
  );
}

const rootSx = {
  alignItems: "flex-start",
  m: 0,
  "& .MuiFormControlLabel-label": { ml: 1 },
} as const;

const switchSx = {
  "& .MuiSwitch-switchBase.Mui-checked": {
    color: colors.primary,
  },
  "& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track": {
    backgroundColor: colors.primary,
  },
} as const;
