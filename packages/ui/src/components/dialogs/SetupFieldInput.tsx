import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import FormControlLabel from "@mui/material/FormControlLabel";
import Switch from "@mui/material/Switch";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { colors } from "../../app/theme";
import type { SetupField } from "../../types";

interface SetupFieldInputProps {
  field: SetupField;
  value: string;
  onChange: (value: string) => void;
}

export function SetupFieldInput({ field, value, onChange }: SetupFieldInputProps) {
  if (field.type === "boolean") {
    return (
      <FormControlLabel
        control={
          <Switch
            checked={value === "true"}
            onChange={(e) => onChange(e.target.checked ? "true" : "false")}
            sx={switchSx}
          />
        }
        label={
          <Box>
            <Typography variant="body2">{field.label}</Typography>
            {field.description && (
              <Typography variant="caption" sx={{ color: colors.textSecondary }}>
                {field.description}
              </Typography>
            )}
          </Box>
        }
      />
    );
  }

  if (field.type === "select" && field.options) {
    return (
      <TextField
        select
        label={field.label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        fullWidth
        required={field.required}
        size="small"
        helperText={field.description}
      >
        {field.options.map((opt) => (
          <MenuItem key={opt.value} value={opt.value}>
            {opt.label}
          </MenuItem>
        ))}
      </TextField>
    );
  }

  return (
    <TextField
      label={field.label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      fullWidth
      required={field.required}
      size="small"
      type={field.type === "number" ? "number" : "text"}
      placeholder={field.placeholder}
      helperText={field.description}
    />
  );
}

const switchSx = {
  "& .MuiSwitch-switchBase.Mui-checked": {
    color: colors.primary,
  },
  "& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track": {
    backgroundColor: colors.primary,
  },
} as const;
