import { useState } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import MenuItem from "@mui/material/MenuItem";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useTranslation } from "react-i18next";
import { trpc } from "../../../../lib/trpc";
import { colors } from "../../../../app/theme";
import { usePendingApprovals } from "../../../../hooks/usePendingApprovals";
import { listRowSx } from "../listRow";
import { codeBlockSx } from "../../../dialogs/styles";
import { useAsyncAction } from "../../../../hooks/useAsyncAction";

type Remember = "none" | "allow" | "human_confirm";
const MINUTE_MS = 60 * 1000;
const MAX_REASON = 200;

interface NeedsYouProps {
  /** Names of built-in rules, whose decisions can never be remembered. */
  builtInRules: string[];
  onShowRule: (rule: string) => void;
}

/** Requests waiting for the owner: what, the exact arguments, who asked, time left, and the decision. */
export function NeedsYou({ builtInRules, onShowRule }: NeedsYouProps) {
  const { t } = useTranslation();
  const utils = trpc.useUtils();
  const pending = usePendingApprovals();
  const decide = trpc.guardrails.decide.useMutation();
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [remember, setRemember] = useState<Record<string, Remember>>({});
  const { error, run } = useAsyncAction(() => Promise.all([utils.guardrails.invalidate(), utils.tokens.invalidate()]));

  const handle = (id: string, approved: boolean) => {
    const choice = remember[id] ?? "none";
    return run(() =>
      decide.mutateAsync({
        id,
        approved,
        ...(reasons[id]?.trim() && { reason: reasons[id].trim() }),
        ...(approved && choice !== "none" && { remember: choice }),
      }),
    );
  };

  const items = pending.data ?? [];
  if (items.length === 0) return null;
  return (
    <Box sx={styles.root}>
      <Typography variant="caption" sx={{ color: colors.warning, fontWeight: 600 }}>{t("activity.needsYou")}</Typography>
      {error && <Alert severity="error">{error}</Alert>}
      {items.map((item) => {
        const floor = item.rule !== undefined && builtInRules.includes(item.rule);
        const minutes = Math.max(0, Math.ceil((Date.parse(item.expiresAt) - Date.now()) / MINUTE_MS));
        return (
          <Box key={item.id} sx={[listRowSx, styles.card]}>
            <Typography sx={{ fontWeight: 500 }}>{item.summary}</Typography>
            <Typography variant="caption" sx={{ color: "text.secondary" }}>
              {t("activity.askedBy", { name: item.tokenName, count: minutes })}
              {item.rule && (
                <>
                  {" · "}
                  <Box component="span" sx={styles.link} onClick={() => onShowRule(item.rule ?? "")}>{t("activity.rule", { rule: item.rule })}</Box>
                </>
              )}
            </Typography>
            <Typography component="pre" sx={styles.args}>{`${item.tool} ${JSON.stringify(item.args, null, 2)}`}</Typography>
            <Box sx={styles.controls}>
              <TextField
                size="small"
                placeholder={t("activity.reason")}
                value={reasons[item.id] ?? ""}
                onChange={(e) => setReasons((r) => ({ ...r, [item.id]: e.target.value.slice(0, MAX_REASON) }))}
                sx={{ flex: 1, minWidth: 180 }}
              />
              <TextField
                select
                size="small"
                value={floor ? "none" : (remember[item.id] ?? "none")}
                disabled={floor}
                helperText={floor ? t("activity.remember.floor") : undefined}
                onChange={(e) => setRemember((r) => ({ ...r, [item.id]: e.target.value as Remember }))}
                sx={{ minWidth: 170 }}
              >
                {(["none", "allow", "human_confirm"] as Remember[]).map((r) => <MenuItem key={r} value={r}>{t(`activity.remember.${r}`)}</MenuItem>)}
              </TextField>
              <Button size="small" color="error" disabled={decide.isPending} onClick={() => handle(item.id, false)}>{t("activity.deny")}</Button>
              <Button size="small" variant="contained" disabled={decide.isPending} onClick={() => handle(item.id, true)}>{t("activity.approve")}</Button>
            </Box>
          </Box>
        );
      })}
    </Box>
  );
}

const styles = {
  root: { display: "flex", flexDirection: "column" as const, gap: 1 },
  card: { flexDirection: "column" as const, alignItems: "stretch", gap: 0.75, borderColor: colors.warning },
  args: { ...codeBlockSx, maxHeight: 140 },
  controls: { display: "flex", alignItems: "flex-start", gap: 1, flexWrap: "wrap" as const },
  link: { color: colors.iconHover, cursor: "pointer" },
};
