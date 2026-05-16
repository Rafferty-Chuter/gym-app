import { devLog } from "@/lib/devLog";

export type AssistantThreadMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  /** LLM coach intro shown above structured workout cards in the UI. */
  coachReview?: string;
  /** Short labels for sources the model relied on; rendered as a quiet expander. */
  dataSources?: string[];
  workout?: {
    sessionTitle: string;
    sessionGoal: string;
    exercises: Array<{
      slot: string;
      exercise: string;
      sets: string;
      reps: string;
      rir: string;
      rest: string;
    }>;
    note: string;
  };
  createdAt: string; // ISO
};

export type AssistantThread = {
  thread_id: string;
  created_at: string; // ISO
  updated_at: string; // ISO
  title?: string;
  summary?: string;
  messages: AssistantThreadMessage[];
};

const THREADS_STORAGE_KEY = "assistantThreadsV1";
const ACTIVE_THREAD_ID_KEY = "assistantActiveThreadIdV1";
const USER_ID_KEY = "assistantUserId";
const MEMORY_VERSION = 1;
/** sessionStorage flag — present for the lifetime of a tab/window. Absence = fresh app session. */
const SESSION_MARKER_KEY = "assistantSessionMarkerV1";

function safeNowIso(): string {
  return new Date().toISOString();
}

function getOrCreateUserId(): string {
  if (typeof window === "undefined") return "server";
  try {
    const raw = window.localStorage.getItem(USER_ID_KEY);
    if (raw && raw.trim()) return raw.trim();
    const id =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `u_${Math.random().toString(16).slice(2)}`;
    window.localStorage.setItem(USER_ID_KEY, id);
    return id;
  } catch {
    return "unknown";
  }
}

function makeThreadId(): string {
  const userId = getOrCreateUserId();
  const rand =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(16).slice(2, 10);
  return `t_${userId}_${Date.now()}_${rand}_v${MEMORY_VERSION}`;
}

type StoredThreadMap = Record<string, AssistantThread>;

function readThreads(): StoredThreadMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(THREADS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as StoredThreadMap;
  } catch {
    return {};
  }
}

function writeThreads(map: StoredThreadMap) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(THREADS_STORAGE_KEY, JSON.stringify(map));
  } catch {
    // ignore storage errors
  }
}

function readActiveThreadId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(ACTIVE_THREAD_ID_KEY);
    return raw && raw.trim() ? raw.trim() : null;
  } catch {
    return null;
  }
}

function writeActiveThreadId(threadId: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(ACTIVE_THREAD_ID_KEY, threadId);
  } catch {
    // ignore
  }
}

function safeTrimContent(s: string): string {
  return String(s ?? "")
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trimEnd())
    .join("\n")
    .trim();
}

function normalizeThreadMessage(m: unknown): AssistantThreadMessage | null {
  if (!m || typeof m !== "object") return null;
  const r = m as Partial<AssistantThreadMessage>;
  if (r.role !== "user" && r.role !== "assistant") return null;
  if (typeof r.content !== "string") return null;
  const id = typeof r.id === "string" && r.id.trim() ? r.id : `m_${Math.random().toString(16).slice(2)}`;
  const coachReview =
    typeof r.coachReview === "string" && r.coachReview.trim() ? safeTrimContent(r.coachReview) : undefined;
  const dataSources = Array.isArray(r.dataSources)
    ? r.dataSources
        .filter((s): s is string => typeof s === "string")
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 8)
    : undefined;
  return {
    id,
    role: r.role,
    content: safeTrimContent(r.content),
    ...(coachReview ? { coachReview } : {}),
    ...(dataSources && dataSources.length > 0 ? { dataSources } : {}),
    ...(r.workout && typeof r.workout === "object"
      ? {
          workout: r.workout as AssistantThreadMessage["workout"],
        }
      : {}),
    createdAt: typeof r.createdAt === "string" && r.createdAt ? r.createdAt : safeNowIso(),
  };
}

function normalizeThread(t: unknown): AssistantThread | null {
  if (!t || typeof t !== "object") return null;
  const r = t as Partial<AssistantThread>;
  if (typeof r.thread_id !== "string" || !r.thread_id.trim()) return null;
  const created_at = typeof r.created_at === "string" && r.created_at ? r.created_at : safeNowIso();
  const updated_at = typeof r.updated_at === "string" && r.updated_at ? r.updated_at : created_at;
  const messagesRaw = Array.isArray(r.messages) ? r.messages : [];
  const messages = messagesRaw.map(normalizeThreadMessage).filter(Boolean) as AssistantThreadMessage[];
  return {
    thread_id: r.thread_id,
    created_at,
    updated_at,
    title: typeof r.title === "string" ? r.title : undefined,
    summary: typeof r.summary === "string" ? r.summary : undefined,
    messages,
  };
}

export function loadActiveThread(): {
  threadId: string;
  thread: AssistantThread;
  exactThreadLoaded: boolean;
  createdNewThread: boolean;
} {
  // Server-safe fallback: no threads available.
  if (typeof window === "undefined") {
    const now = safeNowIso();
    return {
      threadId: "server",
      thread: {
        thread_id: "server",
        created_at: now,
        updated_at: now,
        messages: [],
      },
      exactThreadLoaded: false,
      createdNewThread: false,
    };
  }

  const map = readThreads();
  const activeId = readActiveThreadId();
  if (activeId && map[activeId]) {
    const normalized = normalizeThread(map[activeId]);
    if (normalized) {
      return {
        threadId: activeId,
        thread: normalized,
        exactThreadLoaded: true,
        createdNewThread: false,
      };
    }
  }

  // Create new thread if none exists. We do NOT claim exact prior memory.
  const now = safeNowIso();
  const newId = makeThreadId();
  const newThread: AssistantThread = {
    thread_id: newId,
    created_at: now,
    updated_at: now,
    messages: [],
  };
  const nextMap: StoredThreadMap = { ...map, [newId]: newThread };
  writeThreads(nextMap);
  writeActiveThreadId(newId);
  return {
    threadId: newId,
    thread: newThread,
    exactThreadLoaded: false,
    createdNewThread: true,
  };
}

