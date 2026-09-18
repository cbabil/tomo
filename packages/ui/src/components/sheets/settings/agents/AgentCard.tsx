import { useState } from "react";
import Avatar from "@mui/material/Avatar";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import IconButton from "@mui/material/IconButton";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import Typography from "@mui/material/Typography";
import MoreHorizIcon from "@mui/icons-material/MoreHoriz";
import { useTranslation } from "react-i18next";
import { colors } from "../../../../app/theme";
import { idleDays, tokenStatus, type TokenStatus } from "../../../../lib/tokenStatus";
import { relativeTime } from "../../../../lib/relativeTime";
import { listRowSx } from "../listRow";

export interface Agent {
  id: string;
  name: string;
  scope: "manage" | "admin";
  createdAt: string;
  lastUsedAt?: string;
  expiresAt?: string;
  revokedAt?: string;
  note?: string;
  previousGraceUntil?: string;
  previousLastUsedAt?: string;
}

interface AgentCardProps {
  agent: Agent;
  /** Approvals this agent is waiting on. */
  waiting: number;
  onRegenerate: () => void;
  onRevoke: () => void;
  onEditNote: () => void;
  onShowActivity: () => void;
}

const STATUS_COLOR: Record<TokenStatus, string> = {
  active: colors.success,
  expiring: colors.warning,
  expired: colors.textSecondary,
  revoked: colors.error,
  idle: colors.textSecondary,
};

const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("");

/** One agent: who it is, what it may do, how fresh its token is, and what it is waiting on. */
export function AgentCard({ agent, waiting, onRegenerate, onRevoke, onEditNote, onShowActivity }: AgentCardProps) {
  const { t, i18n } = useTranslation();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const status = tokenStatus(agent);
  const live = status !== "revoked" && status !== "expired";
  const inGrace = agent.previousGraceUntil !== undefined && Date.parse(agent.previousGraceUntil) > Date.now();

  const details = [
    t(`tokens.can.${agent.scope}`),
    agent.lastUsedAt ? t("tokens.lastSeen", { when: relativeTime(agent.lastUsedAt, Date.now(), i18n.language) }) : t("tokens.neverSeen"),
    agent.expiresAt ? t("tokens.expiresOn", { date: new Date(agent.expiresAt).toLocaleDateString() }) : t("tokens.never"),
  ];
  const statusLabel = status === "idle" ? t("tokens.unused", { count: idleDays(agent) }) : t(`tokens.status.${status}`);
  const closeMenu = (action: () => void) => () => {
    setAnchor(null);
    action();
  };

  return (
    <Box sx={[listRowSx, !live && styles.muted]}>
      <Avatar sx={styles.avatar}>{initials(agent.name)}</Avatar>
      <Box sx={styles.main}>
        <Box sx={styles.titleRow}>
          <Typography sx={{ fontWeight: 500 }}>{agent.name}</Typography>
          {waiting > 0 && (
            <Chip size="small" label={t("approvals.waiting", { count: waiting })} onClick={onShowActivity} sx={styles.waiting} />
          )}
          {status !== "active" && (
            <Chip size="small" variant="outlined" label={statusLabel} sx={{ color: STATUS_COLOR[status], borderColor: STATUS_COLOR[status] }} />
          )}
        </Box>
        <Typography variant="caption" sx={{ color: "text.secondary" }}>{details.join(" · ")}</Typography>
        {agent.note && <Typography variant="caption" sx={{ color: "text.secondary" }}>{agent.note}</Typography>}
        {inGrace && agent.previousGraceUntil && (
          <Typography variant="caption" sx={{ color: colors.warning }}>
            {t("tokens.graceUntil", { time: new Date(agent.previousGraceUntil).toLocaleString() })}
            {" · "}
            {agent.previousLastUsedAt
              ? t("tokens.oldSecretUsed", { when: relativeTime(agent.previousLastUsedAt, Date.now(), i18n.language) })
              : t("tokens.oldSecretUnused")}
          </Typography>
        )}
      </Box>
      {live && <Button size="small" onClick={onRegenerate}>{t("tokens.regenerate")}</Button>}
      <IconButton size="small" aria-label={agent.name} onClick={(e) => setAnchor(e.currentTarget)}>
        <MoreHorizIcon fontSize="small" />
      </IconButton>
      <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={() => setAnchor(null)}>
        <MenuItem onClick={closeMenu(onShowActivity)}>{t("aiAccess.panels.activity")}</MenuItem>
        {live && <MenuItem onClick={closeMenu(onEditNote)}>{t("tokens.editNote")}</MenuItem>}
        {live && <MenuItem onClick={closeMenu(onRevoke)} sx={{ color: colors.error }}>{t("tokens.revoke")}</MenuItem>}
      </Menu>
    </Box>
  );
}

const styles = {
  muted: { opacity: 0.6 },
  avatar: { width: 36, height: 36, fontSize: "0.8rem", fontWeight: 600, bgcolor: "rgba(145,70,255,0.18)", color: colors.iconHover },
  main: { flex: 1, minWidth: 0, display: "flex", flexDirection: "column" as const },
  titleRow: { display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" as const },
  waiting: { bgcolor: "rgba(245,158,11,0.18)", color: colors.warning, fontWeight: 600 },
};
