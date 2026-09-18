import { useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import Alert from "@mui/material/Alert";
import Tabs from "@mui/material/Tabs";
import Tab from "@mui/material/Tab";
import { useTranslation } from "react-i18next";
import { trpc } from "../../../lib/trpc";
import { TokenDialog, SecretRevealDialog } from "../../dialogs/TokenDialog";
import { ConfirmDialog } from "../../dialogs/ConfirmDialog";
import { TokenTable, type TokenRow } from "./TokenTable";
import { TokenActivity } from "./TokenActivity";
import { GuardrailsSection } from "./GuardrailsSection";
import { ApprovalsSection } from "./ApprovalsSection";

const PANELS = ["tokens", "guardrails", "approvals", "activity"] as const;
type Panel = (typeof PANELS)[number];

/** Settings tab: API tokens for agents and scripts, and what they did. */
export function AiAccessSection() {
  const { t } = useTranslation();
  const utils = trpc.useUtils();
  const tokensQuery = trpc.tokens.list.useQuery();
  const rotate = trpc.tokens.rotate.useMutation();
  const revoke = trpc.tokens.revoke.useMutation();

  const [creating, setCreating] = useState(false);
  const [rotating, setRotating] = useState<TokenRow | null>(null);
  const [reveal, setReveal] = useState<{ title: string; secret: string } | null>(null);
  const [revoking, setRevoking] = useState<TokenRow | null>(null);
  const [error, setError] = useState("");
  const [panel, setPanel] = useState<Panel>("tokens");

  const refresh = () => Promise.all([utils.tokens.list.invalidate(), utils.tokens.activity.invalidate()]);

  const handleRotate = async () => {
    if (!rotating) return;
    setError("");
    try {
      const result = await rotate.mutateAsync({ id: rotating.id });
      setRotating(null);
      setReveal({ title: t("tokens.rotatedTitle"), secret: result.token });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleRevoke = async () => {
    if (!revoking) return;
    setError("");
    try {
      await revoke.mutateAsync({ id: revoking.id });
      setRevoking(null);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <Box sx={styles.root}>
      <Tabs value={panel} onChange={(_, v: Panel) => setPanel(v)} sx={styles.tabs}>
        {PANELS.map((key) => <Tab key={key} value={key} label={t(`aiAccess.panels.${key}`)} sx={styles.tab} />)}
      </Tabs>

      {panel === "tokens" && (
        <>
          <Typography variant="body2" sx={{ color: "text.secondary" }}>
            {t("tokens.intro")}
          </Typography>
          {error && <Alert severity="error">{error}</Alert>}
          <Box sx={styles.header}>
            <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>{t("tokens.title")}</Typography>
            <Button variant="contained" size="small" onClick={() => setCreating(true)}>
              {t("tokens.create")}
            </Button>
          </Box>
          <TokenTable
            tokens={tokensQuery.data ?? []}
            onRotate={setRotating}
            onRevoke={setRevoking}
          />
        </>
      )}
      {panel === "guardrails" && <GuardrailsSection />}
      {panel === "approvals" && <ApprovalsSection />}
      {panel === "activity" && <TokenActivity />}

      <TokenDialog
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={(token) => {
          setReveal({ title: t("tokens.createdTitle"), secret: token });
          void refresh();
        }}
      />

      <ConfirmDialog
        open={Boolean(rotating)}
        title={t("tokens.rotateTitle", { name: rotating?.name })}
        message={t("tokens.rotateWarning")}
        confirmLabel={t("tokens.rotate")}
        pending={rotate.isPending}
        onConfirm={handleRotate}
        onClose={() => setRotating(null)}
      />
      <ConfirmDialog
        open={Boolean(revoking)}
        title={t("tokens.revokeTitle", { name: revoking?.name })}
        message={t("tokens.revokeWarning")}
        confirmLabel={t("tokens.revoke")}
        destructive
        pending={revoke.isPending}
        onConfirm={handleRevoke}
        onClose={() => setRevoking(null)}
      />

      <SecretRevealDialog
        title={reveal?.title ?? ""}
        secret={reveal?.secret ?? null}
        onClose={() => setReveal(null)}
      />
    </Box>
  );
}

const styles = {
  root: { display: "flex", flexDirection: "column" as const, gap: 2 },
  tabs: { minHeight: 40, "& .MuiTabs-indicator": { backgroundColor: "primary.main" } },
  tab: { textTransform: "none" as const, minHeight: 40, fontWeight: 500 },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottom: 1,
    borderColor: "divider",
    pb: 1,
  },
};
