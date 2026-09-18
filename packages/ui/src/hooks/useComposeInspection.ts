import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { trpc } from "../lib/trpc";
import { useDebounce } from "./useDebounce";

const INSPECT_DEBOUNCE_MS = 500;

export interface InspectionNotice {
  severity: "info" | "warning";
  text: string;
}

/**
 * Reads a pasted compose file as the user types: prefills the container port
 * when the YAML makes it obvious, and explains what the install will do with
 * a published port, or why the YAML cannot be used yet.
 *
 * @param onPortDetected called once with the detected port while the field is empty
 */
export function useComposeInspection(
  composeYaml: string,
  name: string,
  port: string,
  onPortDetected: (port: string) => void,
): InspectionNotice | undefined {
  const { t } = useTranslation();
  // Every input is part of the query key, so all of them wait for typing to
  // pause. Debouncing a string key keeps the wait from restarting on renders
  // that changed nothing.
  const typedPort = parseInt(port, 10);
  const key = useDebounce(
    JSON.stringify({
      composeYaml: composeYaml.trim(),
      name,
      containerPort: isNaN(typedPort) ? undefined : typedPort,
    }),
    INSPECT_DEBOUNCE_MS,
  );
  const request = JSON.parse(key) as { composeYaml: string; name: string; containerPort?: number };
  const active = request.composeYaml.length > 0;
  const inspection = trpc.apps.custom.inspectCompose.useQuery(request, { enabled: active });
  const data = active ? inspection.data : undefined;

  useEffect(() => {
    if (port === "" && data?.containerPort) onPortDetected(String(data.containerPort));
  }, [data?.containerPort, port, onPortDetected]);

  if (!data) return undefined;
  if (data.error) return { severity: "warning", text: t("customApp.yamlProblem", { error: data.error }) };
  if (data.publishedMapping) {
    return {
      severity: "info",
      text: t("customApp.willUnpublish", { port: data.containerPort, mapping: data.publishedMapping }),
    };
  }
  if (data.containerPort) {
    return { severity: "info", text: t("customApp.detectedPort", { port: data.containerPort }) };
  }
  return undefined;
}
