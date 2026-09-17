import ButtonBase from "@mui/material/ButtonBase";
import Tooltip from "@mui/material/Tooltip";
import { useTranslation } from "react-i18next";
import { useStore } from "../../hooks/useStore";
import { TomoLogo } from "../ui/TomoLogo";

const MARK_SIZE = 28;
const WORDMARK_COLOR = "rgba(255,255,255,0.9)";

/**
 * Quiet brand signature in the desktop's bottom-left corner, mirroring the
 * version label on the right. Clicking it opens Settings on the Update tab,
 * where version and update details live.
 */
export function DesktopBrand() {
  const { t } = useTranslation();
  const openSettings = useStore((s) => s.openSettings);
  const label = t("desktop.brand.about");

  return (
    <Tooltip title={label} placement="top">
      <ButtonBase
        aria-label={label}
        onClick={() => openSettings("update")}
        sx={styles.root}
      >
        <TomoLogo size={MARK_SIZE} wordmarkColor={WORDMARK_COLOR} />
      </ButtonBase>
    </Tooltip>
  );
}

const styles = {
  root: {
    // Phones give the whole bottom row to the dock.
    display: { xs: "none", sm: "inline-flex" },
    position: "fixed" as const,
    bottom: 16,
    left: 32,
    // Above the wallpaper and content, below sheets and dialogs.
    zIndex: 11,
    opacity: 0.85,
    textShadow: "0 1px 4px rgba(0,0,0,0.5)",
    "&:hover, &:focus-visible": { opacity: 1 },
  },
};
