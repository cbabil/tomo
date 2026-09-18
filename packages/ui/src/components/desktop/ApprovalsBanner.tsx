import Tooltip from "@mui/material/Tooltip";
import IconButton from "@mui/material/IconButton";
import Badge from "@mui/material/Badge";
import HowToRegIcon from "@mui/icons-material/HowToReg";
import { useTranslation } from "react-i18next";
import { useStore } from "../../hooks/useStore";
import { colors } from "../../app/theme";
import { usePendingApprovals } from "../../hooks/usePendingApprovals";

/** Shows when an agent is waiting for a person to approve something; opens the approvals list. */
export function ApprovalsBanner() {
  const { t } = useTranslation();
  const openSettings = useStore((s) => s.openSettings);
  const pending = usePendingApprovals();
  const count = pending.data?.length ?? 0;
  if (count === 0) return null;

  const label = t("approvals.waiting", { count });
  return (
    <Tooltip title={label} placement="bottom">
      <IconButton onClick={() => openSettings("aiAccess", "activity")} aria-label={label} sx={styles.button}>
        <Badge badgeContent={count} color="primary">
          <HowToRegIcon sx={styles.icon} />
        </Badge>
      </IconButton>
    </Tooltip>
  );
}

const styles = {
  button: { color: colors.warning },
  icon: { fontSize: 22 },
};
