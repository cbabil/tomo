import { useMemo } from "react";
import { trpc } from "../lib/trpc";

/** Tools whose label takes the app as its object: "restarts Nextcloud". */
const TAKES_APP = new Set(["operate", "install", "remove"]);
export const ANY_TOOL = "*";

/** The tools agents can call, as the backend defines them, with their group for pickers and grammar. */
export function useTools() {
  const query = trpc.guardrails.tools.useQuery(undefined, { staleTime: Infinity });
  return useMemo(() => {
    const tools = query.data ?? [];
    const groups = new Map(tools.map((tool) => [tool.name, tool.group]));
    const groupOf = (tool: string): string => groups.get(tool) ?? "any";
    return { tools, groupOf, takesApp: (tool: string) => TAKES_APP.has(groupOf(tool)) };
  }, [query.data]);
}
