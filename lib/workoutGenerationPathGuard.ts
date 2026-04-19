/**
 * Mechanical guard: legacy deterministic / structure-LLM programme builders.
 * Set BLOCK_LEGACY_WORKOUT_PATHS=1 in .env.local to throw instead of using these paths
 * (proves the unified assistant path is the only surviving generator).
 */

export function assertLegacyWorkoutPathsAllowed(context: string): void {
  if (process.env.BLOCK_LEGACY_WORKOUT_PATHS === "1") {
    throw new Error(
      `[BLOCK_LEGACY_WORKOUT_PATHS] Blocked: ${context}. ` +
        `Legacy builder disabled (set BLOCK_LEGACY_WORKOUT_PATHS=0 or remove to allow).`
    );
  }
}
