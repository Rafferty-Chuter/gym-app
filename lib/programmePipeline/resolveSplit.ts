import type { SplitDefinition } from "@/lib/splitDefinition";
import type { ParsedProgrammeRequest } from "./types";
import { resolveMuscleGroupingsOnly } from "./resolveMuscleGroupingsOnly";

/**
 * @deprecated Use `resolveMuscleGroupingsOnly` — kept as alias for the assistant route.
 */
export function resolveSplitDefinitionForRequest(
  parsed: ParsedProgrammeRequest,
  rawMessage: string
): SplitDefinition | null {
  return resolveMuscleGroupingsOnly(parsed, rawMessage);
}
