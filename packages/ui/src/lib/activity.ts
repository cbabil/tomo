/** Turn audit entries into what the activity list shows: a sentence, day groups, and per-agent summaries. */
import type { TFunction } from "i18next";
import type { AuditEntry, AuditOutcome } from "./router-types";

const MCP_PREFIX = "mcp:";
const REFUSED: AuditOutcome[] = ["denied", "error"];
const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** The tool an entry is about, whether it came over MCP or the plain API. */
export const entryTool = (entry: AuditEntry): string =>
  entry.action.startsWith(MCP_PREFIX) ? entry.action.slice(MCP_PREFIX.length) : entry.action;

export function entryApp(entry: AuditEntry): string | undefined {
  const args = entry.args as { appId?: unknown; name?: unknown; tool?: unknown } | undefined;
  if (typeof args?.appId === "string") return args.appId;
  return typeof args?.name === "string" ? args.name : undefined;
}

/** "Restarts Gitea", "Saved rules", or the raw action when nothing better is known. */
export function describeEntry(
  entry: AuditEntry,
  t: TFunction,
  appNames: Record<string, string>,
  takesApp: (tool: string) => boolean,
): string {
  const tool = entryTool(entry);
  const own = t(`activity.row.${tool}`, { defaultValue: "" });
  if (own) return own;
  const label = t(`rules.tools.${tool}`, { defaultValue: "" });
  if (!label) return entry.action;
  const app = entryApp(entry);
  const name = app ? (appNames[app] ?? app) : "";
  if (!name) return capitalize(label);
  return capitalize(takesApp(tool) ? `${label} ${name}` : `${label} ${t("rules.sentence.on")} ${name}`);
}

export interface DayGroup {
  /** Local date key, e.g. 2026-09-18. */
  day: string;
  entries: AuditEntry[];
}

const dayKey = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/** Entries arrive newest first; keep that order inside and across days. */
export function groupByDay(entries: AuditEntry[]): DayGroup[] {
  const groups: DayGroup[] = [];
  for (const entry of entries) {
    const day = dayKey(entry.time);
    const last = groups[groups.length - 1];
    if (last?.day === day) last.entries.push(entry);
    else groups.push({ day, entries: [entry] });
  }
  return groups;
}

export function dayLabel(day: string, t: TFunction, now: number = Date.now()): string {
  if (day === dayKey(new Date(now).toISOString())) return t("activity.today");
  if (day === dayKey(new Date(now - 24 * 60 * 60 * 1000).toISOString())) return t("activity.yesterday");
  return new Date(`${day}T12:00:00`).toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
}

export interface AgentSummary {
  key: string;
  name: string;
  calls: number;
  refused: number;
  entries: AuditEntry[];
}

/** One summary per caller, busiest first. */
export function groupByAgent(entries: AuditEntry[]): AgentSummary[] {
  const byKey = new Map<string, AgentSummary>();
  for (const entry of entries) {
    const key = entry.principal.id ?? `user:${entry.principal.name}`;
    // The summaries are built here and nowhere else, so they are filled in place rather than copied per entry.
    const found = byKey.get(key) ?? { key, name: entry.principal.name, calls: 0, refused: 0, entries: [] };
    found.calls += 1;
    if (REFUSED.includes(entry.outcome)) found.refused += 1;
    found.entries.push(entry);
    byKey.set(key, found);
  }
  return [...byKey.values()].sort((a, b) => b.calls - a.calls);
}
