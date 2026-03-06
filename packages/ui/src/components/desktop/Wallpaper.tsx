import Box from "@mui/material/Box";
import { motion, AnimatePresence } from "framer-motion";
import { useStore } from "../../hooks/useStore";
import { defaultGradient } from "../../styles/shared";

function isValidImageUrl(url: string): boolean {
  try {
    const parsed = new URL(url, window.location.origin);
    return ["http:", "https:", "data:"].includes(parsed.protocol);
  } catch {
    return false;
  }
}

export function Wallpaper() {
  const wallpaper = useStore((s) => s.wallpaper);
  const isCustom = wallpaper !== "default" && wallpaper !== "";

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={wallpaper}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.6 }}
        style={containerStyle}
      >
        <Box
          sx={{
            position: "absolute",
            inset: 0,
            background: isCustom ? undefined : defaultGradient,
            backgroundImage:
              isCustom && isValidImageUrl(wallpaper)
                ? `url(${wallpaper})`
                : undefined,
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        />
      </motion.div>
    </AnimatePresence>
  );
}

const containerStyle: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  zIndex: 0,
};
