import { useState } from "react";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import IconButton from "@mui/material/IconButton";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import Switch from "@mui/material/Switch";
import Typography from "@mui/material/Typography";
import LockIcon from "@mui/icons-material/Lock";
import MoreHorizIcon from "@mui/icons-material/MoreHoriz";
import { useTranslation } from "react-i18next";
import { colors } from "../../../../app/theme";
import type { OwnerRule, RuleEffect } from "../../../../lib/router-types";
import { listRowSx } from "../listRow";
import { RuleSentence } from "./RuleSentence";

const EFFECT_COLOR: Record<RuleEffect, string> = {
  allow: colors.success,
  deny: colors.error,
  agent_confirm: colors.info,
  human_confirm: colors.warning,
};

export type RuleAction = "edit" | "duplicate" | "moveUp" | "moveDown" | "delete";
const ACTIONS: RuleAction[] = ["edit", "duplicate", "moveUp", "moveDown", "delete"];

interface RuleCardProps {
  rule: OwnerRule;
  appNames: Record<string, string>;
  /** Built-in rules are shown locked, with no controls. */
  locked?: boolean;
  /** The built-in rule that already decides this one, if any. */
  shadowedBy?: string;
  highlighted?: boolean;
  onToggle?: (enabled: boolean) => void;
  onAction?: (action: RuleAction) => void;
}

/** One rule as a sentence, with its outcome, an on/off switch, and a menu. */
export function RuleCard({ rule, appNames, locked, shadowedBy, highlighted, onToggle, onAction }: RuleCardProps) {
  const { t } = useTranslation();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const off = rule.enabled === false;
  const notes = [
    shadowedBy && t("rules.neverTakesEffect", { by: shadowedBy }),
    off && t("rules.disabled"),
    rule.observe && t("rules.observing"),
  ].filter(Boolean);

  return (
    <Box id={`rule-${rule.name}`} sx={[listRowSx, (off || Boolean(shadowedBy)) && styles.muted, Boolean(highlighted) && styles.highlighted]}>
      {locked && <LockIcon sx={{ fontSize: 16, color: "text.secondary" }} />}
      <Box sx={styles.main}>
        <RuleSentence rule={rule} appNames={appNames} />
        {notes.length > 0 && <Typography variant="caption" sx={{ color: "text.secondary" }}>{notes.join(" · ")}</Typography>}
      </Box>
      <Chip size="small" variant="outlined" label={t(`rules.effectChip.${rule.effect}`)} sx={{ color: EFFECT_COLOR[rule.effect], borderColor: EFFECT_COLOR[rule.effect] }} />
      {!locked && (
        <>
          <Switch size="small" checked={!off} onChange={(e) => onToggle?.(e.target.checked)} slotProps={{ input: { "aria-label": t("rules.dialog.enabled") } }} />
          <IconButton size="small" aria-label={rule.name} onClick={(e) => setAnchor(e.currentTarget)}>
            <MoreHorizIcon fontSize="small" />
          </IconButton>
          <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={() => setAnchor(null)}>
            {ACTIONS.map((action) => (
              <MenuItem
                key={action}
                sx={action === "delete" ? { color: colors.error } : undefined}
                onClick={() => {
                  setAnchor(null);
                  onAction?.(action);
                }}
              >
                {t(`rules.menu.${action}`)}
              </MenuItem>
            ))}
          </Menu>
        </>
      )}
    </Box>
  );
}

const styles = {
  main: { flex: 1, minWidth: 0, display: "flex", flexDirection: "column" as const },
  muted: { opacity: 0.55 },
  highlighted: { borderColor: "primary.main" },
};
