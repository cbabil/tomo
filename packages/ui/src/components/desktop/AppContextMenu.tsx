import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import StopIcon from "@mui/icons-material/Stop";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import RestartAltIcon from "@mui/icons-material/RestartAlt";
import SystemUpdateAltIcon from "@mui/icons-material/SystemUpdateAlt";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import EditIcon from "@mui/icons-material/Edit";
import DescriptionOutlinedIcon from "@mui/icons-material/DescriptionOutlined";
import { useTranslation } from "react-i18next";
import { colors } from "../../app/theme";
import { isBusyStatus } from "../../lib/appStatus";
import type { InstalledApp } from "../../types";

export type AppAction = "start" | "stop" | "restart" | "update" | "remove" | "edit" | "logs";

interface AppContextMenuProps {
  anchor: HTMLElement | null;
  app: InstalledApp | null;
  onClose: () => void;
  onAction: (action: AppAction) => void;
}

interface Item {
  action: AppAction;
  icon: React.ReactElement;
  danger?: boolean;
}

const iconSx = { color: "text.secondary" };

/** Which actions make sense for an app, given its type and current state. */
function itemsFor(app: InstalledApp): Item[] {
  const edit: Item = { action: "edit", icon: <EditIcon fontSize="small" sx={iconSx} /> };
  const remove: Item = {
    action: "remove",
    icon: <DeleteOutlineIcon fontSize="small" sx={{ color: "error.main" }} />,
    danger: true,
  };
  if (app.type === "external") return [edit, remove];

  // Store apps take their presentation from the manifest and update through the store.
  const ownedByUser = app.type === "custom" || app.type === "template";
  const busy = isBusyStatus(app.status);
  const power: Item =
    app.status === "stopped"
      ? { action: "start", icon: <PlayArrowIcon fontSize="small" sx={iconSx} /> }
      : { action: "stop", icon: <StopIcon fontSize="small" sx={iconSx} /> };

  return [
    ...(ownedByUser ? [edit] : []),
    ...(busy ? [] : [power, { action: "restart" as const, icon: <RestartAltIcon fontSize="small" sx={iconSx} /> }]),
    ...(ownedByUser && !busy
      ? [{ action: "update" as const, icon: <SystemUpdateAltIcon fontSize="small" sx={iconSx} /> }]
      : []),
    { action: "logs", icon: <DescriptionOutlinedIcon fontSize="small" sx={iconSx} /> },
    ...(busy ? [] : [remove]),
  ];
}

export function AppContextMenu({ anchor, app, onClose, onAction }: AppContextMenuProps) {
  const { t } = useTranslation();
  return (
    <Menu
      open={Boolean(anchor && app)}
      anchorEl={anchor}
      onClose={onClose}
      slotProps={{ paper: { sx: styles.menuPaper } }}
    >
      {app &&
        itemsFor(app).map(({ action, icon, danger }) => (
          <MenuItem key={action} onClick={() => onAction(action)}>
            <ListItemIcon>{icon}</ListItemIcon>
            <ListItemText sx={danger ? { color: "error.main" } : undefined}>
              {t(`desktop.apps.${action}`)}
            </ListItemText>
          </MenuItem>
        ))}
    </Menu>
  );
}

const styles = {
  menuPaper: {
    backgroundColor: colors.surface,
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: 2,
  },
};
