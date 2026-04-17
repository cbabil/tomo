import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import type { SetupField } from "../../types";
import { SwitchWithHelp } from "./SwitchWithHelp";

interface SetupFieldInputProps {
  field: SetupField;
  value: string;
  onChange: (value: string) => void;
}

export function SetupFieldInput({ field, value, onChange }: SetupFieldInputProps) {
  if (field.type === "boolean") {
    return (
      <SwitchWithHelp
        checked={value === "true"}
        onChange={(checked) => onChange(checked ? "true" : "false")}
        label={field.label}
        description={field.description}
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
