/**
 * Registry of every browser-storage key the app writes. The backup export
 * (`lib/devDataTransfer.ts`) is derived from this list, so a key that isn't
 * registered here is a key that silently won't be backed up.
 *
 * Add new keys here, never inline.
 */

export type StorageScope = "local" | "session";

export type StorageKeyEntry = {
  key: string;
  scope: StorageScope;
  /** Bump when the stored shape changes incompatibly; migrations key off it. */
  version: number;
  /** Included in the Data tools export/import. Session keys never are. */
  includeInBackup: boolean;
  /** Module that owns reads and writes. */
  owner: string;
};

export const STORAGE_KEYS = [
  // ── Training ──
  { key: "workoutHistory", scope: "local", version: 1, includeInBackup: true, owner: "lib/workout-store.tsx" },
  { key: "workoutTemplates", scope: "local", version: 1, includeInBackup: true, owner: "lib/templateStorage.ts" },
  { key: "activeWorkout", scope: "local", version: 1, includeInBackup: true, owner: "lib/activeWorkout.ts" },
  { key: "userExerciseLibrary", scope: "local", version: 1, includeInBackup: true, owner: "lib/userExerciseLibrary.ts" },
  { key: "restTimerNotifySettings", scope: "local", version: 1, includeInBackup: true, owner: "lib/restTimerSettings.ts" },
  { key: "volumeEnabledOptionalGroups", scope: "local", version: 1, includeInBackup: true, owner: "(legacy, unused since CL1)" },
  // ── Profile / prefs ──
  { key: "onboardingProfile", scope: "local", version: 1, includeInBackup: true, owner: "lib/onboardingProfile.ts" },
  { key: "userCoachingProfile", scope: "local", version: 1, includeInBackup: true, owner: "lib/userProfile.ts (legacy, read-only)" },
  { key: "weightUnit", scope: "local", version: 1, includeInBackup: true, owner: "lib/unit-preference.tsx" },
  { key: "appearance", scope: "local", version: 1, includeInBackup: true, owner: "lib/ui/appearance.ts" },
  { key: "heightUnit", scope: "local", version: 1, includeInBackup: true, owner: "lib/ui/heightUnit.ts" },
  { key: "trainingFocus", scope: "local", version: 1, includeInBackup: true, owner: "lib/trainingFocus.tsx" },
  { key: "experienceLevel", scope: "local", version: 1, includeInBackup: true, owner: "lib/experienceLevel.tsx" },
  { key: "priorityGoal", scope: "local", version: 1, includeInBackup: true, owner: "lib/priorityGoal.tsx" },
  { key: "onboardingComplete", scope: "local", version: 1, includeInBackup: true, owner: "(legacy, unused)" },
  // ── Assistant ──
  { key: "assistantThreadsV1", scope: "local", version: 1, includeInBackup: true, owner: "lib/assistantThreads.ts" },
  { key: "assistantActiveThreadIdV1", scope: "local", version: 1, includeInBackup: true, owner: "lib/assistantThreads.ts" },
  { key: "assistantUserId", scope: "local", version: 1, includeInBackup: true, owner: "lib/assistantThreads.ts" },
  { key: "assistantClientId", scope: "local", version: 1, includeInBackup: true, owner: "app/assistant/page.tsx" },
  { key: "assistantSelectiveMemoryV1", scope: "local", version: 1, includeInBackup: true, owner: "lib/assistantMemory.ts" },
  { key: "assistantMemory", scope: "local", version: 1, includeInBackup: true, owner: "lib/assistantMemory.ts (USER MEMORY)" },
  { key: "assistantLastChatDate", scope: "local", version: 1, includeInBackup: false, owner: "app/assistant/page.tsx" },
  { key: "assistantUseLongTermMemory", scope: "local", version: 1, includeInBackup: false, owner: "app/assistant/page.tsx" },
  // ── Physique (P1) ──
  { key: "physique.v1.weighIns", scope: "local", version: 1, includeInBackup: true, owner: "lib/physique/io/repos.ts" },
  { key: "physique.v1.foodEntries", scope: "local", version: 1, includeInBackup: true, owner: "lib/physique/io/repos.ts" },
  { key: "physique.v1.savedFoods", scope: "local", version: 1, includeInBackup: true, owner: "lib/physique/io/repos.ts" },
  { key: "physique.v1.dayFlags", scope: "local", version: 1, includeInBackup: true, owner: "lib/physique/io/repos.ts" },
  { key: "physique.v1.sleepNights", scope: "local", version: 1, includeInBackup: true, owner: "lib/physique/io/repos.ts" },
  { key: "physique.v1.waist", scope: "local", version: 1, includeInBackup: true, owner: "lib/physique/io/repos.ts" },
  { key: "physique.v1.steps", scope: "local", version: 1, includeInBackup: true, owner: "lib/physique/io/repos.ts" },
  { key: "physique.v1.vitals", scope: "local", version: 1, includeInBackup: true, owner: "lib/physique/io/repos.ts" },
  { key: "physique.v1.importMeta", scope: "local", version: 1, includeInBackup: true, owner: "lib/physique/io/dailyLogImport.ts" },
  { key: "physique.v1.goal", scope: "local", version: 1, includeInBackup: true, owner: "lib/physique/io/repos.ts" },
  { key: "physique.v1.goalHistory", scope: "local", version: 1, includeInBackup: true, owner: "lib/physique/io/repos.ts" },
  { key: "physique.v1.profile", scope: "local", version: 1, includeInBackup: true, owner: "lib/physique/io/repos.ts" },
  { key: "physique.v1.program", scope: "local", version: 1, includeInBackup: true, owner: "lib/physique/io/repos.ts" },
  { key: "physique.v1.checkIns", scope: "local", version: 1, includeInBackup: true, owner: "lib/physique/io/repos.ts" },
  { key: "physique.v1.foodPrefs", scope: "local", version: 1, includeInBackup: true, owner: "lib/physique/io/foodData.ts" },
  { key: "physique.v1.healthLink", scope: "local", version: 1, includeInBackup: false, owner: "lib/physique/io/healthLink.ts" },
  { key: "physique.v1.pushLink", scope: "local", version: 1, includeInBackup: false, owner: "lib/physique/io/pushLink.ts" },
  { key: "physique.v1.nativeReminders", scope: "local", version: 1, includeInBackup: false, owner: "lib/physique/io/nativeReminders.ts" },
  { key: "physique.v1.nativeHealth", scope: "local", version: 1, includeInBackup: false, owner: "lib/physique/io/nativeHealth.ts" },
  { key: "physique.v1.healthOptIn", scope: "local", version: 1, includeInBackup: false, owner: "lib/physique/io/healthOptIn.ts" },
  { key: "physique.v1.onboarding", scope: "local", version: 1, includeInBackup: false, owner: "lib/physique/io/onboarding.ts" },
  { key: "physique.v1.musclePriorities", scope: "local", version: 1, includeInBackup: true, owner: "lib/physique/io/musclePriorities.ts" },
  { key: "physique.v1.deload", scope: "local", version: 1, includeInBackup: true, owner: "lib/physique/io/deload.ts" },
  // ── Account and sync (PR4) ──
  { key: "sync.v1.state", scope: "local", version: 1, includeInBackup: false, owner: "lib/sync/run.ts" },
  { key: "sync.v1.auth", scope: "local", version: 1, includeInBackup: false, owner: "lib/sync/client.ts (Supabase session)" },
  // Given on this device, never carried by a backup file (TR1); the account gets its own record (lib/sync/run.ts).
  { key: "consent.v1", scope: "local", version: 1, includeInBackup: false, owner: "lib/consent.ts" },
  // ── Session-scoped handoffs ──
  { key: "assistantQuickPrompt", scope: "session", version: 1, includeInBackup: false, owner: "app/page.tsx → app/assistant" },
  { key: "assistantAutoSend", scope: "session", version: 1, includeInBackup: false, owner: "app/page.tsx → app/assistant" },
  { key: "workoutFromTemplate", scope: "session", version: 1, includeInBackup: false, owner: "app/templates → app/workout" },
  { key: "workoutSuggestedMuscle", scope: "session", version: 1, includeInBackup: false, owner: "app/workout/page.tsx (legacy)" },
  { key: "assistantSessionMarkerV1", scope: "session", version: 1, includeInBackup: false, owner: "lib/assistantThreads.ts" },
] as const satisfies readonly StorageKeyEntry[];

export type RegisteredKey = (typeof STORAGE_KEYS)[number]["key"];

/** localStorage keys that the Data tools export/import covers, in registry order. */
export function backupKeys(): string[] {
  return STORAGE_KEYS.filter((k) => k.scope === "local" && k.includeInBackup).map((k) => k.key);
}

export function isRegisteredKey(key: string): key is RegisteredKey {
  return STORAGE_KEYS.some((k) => k.key === key);
}
