import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import type { SxProps, Theme } from "@mui/material/styles";
import { colors } from "../../app/theme";

const MARK_TILE = "#4C1D95";
const MARK_OPENING = "#E9DDFF";
const WORDMARK_TO_MARK_RATIO = 0.62;

interface TomoLogoProps {
  /** Height of the mark in pixels; the wordmark scales with it. */
  size?: number;
  /** Wordmark colour; defaults to the theme's primary text colour. */
  wordmarkColor?: string;
  sx?: SxProps<Theme>;
}

/**
 * The Tomo mark: a home with a keyhole, for "local and private".
 * Mirrors public/logo.svg, which serves the favicon and the README.
 */
function TomoMark({ size = 40 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 96 96"
      role="img"
      aria-label="Tomo"
    >
      <rect x="6" y="6" width="84" height="84" rx="24" fill={MARK_TILE} />
      <polygon
        points="48,26 72,45 72,72 24,72 24,45"
        fill={colors.primary}
        stroke={colors.primary}
        strokeWidth="7"
        strokeLinejoin="round"
      />
      <circle cx="48" cy="56" r="6.5" fill={MARK_OPENING} />
      <path d="M44.5 59h7l2.5 14h-12z" fill={MARK_OPENING} />
    </svg>
  );
}

/** Mark plus wordmark lockup used on the login and onboarding screens. */
export function TomoLogo({
  size = 40,
  wordmarkColor = "text.primary",
  sx,
}: TomoLogoProps) {
  return (
    <Box sx={[styles.lockup, ...(Array.isArray(sx) ? sx : [sx])]}>
      <TomoMark size={size} />
      <Typography
        component="span"
        sx={{
          ...styles.wordmark,
          color: wordmarkColor,
          fontSize: size * WORDMARK_TO_MARK_RATIO,
        }}
      >
        tomo
      </Typography>
    </Box>
  );
}

const styles = {
  lockup: {
    display: "inline-flex",
    alignItems: "center",
    gap: 1.25,
  },
  wordmark: {
    fontWeight: 600,
    letterSpacing: "-0.03em",
    lineHeight: 1,
  },
};
