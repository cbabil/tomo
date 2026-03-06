import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";
import { AnimatePresence } from "framer-motion";
import { useAuth } from "../../hooks/useAuth";
import { useStore } from "../../hooks/useStore";
import { Desktop } from "../../components/desktop/Desktop";
import { SheetLayout } from "../../components/sheets/SheetLayout";
import { AppStoreSheet } from "../../components/sheets/AppStoreSheet";
import { SettingsSheet } from "../../components/sheets/SettingsSheet";
import { SystemSheet } from "../../components/sheets/SystemSheet";

const isDev = import.meta.env.DEV;

export function DesktopPage() {
  const navigate = useNavigate();
  const { isAuthenticated, isLoading, hasUser, hasUserLoading } = useAuth();
  const activeSheet = useStore((s) => s.activeSheet);
  const closeSheet = useStore((s) => s.closeSheet);

  useEffect(() => {
    if (isDev) return;
    if (isLoading || hasUserLoading) return;
    if (!hasUser) {
      navigate("/onboarding", { replace: true });
    } else if (!isAuthenticated) {
      navigate("/login", { replace: true });
    }
  }, [isAuthenticated, isLoading, hasUser, hasUserLoading, navigate]);

  if (!isDev && (isLoading || hasUserLoading)) {
    return (
      <Box sx={styles.loading}>
        <CircularProgress sx={{ color: "primary.main" }} />
      </Box>
    );
  }

  if (!isDev && !isAuthenticated) return null;

  return (
    <>
      <Desktop />
      <AnimatePresence>
        {activeSheet === "appStore" && (
          <SheetLayout key="appStore" title="appStore.title" onClose={closeSheet}>
            <AppStoreSheet />
          </SheetLayout>
        )}
        {activeSheet === "settings" && (
          <SheetLayout key="settings" title="settings.title" onClose={closeSheet}>
            <SettingsSheet />
          </SheetLayout>
        )}
        {activeSheet === "system" && (
          <SheetLayout key="system" title="system.title" onClose={closeSheet}>
            <SystemSheet />
          </SheetLayout>
        )}
      </AnimatePresence>
    </>
  );
}

const styles = {
  loading: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "background.default",
  },
};
