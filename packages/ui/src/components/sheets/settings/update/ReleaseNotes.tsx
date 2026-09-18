import { useMemo } from "react";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import Link from "@mui/material/Link";
import Typography from "@mui/material/Typography";
import { useTranslation } from "react-i18next";
import { parseReleaseNotes } from "../../../../lib/releaseNotes";
import { relativeTime } from "../../../../lib/relativeTime";
import type { ReleaseInfo } from "../../../../lib/router-types";
import { listRowSx } from "../listRow";

/** One release: its version, when it came out, and what changed, grouped as the notes group it. */
export function ReleaseNotes({ release }: { release: ReleaseInfo }) {
  const { t, i18n } = useTranslation();
  const sections = useMemo(() => parseReleaseNotes(release.notes), [release.notes]);
  return (
    <Box sx={[listRowSx, styles.card]}>
      <Box sx={styles.header}>
        <Typography sx={{ fontWeight: 600 }}>{release.version}</Typography>
        <Typography variant="caption" sx={{ color: "text.secondary", flex: 1 }}>
          {relativeTime(release.publishedAt, Date.now(), i18n.language)}
        </Typography>
        <Link href={release.url} target="_blank" rel="noreferrer" variant="caption" underline="hover">
          {t("settings.update.viewOnGitHub")}
        </Link>
      </Box>
      {sections.length === 0 && <Typography variant="body2" sx={{ color: "text.secondary" }}>{t("settings.update.noNotes")}</Typography>}
      {sections.map((section) => (
        <Box key={section.title}>
          {section.title && <Typography variant="caption" sx={{ color: "text.secondary" }}>{section.title}</Typography>}
          {section.items.map((item) => (
            <Box key={item.text} sx={styles.item}>
              {item.scope && <Chip size="small" variant="outlined" label={item.scope} sx={styles.scope} />}
              <Typography variant="body2">{item.text}</Typography>
            </Box>
          ))}
        </Box>
      ))}
    </Box>
  );
}

const styles = {
  card: { flexDirection: "column" as const, alignItems: "stretch", gap: 1 },
  header: { display: "flex", alignItems: "baseline", gap: 1 },
  item: { display: "flex", alignItems: "baseline", gap: 1, py: 0.25 },
  scope: { height: 20, fontSize: "0.7rem", color: "text.secondary", flexShrink: 0 },
};
