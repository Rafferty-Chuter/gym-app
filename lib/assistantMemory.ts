export type MemoryVersion = 1;

export type AssistantMemoryItem<T> = {
  value: T;
  confidence: number; // 0..1
  source: string; // e.g. "user_message", "user_profile"
  updatedAt: string; // ISO
};

export type AssistantSelectiveMemoryV1 = {
  userId: string;
  memoryVersion: MemoryVersion;
  lastUpdatedAt: string; // ISO
  stablePreferences: {
    priorityLifts: AssistantMemoryItem<string[]>;
    priorityMuscles: AssistantMemoryItem<string[]>;
    deprioritizedMuscles: AssistantMemoryItem<string[]>;
    coachingStylePreferences: AssistantMemoryItem<string[]>;
    recurringConstraints: AssistantMemoryItem<string[]>;
    notesSummary: AssistantMemoryItem<string>;
  };
};

export type RecentConversationTurn = { role: "user" | "assistant"; content: string };

const MEMORY_STORAGE_KEY = "assistantSelectiveMemoryV1";
const USER_ID_STORAGE_KEY = "assistantUserId";

function safeNowIso(): string {
  return new Date().toISOString();
}

function getOrCreateUserId(): string {
  if (typeof window === "undefined") return "server";
  try {
    const raw = window.localStorage.getItem(USER_ID_STORAGE_KEY);
    if (raw && raw.trim()) return raw.trim();
    // Prefer crypto UUID when available.
    const id = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `u_${Math.random().toString(16).slice(2)}`;
    window.localStorage.setItem(USER_ID_STORAGE_KEY, id);
    return id;
  } catch {
    return "unknown";
  }
}

function defaultMemory(userId: string): AssistantSelectiveMemoryV1 {
  return {
    userId,
    memoryVersion: 1,
    lastUpdatedAt: safeNowIso(),
    stablePreferences: {
      priorityLifts: { value: [], confidence: 0, source: "init", updatedAt: safeNowIso() },
      priorityMuscles: { value: [], confidence: 0, source: "init", updatedAt: safeNowIso() },
      deprioritizedMuscles: { value: [], confidence: 0, source: "init", updatedAt: safeNowIso() },
      coachingStylePreferences: { value: [], confidence: 0, source: "init", updatedAt: safeNowIso() },
      recurringConstraints: { value: [], confidence: 0, source: "init", updatedAt: safeNowIso() },
      notesSummary: { value: "", confidence: 0, source: "init", updatedAt: safeNowIso() },
    },
  };
}

export function getSelectiveAssistantMemory(): AssistantSelectiveMemoryV1 {
  const userId = getOrCreateUserId();
  if (typeof window === "undefined") return defaultMemory(userId);
  try {
    const raw = window.localStorage.getItem(MEMORY_STORAGE_KEY);
    if (!raw) return defaultMemory(userId);
    const parsed = JSON.parse(raw) as AssistantSelectiveMemoryV1;
    if (!parsed?.stablePreferences) return defaultMemory(userId);
    return parsed.memoryVersion === 1 ? parsed : defaultMemory(userId);
  } catch {
    return defaultMemory(userId);
  }
}

export function setSelectiveAssistantMemory(memory: AssistantSelectiveMemoryV1): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(MEMORY_STORAGE_KEY, JSON.stringify(memory));
  } catch {
    // ignore storage errors
  }
}

function uniqLower(arr: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const x of arr) {
    const k = x.trim().toLowerCase();
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(x.trim());
  }
  return out;
}

function normalizeCoarseMuscle(input: string): string | null {
  const t = input.toLowerCase().trim();
  if (!t) return null;
  if (/(legs|leg day|lower body|quads|glutes|hamstrings|calves)/.test(t)) return "legs";
  if (/(chest|pecs)/.test(t)) return "chest";
  if (/(back|lats|rows|upper back)/.test(t)) return "back";
  if (/(shoulders|delts)/.test(t)) return "shoulders";
  if (/(arms|biceps|triceps|forearms)/.test(t)) return "arms";
  return null;
}

