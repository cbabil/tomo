import { useMemo, useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import Alert from "@mui/material/Alert";
import { useTranslation } from "react-i18next";
import { trpc } from "../../../../lib/trpc";
import { usePendingApprovals } from "../../../../hooks/usePendingApprovals";
import { useAsyncAction } from "../../../../hooks/useAsyncAction";
import { ConfirmDialog } from "../../../dialogs/ConfirmDialog";
import { AgentCard, type Agent } from "./AgentCard";
import { AddAgentDialog } from "./AddAgentDialog";
import { ConnectDialog } from "./ConnectDialog";
import { RegenerateDialog } from "./RegenerateDialog";
import { NoteDialog } from "./NoteDialog";

interface AgentsPanelProps {
  /** Open the activity panel, filtered to one agent. */
  onShowActivity: (agentId: string) => void;
}

/** Every agent that can reach Tomo, with the actions that keep its token healthy. */
export function AgentsPanel({ onShowActivity }: AgentsPanelProps) {
  const { t } = useTranslation();
  const utils = trpc.useUtils();
  const agents = trpc.tokens.list.useQuery();
  const pending = usePendingApprovals();
  const rotate = trpc.tokens.rotate.useMutation();
  const revoke = trpc.tokens.revoke.useMutation();
  const update = trpc.tokens.update.useMutation();

  const [adding, setAdding] = useState(false);
  const [connecting, setConnecting] = useState<{ id: string; name: string; secret: string } | null>(null);
  const [regenerating, setRegenerating] = useState<Agent | null>(null);
  const [revoking, setRevoking] = useState<Agent | null>(null);
  const [noting, setNoting] = useState<Agent | null>(null);
  const { error, run } = useAsyncAction(() => utils.tokens.list.invalidate());

  const handleRegenerate = (graceMinutes: number) =>
    run(async () => {
      if (!regenerating) return;
      const result = await rotate.mutateAsync({ id: regenerating.id, graceMinutes });
      setConnecting({ id: regenerating.id, name: regenerating.name, secret: result.token });
      setRegenerating(null);
    });
  const handleRevoke = () =>
    run(async () => {
      if (!revoking) return;
      await revoke.mutateAsync({ id: revoking.id });
      setRevoking(null);
    });
  const handleNote = (note: string) =>
    run(async () => {
      if (!noting) return;
      await update.mutateAsync({ id: noting.id, note });
      setNoting(null);
    });

  const waiting = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of pending.data ?? []) counts.set(p.tokenId, (counts.get(p.tokenId) ?? 0) + 1);
    return counts;
  }, [pending.data]);
  const list = agents.data ?? [];

  return (
    <Box sx={styles.root}>
      <Box sx={styles.header}>
        <Typography variant="body2" sx={{ color: "text.secondary", flex: 1 }}>{t("tokens.intro")}</Typography>
        <Button variant="contained" size="small" onClick={() => setAdding(true)} sx={{ flexShrink: 0 }}>{t("tokens.addAgent")}</Button>
      </Box>
      {error && <Alert severity="error">{error}</Alert>}
      {list.length === 0 && <Typography variant="body2" sx={{ color: "text.secondary" }}>{t("tokens.empty")}</Typography>}
      {list.map((agent) => (
        <AgentCard
          key={agent.id}
          agent={agent}
          waiting={waiting.get(agent.id) ?? 0}
          onRegenerate={() => setRegenerating(agent)}
          onRevoke={() => setRevoking(agent)}
          onEditNote={() => setNoting(agent)}
          onShowActivity={() => onShowActivity(agent.id)}
        />
      ))}

      <AddAgentDialog
        open={adding}
        onClose={() => setAdding(false)}
        onCreated={(created) => {
          setConnecting(created);
          void utils.tokens.list.invalidate();
        }}
      />
      <ConnectDialog agent={connecting} onClose={() => setConnecting(null)} />
      <RegenerateDialog name={regenerating?.name ?? null} pending={rotate.isPending} onConfirm={handleRegenerate} onClose={() => setRegenerating(null)} />
      <NoteDialog agent={noting} pending={update.isPending} onSave={handleNote} onClose={() => setNoting(null)} />
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
    </Box>
  );
}

const styles = {
  root: { display: "flex", flexDirection: "column" as const, gap: 1.5 },
  header: { display: "flex", alignItems: "flex-start", gap: 2 },
};
