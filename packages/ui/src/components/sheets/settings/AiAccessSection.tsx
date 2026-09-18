import { useState } from "react";
import Badge from "@mui/material/Badge";
import Box from "@mui/material/Box";
import Tabs from "@mui/material/Tabs";
import Tab from "@mui/material/Tab";
import { useTranslation } from "react-i18next";
import { useStore } from "../../../hooks/useStore";
import { usePendingApprovals } from "../../../hooks/usePendingApprovals";
import { AI_ACCESS_PANELS, type AiAccessPanel } from "../../../types";
import { AgentsPanel } from "./agents/AgentsPanel";
import { RulesPanel } from "./rules/RulesPanel";
import { ActivityPanel } from "./activity/ActivityPanel";

/** Settings tab for agents: who can reach Tomo, the rules they follow, and what they did. */
export function AiAccessSection() {
  const { t } = useTranslation();
  const panel = useStore((s) => s.aiAccessPanel);
  const setPanel = useStore((s) => s.setAiAccessPanel);
  const waiting = usePendingApprovals().data?.length ?? 0;
  const [agentFilter, setAgentFilter] = useState<string | undefined>();
  const [ruleFocus, setRuleFocus] = useState<string | undefined>();

  const showActivity = (agentId: string) => {
    setAgentFilter(agentId);
    setPanel("activity");
  };
  const showRule = (rule: string) => {
    setRuleFocus(rule);
    setPanel("rules");
  };

  return (
    <Box sx={styles.root}>
      <Tabs value={panel} onChange={(_, v: AiAccessPanel) => setPanel(v)} sx={styles.tabs}>
        {AI_ACCESS_PANELS.map((key) => (
          <Tab
            key={key}
            value={key}
            sx={styles.tab}
            label={
              <Badge color="warning" badgeContent={key === "activity" ? waiting : 0} sx={styles.badge}>
                {t(`aiAccess.panels.${key}`)}
              </Badge>
            }
          />
        ))}
      </Tabs>
      {panel === "agents" && <AgentsPanel onShowActivity={showActivity} />}
      {panel === "rules" && <RulesPanel key={ruleFocus} highlight={ruleFocus} />}
      {panel === "activity" && <ActivityPanel key={agentFilter} agentId={agentFilter} onShowRule={showRule} />}
    </Box>
  );
}

const styles = {
  root: { display: "flex", flexDirection: "column" as const, gap: 2 },
  tabs: { minHeight: 40, "& .MuiTabs-indicator": { backgroundColor: "primary.main" } },
  tab: { textTransform: "none" as const, minHeight: 40, fontWeight: 500, overflow: "visible" },
  badge: { "& .MuiBadge-badge": { right: -12, top: 2 } },
};
