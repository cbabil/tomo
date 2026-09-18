import { useCallback } from "react";
import TextField from "@mui/material/TextField";
import Alert from "@mui/material/Alert";
import Accordion from "@mui/material/Accordion";
import AccordionSummary from "@mui/material/AccordionSummary";
import AccordionDetails from "@mui/material/AccordionDetails";
import Typography from "@mui/material/Typography";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import { useTranslation } from "react-i18next";
import { colors } from "../../app/theme";
import { useComposeInspection } from "../../hooks/useComposeInspection";
import { SwitchWithHelp } from "./SwitchWithHelp";

/** Everything the user can set on a custom Docker app, as form strings. */
export interface CustomAppValues {
  name: string;
  image: string;
  port: string;
  path: string;
  icon: string;
  composeYaml: string;
  allowPrivileged: boolean;
  ownAuth: boolean;
}

export const EMPTY_CUSTOM_APP: CustomAppValues = {
  name: "",
  image: "",
  port: "",
  path: "",
  icon: "",
  composeYaml: "",
  allowPrivileged: false,
  ownAuth: false,
};

interface CustomAppFieldsProps {
  values: CustomAppValues;
  onChange: (values: CustomAppValues) => void;
  /** The name identifies the app after install, so editing hides it. */
  nameEditable: boolean;
  /** Template apps run a fixed image and YAML; only presentation is editable. */
  sourceEditable?: boolean;
}

/** Shared form for adding and editing a custom Docker app. */
export function CustomAppFields({
  values,
  onChange,
  nameEditable,
  sourceEditable = true,
}: CustomAppFieldsProps) {
  const { t } = useTranslation();
  const set = <K extends keyof CustomAppValues>(field: K, value: CustomAppValues[K]) =>
    onChange({ ...values, [field]: value });
  const onPortDetected = useCallback(
    (port: string) => onChange({ ...values, port }),
    [onChange, values],
  );
  const notice = useComposeInspection(values.composeYaml, values.name, values.port, onPortDetected);
  const ownAuthSwitch = (
    <SwitchWithHelp
      checked={values.ownAuth}
      onChange={(checked) => set("ownAuth", checked)}
      label={t("customApp.ownAuth")}
      description={t("customApp.ownAuthHelp")}
    />
  );

  return (
    <>
      {nameEditable && (
        <TextField
          label={t("customApp.name")}
          value={values.name}
          onChange={(e) => set("name", e.target.value)}
          fullWidth
          required
          size="small"
        />
      )}
      {sourceEditable && (
        <>
          <TextField
            label={t("customApp.image")}
            value={values.image}
            onChange={(e) => set("image", e.target.value)}
            fullWidth
            size="small"
            placeholder="nginx:latest"
            disabled={Boolean(values.composeYaml.trim())}
          />
          <TextField
            label={t("customApp.port")}
            value={values.port}
            onChange={(e) => set("port", e.target.value)}
            fullWidth
            required
            size="small"
            type="number"
            helperText={t("customApp.portHelp")}
            slotProps={{ htmlInput: { min: 1, max: 65535 } }}
          />
        </>
      )}
      <TextField
        label={t("customApp.openPath")}
        value={values.path}
        onChange={(e) => set("path", e.target.value)}
        fullWidth
        size="small"
        placeholder="/ui"
        helperText={t("customApp.openPathHelp")}
      />
      <TextField
        label={t("customApp.icon")}
        value={values.icon}
        onChange={(e) => set("icon", e.target.value)}
        fullWidth
        size="small"
        placeholder="https://example.com/icon.png"
      />
      {sourceEditable ? (
        <Accordion sx={styles.accordion} disableGutters elevation={0}>
          <AccordionSummary expandIcon={<ExpandMoreIcon sx={{ color: colors.textSecondary }} />}>
            <Typography variant="body2" sx={{ color: colors.textSecondary }}>
              {t("customApp.advanced")}
            </Typography>
          </AccordionSummary>
          <AccordionDetails sx={styles.accordionDetails}>
            <TextField
              label={t("customApp.composeYaml")}
              value={values.composeYaml}
              onChange={(e) => set("composeYaml", e.target.value)}
              fullWidth
              multiline
              rows={6}
              size="small"
              placeholder={"services:\n  app:\n    image: nginx:latest"}
              helperText={t("customApp.composeYamlHelp")}
              sx={{ fontFamily: "monospace" }}
            />
            {notice && <Alert severity={notice.severity}>{notice.text}</Alert>}
            {ownAuthSwitch}
            <SwitchWithHelp
              checked={values.allowPrivileged}
              onChange={(checked) => set("allowPrivileged", checked)}
              label={t("customApp.allowPrivileged")}
              description={t("customApp.allowPrivilegedHelp")}
            />
          </AccordionDetails>
        </Accordion>
      ) : (
        ownAuthSwitch
      )}
    </>
  );
}

const styles = {
  accordion: {
    backgroundColor: "transparent",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: "8px !important",
    "&::before": { display: "none" },
  },
  accordionDetails: {
    display: "flex",
    flexDirection: "column" as const,
    gap: 2,
  },
};
