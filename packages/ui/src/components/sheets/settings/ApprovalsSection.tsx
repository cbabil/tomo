import { useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import Alert from "@mui/material/Alert";
import { useTranslation } from "react-i18next";
import { trpc } from "../../../lib/trpc";
import { usePendingApprovals } from "../../../hooks/usePendingApprovals";
import { listRowSx } from "./listRow";

/** Changes an agent asked for that need a person to approve or deny. */
export function ApprovalsSection() {
  const { t } = useTranslation();
  const utils = trpc.useUtils();
  const pending = usePendingApprovals();
  const decide = trpc.guardrails.decide.useMutation();
  const [error, setError] = useState("");

  const handle = async (id: string, approved: boolean) => {
    setError("");
    try {
      await decide.mutateAsync({ id, approved });
      await utils.guardrails.pendingApprovals.invalidate();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const items = pending.data ?? [];
  return (
    <Box sx={styles.root}>
      <Typography variant="body2" sx={{ color: "text.secondary" }}>{t("approvals.intro")}</Typography>
      {error && <Alert severity="error">{error}</Alert>}
      {items.length === 0 && <Typography variant="body2" sx={{ color: "text.secondary" }}>{t("approvals.empty")}</Typography>}
      {items.map((item) => (
        <Box key={item.id} sx={listRowSx}>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography sx={{ fontWeight: 500 }}>{item.summary}</Typography>
            <Typography variant="caption" sx={{ color: "text.secondary" }}>
              {t("approvals.askedBy", { name: item.tokenName, time: new Date(item.createdAt).toLocaleTimeString() })}
            </Typography>
          </Box>
          <Button size="small" color="error" disabled={decide.isPending} onClick={() => handle(item.id, false)}>
            {t("approvals.deny")}
          </Button>
          <Button size="small" variant="contained" disabled={decide.isPending} onClick={() => handle(item.id, true)}>
            {t("approvals.approve")}
          </Button>
        </Box>
      ))}
    </Box>
  );
}

const styles = {
  root: { display: "flex", flexDirection: "column" as const, gap: 1.5 },
};
