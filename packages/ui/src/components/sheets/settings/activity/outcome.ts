import { colors } from "../../../../app/theme";
import type { AuditOutcome } from "../../../../lib/router-types";

/** Filter chip order and the colour each outcome carries across the activity views. */
export const OUTCOMES: AuditOutcome[] = ["pending", "ok", "restated", "observed", "denied", "error"];

export const OUTCOME_COLOR: Record<AuditOutcome, string> = {
  ok: colors.success,
  restated: colors.info,
  observed: colors.textSecondary,
  pending: colors.warning,
  denied: colors.error,
  error: colors.error,
};
