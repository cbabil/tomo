import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Typography from "@mui/material/Typography";
import { useTranslation } from "react-i18next";
import { colors } from "../../../app/theme";
import { tokenStatus, type TokenStatus } from "../../../lib/tokenStatus";
import { listRowSx } from "./listRow";

export interface TokenRow {
  id: string;
  name: string;
  scope: "manage" | "admin";
  createdAt: string;
  lastUsedAt?: string;
  expiresAt?: string;
  revokedAt?: string;
}

interface TokenTableProps {
  tokens: TokenRow[];
  onRotate: (token: TokenRow) => void;
  onRevoke: (token: TokenRow) => void;
}

const STATUS_COLOR: Record<TokenStatus, string> = {
  active: colors.success,
  expiring: colors.warning,
  expired: colors.textSecondary,
  revoked: colors.error,
};

const formatDate = (iso?: string) => (iso ? new Date(iso).toLocaleDateString() : "");

export function TokenTable({ tokens, onRotate, onRevoke }: TokenTableProps) {
  const { t } = useTranslation();
  if (tokens.length === 0) {
    return <Typography variant="body2" sx={{ color: "text.secondary" }}>{t("tokens.empty")}</Typography>;
  }
  return (
    <Box sx={styles.list}>
      {tokens.map((token) => {
        const status = tokenStatus(token);
        const live = status === "active" || status === "expiring";
        return (
          <Box key={token.id} sx={styles.row}>
            <Box sx={styles.main}>
              <Typography sx={{ fontWeight: 500 }}>{token.name}</Typography>
              <Typography variant="caption" sx={{ color: "text.secondary" }}>
                {t("tokens.rowDetail", {
                  id: token.id,
                  scope: t(`tokens.scopes.${token.scope}`),
                  lastUsed: token.lastUsedAt ? formatDate(token.lastUsedAt) : t("tokens.neverUsed"),
                  expires: token.expiresAt ? formatDate(token.expiresAt) : t("tokens.never"),
                })}
              </Typography>
            </Box>
            <Chip
              size="small"
              label={t(`tokens.status.${status}`)}
              sx={{ color: STATUS_COLOR[status], borderColor: STATUS_COLOR[status] }}
              variant="outlined"
            />
            {live && (
              <>
                <Button size="small" onClick={() => onRotate(token)}>{t("tokens.rotate")}</Button>
                <Button size="small" color="error" onClick={() => onRevoke(token)}>{t("tokens.revoke")}</Button>
              </>
            )}
          </Box>
        );
      })}
    </Box>
  );
}

const styles = {
  list: { display: "flex", flexDirection: "column" as const, gap: 1 },
  row: listRowSx,
  main: { flex: 1, minWidth: 0, display: "flex", flexDirection: "column" as const },
};