function mapLiftFromText(t: string): string | null {
  const s = t.toLowerCase();
  if (/(bench press|bench)/.test(s)) return "Bench Press";
  if (/(squat|leg press|hack squat)/.test(s)) return "Squat";
  if (/(deadlift|dead lift|rdl|romanian deadlift)/.test(s)) return "Deadlift";
  return null;
}

type ProposedMemoryUpdates = Partial<AssistantSelectiveMemoryV1["stablePreferences"]>;

function confidenceForListUpdate(explicit: boolean): number {
  // Conservative: only very explicit claims get high confidence.
  return explicit ? 0.9 : 0.65;
}

function shouldSaveUpdate(confidence: number): boolean {
  // Avoid noisy memory; miss a preference rather than store garbage.
  return confidence >= 0.85;
}

export function buildRecentConversationMemory(turns: RecentConversationTurn[], maxTurns = 8): RecentConversationTurn[] {
  const normalized = (turns ?? []).filter((t) => t?.content?.trim());
  return normalized.slice(-maxTurns);
}

export function buildSelectiveMemoryBlock(params: {
  memory: AssistantSelectiveMemoryV1;
  profileHint?: {
    lowerBodyPriority?: "Required" | "Reduced" | "Not a focus";
    trainingPrioritiesText?: string;
  };
}): string {
  const { memory, profileHint } = params;
  const prefs = memory.stablePreferences;

  // Conflict resolution (profile outranks memory):
  const profileText = (profileHint?.trainingPrioritiesText ?? "").toLowerCase();
  const profileMentionsLegs = /(leg(s)?|lower body|quads|hamstrings|glutes|calves|squat|lunge|hinge|rdl)/.test(profileText);
  const profileDeprioLegs = profileHint?.lowerBodyPriority === "Not a focus";

  const deprioritizedMuscles = prefs.deprioritizedMuscles.value;
  const adjustedDeprioritized =
    profileMentionsLegs
      ? // If profile already specifies leg intent, only keep memory if consistent.
        profileDeprioLegs
        ? uniqLower(deprioritizedMuscles)
        : [] // profile says "don't deprioritize legs", so drop memory-driven deprioritization.
      : uniqLower(deprioritizedMuscles);

  console.log("[memory-debug] conflict resolution", {
    profileMentionsLegs,
    profileDeprioLegs,
    memoryDeprioritizedMuscles: deprioritizedMuscles,
    adjustedDeprioritizedMuscles: adjustedDeprioritized,
  });

  const blocks: string[] = [];
  const prLifts = prefs.priorityLifts.value;
  if (prLifts.length) blocks.push(`- Priority lifts: ${prLifts.join(", ")}`);
  const prMuscles = prefs.priorityMuscles.value;
  if (prMuscles.length) blocks.push(`- Priority muscles: ${prMuscles.join(", ")}`);
  if (adjustedDeprioritized.length) blocks.push(`- Deprioritized muscles: ${adjustedDeprioritized.join(", ")}`);
  const style = prefs.coachingStylePreferences.value;
  if (style.length) blocks.push(`- Coaching style: ${style.join(", ")}`);
  const constraints = prefs.recurringConstraints.value;
  if (constraints.length) blocks.push(`- Constraints: ${constraints.join(", ")}`);
  const notes = prefs.notesSummary.value;
  if (notes?.trim()) blocks.push(`- Notes: ${notes.trim()}`);

  return blocks.length ? blocks.join("\n") : "- None saved yet";
}