export function getThreadById(threadId: string): AssistantThread | null {
  if (typeof window === "undefined") return null;
  const map = readThreads();
  if (!map[threadId]) return null;
  return normalizeThread(map[threadId]);
}

export function appendToThread(params: {
  threadId: string;
  role: "user" | "assistant";
  content: string;
  coachReview?: string;
  dataSources?: string[];
  workout?: AssistantThreadMessage["workout"];
}): AssistantThread {
  if (typeof window === "undefined") {
    const now = safeNowIso();
    return {
      thread_id: params.threadId,
      created_at: now,
      updated_at: now,
      messages: [
        {
          id: `m_${Math.random().toString(16).slice(2)}`,
          role: params.role,
          content: safeTrimContent(params.content),
          ...(params.coachReview?.trim()
            ? { coachReview: safeTrimContent(params.coachReview) }
            : {}),
          ...(params.dataSources && params.dataSources.length > 0
            ? { dataSources: params.dataSources.slice(0, 8) }
            : {}),
          ...(params.workout ? { workout: params.workout } : {}),
          createdAt: now,
        },
      ],
    };
  }

  const map = readThreads();
  const existing = map[params.threadId];
  const normalizedExisting = existing ? normalizeThread(existing) : null;
  const thread: AssistantThread =
    normalizedExisting ??
    ({
      thread_id: params.threadId,
      created_at: safeNowIso(),
      updated_at: safeNowIso(),
      messages: [],
    } as AssistantThread);

  const now = safeNowIso();
  const nextMsg: AssistantThreadMessage = {
    id: `m_${Math.random().toString(16).slice(2)}`,
    role: params.role,
    content: safeTrimContent(params.content),
    ...(params.coachReview?.trim()
      ? { coachReview: safeTrimContent(params.coachReview) }
      : {}),
    ...(params.workout ? { workout: params.workout } : {}),
    createdAt: now,
  };
  const nextThread: AssistantThread = {
    ...thread,
    updated_at: now,
    messages: [...thread.messages, nextMsg],
  };

  const nextMap: StoredThreadMap = { ...map, [params.threadId]: nextThread };
  writeThreads(nextMap);
  // Keep this thread as active for continuity.
  writeActiveThreadId(params.threadId);

  return nextThread;
}

export function getActiveThreadId(): string | null {
  return readActiveThreadId();
}

/**
 * True on the first mount within a new tab/window. Tied to sessionStorage,
 * which clears when the tab closes — so reopening the app counts as fresh.
 * Same-tab navigation keeps the marker, so moving between in-app routes
 * does not reset the chat.
 */
export function isFreshAppSession(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return !window.sessionStorage.getItem(SESSION_MARKER_KEY);
  } catch {
    return false;
  }
}

export function markAppSessionActive(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(SESSION_MARKER_KEY, "1");
  } catch {
    /* ignore */
  }
}

/**
 * Reads the persisted active thread without creating one when absent. Used
 * during fresh-session bootstrap to pull prior messages for memory extraction
 * before the previous thread is discarded.
 */
export function peekActiveThread(): AssistantThread | null {
  if (typeof window === "undefined") return null;
  const map = readThreads();
  const activeId = readActiveThreadId();
  if (!activeId || !map[activeId]) return null;
  return normalizeThread(map[activeId]);
}

/**
 * Clears all persisted threads from localStorage. Called after a fresh session
 * has captured durable facts from the prior thread into USER MEMORY — the
 * raw transcript no longer serves a purpose.
 */
export function clearAllThreads(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(THREADS_STORAGE_KEY);
    window.localStorage.removeItem(ACTIVE_THREAD_ID_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Start a fresh assistant thread (empty messages, new id). Does not delete the previous thread
 * from storage — it remains in `assistantThreadsV1` but is no longer active.
 * Does not touch workout logs, profile, templates, or selective assistant memory.
 */
export function createNewChatThread(): {
  threadId: string;
  thread: AssistantThread;
  exactThreadLoaded: boolean;
  createdNewThread: boolean;
} {
  if (typeof window === "undefined") {
    const now = safeNowIso();
    return {
      threadId: "server",
      thread: {
        thread_id: "server",
        created_at: now,
        updated_at: now,
        messages: [],
      },
      exactThreadLoaded: false,
      createdNewThread: true,
    };
  }

  const map = readThreads();
  const now = safeNowIso();
  const newId = makeThreadId();
  const newThread: AssistantThread = {
    thread_id: newId,
    created_at: now,
    updated_at: now,
    messages: [],
  };
  const nextMap: StoredThreadMap = { ...map, [newId]: newThread };
  writeThreads(nextMap);
  writeActiveThreadId(newId);

  if (process.env.NODE_ENV === "development") {
    devLog("[thread-debug] createNewChatThread", {
      threadId: newId,
      freshThread: true,
      priorActivePreservedInMap: true,
      totalThreadsInStorage: Object.keys(nextMap).length,
    });
  }

  return {
    threadId: newId,
    thread: newThread,
    exactThreadLoaded: true,
    createdNewThread: true,
  };
}

