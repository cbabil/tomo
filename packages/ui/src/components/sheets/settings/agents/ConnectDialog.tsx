import { useState } from "react";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import Button from "@mui/material/Button";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Tabs from "@mui/material/Tabs";
import Tab from "@mui/material/Tab";
import Typography from "@mui/material/Typography";
import { useTranslation } from "react-i18next";
import { trpc } from "../../../../lib/trpc";
import { CONNECT_CLIENTS, connectSnippet, type ConnectClient } from "../../../../lib/agents";
import { relativeTime } from "../../../../lib/relativeTime";
import { codeBlockSx, dialogStyles } from "../../../dialogs/styles";

const SEEN_POLL_MS = 3000;

interface ConnectDialogProps {
  /** The agent whose new secret is shown once; null keeps the dialog closed. */
  agent: { id: string; name: string; secret: string } | null;
  onClose: () => void;
}

/** The one-time reveal of a secret, as ready-to-paste configuration, with a live check that it works. */
export function ConnectDialog({ agent, onClose }: ConnectDialogProps) {
  const { t, i18n } = useTranslation();
  const [client, setClient] = useState<ConnectClient>("claudeCode");
  const [copied, setCopied] = useState(false);
  const [openedAt] = useState(() => Date.now());
  /** When this agent last called Tomo, if that was after the dialog opened. */
  const seenAt = (list: Array<{ id: string; lastUsedAt?: string }> | undefined) => {
    const lastUsedAt = list?.find((tok) => tok.id === agent?.id)?.lastUsedAt;
    return lastUsedAt !== undefined && Date.parse(lastUsedAt) >= openedAt - SEEN_POLL_MS ? lastUsedAt : undefined;
  };
  const tokens = trpc.tokens.list.useQuery(undefined, {
    enabled: agent !== null,
    refetchInterval: (query) => (seenAt(query.state.data) ? false : SEEN_POLL_MS),
  });

  const snippet = agent ? connectSnippet(client, agent.secret, window.location.origin) : "";
  const lastUsedAt = seenAt(tokens.data);
  const seen = lastUsedAt !== undefined;

  const copy = async () => {
    await navigator.clipboard.writeText(snippet);
    setCopied(true);
  };
  const close = () => {
    setCopied(false);
    onClose();
  };

  return (
    <Dialog open={agent !== null} maxWidth="sm" fullWidth slotProps={{ paper: { sx: dialogStyles.paper } }}>
      <DialogTitle sx={dialogStyles.title}>{t("tokens.connectTitle", { name: agent?.name })}</DialogTitle>
      <DialogContent sx={dialogStyles.content}>
        <Box sx={dialogStyles.form}>
          <Alert severity="warning">{t("tokens.showOnce")}</Alert>
          <Typography variant="body2" sx={{ color: "text.secondary" }}>{t("tokens.connectIntro")}</Typography>
          <Tabs value={client} onChange={(_, v: ConnectClient) => { setClient(v); setCopied(false); }} sx={styles.tabs}>
            {CONNECT_CLIENTS.map((c) => <Tab key={c} value={c} label={t(`tokens.clients.${c}`)} sx={styles.tab} />)}
          </Tabs>
          <Typography component="pre" sx={styles.snippet}>{snippet}</Typography>
          <Button variant="outlined" onClick={copy}>{copied ? t("tokens.copied") : t("tokens.copy")}</Button>
          <Alert severity={seen ? "success" : "info"}>
            {seen && lastUsedAt
              ? t("tokens.connectSeen", { when: relativeTime(lastUsedAt, Date.now(), i18n.language) })
              : t("tokens.connectWaiting")}
          </Alert>
          <Typography variant="caption" sx={{ color: "text.secondary" }}>{t("tokens.plainHttpWarning")}</Typography>
        </Box>
      </DialogContent>
      <DialogActions sx={dialogStyles.actions}>
        <Button variant="contained" onClick={close}>{t("tokens.done")}</Button>
      </DialogActions>
    </Dialog>
  );
}

const styles = {
  tabs: { minHeight: 36, "& .MuiTabs-indicator": { backgroundColor: "primary.main" } },
  tab: { textTransform: "none" as const, minHeight: 36, fontWeight: 500 },
  snippet: { ...codeBlockSx, userSelect: "all" as const },
};