export function extractMemoryProposalsFromConversation(params: {
  userText: string;
  assistantText: string;
  explicitProfile?: {
    priorityGoal?: string;
    trainingPrioritiesText?: string;
    lowerBodyPriority?: "Required" | "Reduced" | "Not a focus";
  };
}): ProposedMemoryUpdates {
  const t = `${params.userText ?? ""}\n${params.assistantText ?? ""}`.toLowerCase();
  const user = (params.userText ?? "").toLowerCase();
  const priorityGoal = params.explicitProfile?.priorityGoal ?? "";
  const lowerBodyPriority = params.explicitProfile?.lowerBodyPriority;

  const proposals: ProposedMemoryUpdates = {};

  // Priority lifts (bench/squat/deadlift).
  // Require "priority" or "main" style language.
  if (/(bench|deadlift|squat).{0,20}(priority|main|most important|top)/.test(t) || /(priority|main|most important|top).{0,20}(bench|deadlift|squat)/.test(t)) {
    const lift = mapLiftFromText(t);
    if (lift) {
      const alreadyInGoal =
        (priorityGoal === "Increase Bench Press" && lift === "Bench Press") ||
        (priorityGoal === "Increase Squat" && lift === "Squat") ||
        (priorityGoal === "Increase Deadlift" && lift === "Deadlift");
      if (!alreadyInGoal) {
      proposals.priorityLifts = {
        value: uniqLower([lift]),
        confidence: confidenceForListUpdate(true),
        source: "user_message",
        updatedAt: safeNowIso(),
      };
      }
    }
  }

  // Priority muscles.
  const muscleIntentHigh =
    /(priority|main|most important|focus|emphasis).{0,50}(chest|arms|biceps|triceps|back|legs|lower body|shoulders)/.test(t) ||
    /(chest|arms|back|legs|lower body|shoulders).{0,50}(priority|main|most important|focus|emphasis)/.test(t);
  if (muscleIntentHigh) {
    const muscles: string[] = [];
    for (const coarse of ["chest", "arms", "back", "legs", "shoulders"]) {
      if (new RegExp(coarse, "i").test(t)) muscles.push(coarse);
    }
    if (muscles.length) {
      proposals.priorityMuscles = {
        value: uniqLower(muscles),
        confidence: confidenceForListUpdate(true),
        source: "user_message",
        updatedAt: safeNowIso(),
      };
    }
  }

  // Deprioritize legs / keep them light.
  const legsDeprioExplicit =
    /(avoid|skip|don't want|dont want|no legs|not a focus|matter less|less important|keep legs? light|ticking over).{0,50}(legs|leg day|lower body)/.test(t) ||
    /(legs|leg day|lower body).{0,50}(avoid|skip|don't want|dont want|not a focus|matter less|keep legs? light|ticking over)/.test(t);
  if (legsDeprioExplicit) {
    const profileAlreadyDeprioritizesLegs = lowerBodyPriority === "Not a focus";
    if (!profileAlreadyDeprioritizesLegs) {
    proposals.deprioritizedMuscles = {
      value: uniqLower(["legs"]),
      confidence: confidenceForListUpdate(true),
      source: "user_message",
      updatedAt: safeNowIso(),
    };
    }
  }

  // Coaching style preferences.
  const directPref =
    /(be direct|direct and concise|short and clear|no fluff|keep it concise|answer straight)/.test(user) ||
    /(prefer.*direct|prefer.*concise|i like.*direct|i prefer.*direct)/.test(user);
  if (directPref) {
    proposals.coachingStylePreferences = {
      value: uniqLower(["direct", "concise"]),
      confidence: confidenceForListUpdate(true),
      source: "user_message",
      updatedAt: safeNowIso(),
    };
  }

  // Fatigue / recovery watched closely.
  const fatiguePref =
    /(fatigue|recovery).{0,30}(watch|careful|care|closely|monitor|safely)/.test(t) ||
    /(avoid.{0,20}fatigue|don't burn out)/.test(user);
  if (fatiguePref) {
    proposals.coachingStylePreferences = {
      value: uniqLower([...(proposals.coachingStylePreferences?.value ?? []), "watch fatigue", "recovery-aware"]),
      confidence: confidenceForListUpdate(true),
      source: "user_message",
      updatedAt: safeNowIso(),
    };
  }

  // Recurring constraints: avoid joint irritation by name.
  // Example: "avoid irritating my left shoulder"
  const constraintMatch = user.match(/avoid (irritating|pain|aggravating)\s*(my\s*)?(left|right)?\s*(shoulder|knee|elbow|wrist|back)/i);
  if (constraintMatch) {
    const side = constraintMatch[3] ? `${constraintMatch[3]} ` : "";
    const joint = constraintMatch[4];
    proposals.recurringConstraints = {
      value: uniqLower([`${side}${joint} irritation`]),
      confidence: confidenceForListUpdate(true),
      source: "user_message",
      updatedAt: safeNowIso(),
    };
  }

  // Notes summary: only if we have at least one high-confidence update.
  const anyHigh =
    [proposals.priorityLifts?.confidence, proposals.priorityMuscles?.confidence, proposals.deprioritizedMuscles?.confidence, proposals.coachingStylePreferences?.confidence, proposals.recurringConstraints?.confidence].some(
      (c) => typeof c === "number" && shouldSaveUpdate(c)
    );
  if (anyHigh) {
    proposals.notesSummary = {
      value: "Saved preferences extracted from your coaching notes.",
      confidence: 0.9,
      source: "user_message",
      updatedAt: safeNowIso(),
    };
  }

  return proposals;
}

function mergeMemoryListItem(old: string[], next: string[]): string[] {
  return uniqLower([...old, ...next]);
}

export function applySelectiveMemoryUpdates(params: {
  current: AssistantSelectiveMemoryV1;
  proposals: ProposedMemoryUpdates;
}): AssistantSelectiveMemoryV1 {
  const next = structuredClone(params.current);
  let changed = false;

  const sp = next.stablePreferences;
  const up = params.proposals;

  if (up.priorityLifts && shouldSaveUpdate(up.priorityLifts.confidence)) {
    sp.priorityLifts.value = mergeMemoryListItem(sp.priorityLifts.value, up.priorityLifts.value);
    sp.priorityLifts.confidence = Math.max(sp.priorityLifts.confidence, up.priorityLifts.confidence);
    sp.priorityLifts.source = up.priorityLifts.source;
    sp.priorityLifts.updatedAt = safeNowIso();
    changed = true;
  }
  if (up.priorityMuscles && shouldSaveUpdate(up.priorityMuscles.confidence)) {
    sp.priorityMuscles.value = mergeMemoryListItem(sp.priorityMuscles.value, up.priorityMuscles.value);
    sp.priorityMuscles.confidence = Math.max(sp.priorityMuscles.confidence, up.priorityMuscles.confidence);
    sp.priorityMuscles.source = up.priorityMuscles.source;
    sp.priorityMuscles.updatedAt = safeNowIso();
    changed = true;
  }
  if (up.deprioritizedMuscles && shouldSaveUpdate(up.deprioritizedMuscles.confidence)) {
    sp.deprioritizedMuscles.value = mergeMemoryListItem(sp.deprioritizedMuscles.value, up.deprioritizedMuscles.value);
    sp.deprioritizedMuscles.confidence = Math.max(sp.deprioritizedMuscles.confidence, up.deprioritizedMuscles.confidence);
    sp.deprioritizedMuscles.source = up.deprioritizedMuscles.source;
    sp.deprioritizedMuscles.updatedAt = safeNowIso();
    changed = true;
  }
  if (up.coachingStylePreferences && shouldSaveUpdate(up.coachingStylePreferences.confidence)) {
    sp.coachingStylePreferences.value = mergeMemoryListItem(sp.coachingStylePreferences.value, up.coachingStylePreferences.value);
    sp.coachingStylePreferences.confidence = Math.max(sp.coachingStylePreferences.confidence, up.coachingStylePreferences.confidence);
    sp.coachingStylePreferences.source = up.coachingStylePreferences.source;
    sp.coachingStylePreferences.updatedAt = safeNowIso();
    changed = true;
  }
  if (up.recurringConstraints && shouldSaveUpdate(up.recurringConstraints.confidence)) {
    sp.recurringConstraints.value = mergeMemoryListItem(sp.recurringConstraints.value, up.recurringConstraints.value);
    sp.recurringConstraints.confidence = Math.max(sp.recurringConstraints.confidence, up.recurringConstraints.confidence);
    sp.recurringConstraints.source = up.recurringConstraints.source;
    sp.recurringConstraints.updatedAt = safeNowIso();
    changed = true;
  }
  if (up.notesSummary && shouldSaveUpdate(up.notesSummary.confidence)) {
    sp.notesSummary.value = up.notesSummary.value;
    sp.notesSummary.confidence = Math.max(sp.notesSummary.confidence, up.notesSummary.confidence);
    sp.notesSummary.source = up.notesSummary.source;
    sp.notesSummary.updatedAt = safeNowIso();
    changed = true;
  }

  if (!changed) return params.current;

  next.lastUpdatedAt = safeNowIso();
  return next;
}

